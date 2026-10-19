// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Use-cases of plan §4.3 for flow S1: AskQuestion, SuggestReplies, CommitUtterance and SynthesizeSpeech, plus those
// behind the MCP tools of plan §4.4: GetAnswer, GetRecentMessages and AddProfileFact.

import { EventEmitter, once } from 'node:events'; // wakes a waiting get_answer
import { cleanDrafts, defaultCandidates, defaultsFor, dropBanned, optionCandidates, toCandidates } from '../domain/candidates.ts'; // reply pipeline
import type { DailyCap } from '../domain/dailyCap.ts'; // cost guard
import { DEMO_HOUSEHOLD, FACTS_MAX, type ProfileFact } from '../domain/facts.ts'; // the one household for now, and its fact limit
import type { Question, Utterance } from '../domain/model.ts'; // the model
import type { LlmPort, Log, NotifierPort, StorePort, SuggestRequest, TracePort, TtsPort } from '../ports/index.ts'; // ports

/** Everything the use-cases need, wired by compose.ts (or by a test). */
export interface Deps { // ports and settings
  mode: 'mock' | 'live'; // SAY_WHEN_MODE
  store: StorePort; // persistence
  notifier: NotifierPort; // pushes to the TV
  trace: TracePort; // spans for the studio
  log: Log; // JSON log lines
  clock: () => number; // ClockPort: epoch milliseconds
  newId: () => string; // IdPort: random identifiers
  llm: { live: LlmPort | null; mock: LlmPort; cap: DailyCap; budgetMs: number }; // live is null in mock mode
  tts: { live: TtsPort | null; mock: TtsPort; cap: DailyCap }; // live is null in mock mode
} // end of Deps

/** Body of POST /v1/utterances after validation. */
export interface CommitInput { // a committed reply with its selection statistics
  question_id: string | null; // the question it answers; null for a reply to a local fixture question
  question_text: string | null; // the fixture question's text, sent by the TV; ignored when question_id names a question
  text: string; // the words
  clicks: number; // presses that made the selection
  duration_ms: number; // from the question appearing to the commit
} // end of CommitInput

/** Result of CommitUtterance. */
export interface CommitResult { // what the REST layer returns
  utterance: Utterance; // the stored utterance
  created: boolean; // false when the idempotency key was seen before
  hasAudio: boolean; // whether GET /v1/utterances/{id}/audio has audio
} // end of CommitResult

/** What get_answer returns (plan Table 16). */
export interface Answer { // the answer, or why there is none
  status: Question['status']; // pending, answered or expired
  answer_text: string | null; // what Sam said, once answered
  answered_at: string | null; // when it was committed, ISO 8601 UTC
  clicks: number | null; // presses that made the selection
} // end of Answer

/** One item of get_recent_messages (plan Table 16). */
export interface Message { // something Sam said
  text: string; // the words
  time: string; // when, ISO 8601 UTC
  kind: Utterance['kind']; // reply or spontaneous
  question_text: string | null; // the question it answered, if there is one
} // end of Message

/** An utterance or get_answer names a question that does not exist. */
export class NotFoundError extends Error {} // mapped to 404 by the REST layer, to a tool error by MCP

/** The household already has FACTS_MAX facts. */
export class FactLimitError extends Error {} // mapped to a tool error by MCP

const TURNS = 6; // plan §4.6: up to six recent turns
const REPLAY_MS = 120_000; // a TV that connects within 2 minutes of a question still gets it; an older one is stale

/** The use-cases, sharing one set of ports. */
export function createUseCases(deps: Deps) { // a closure, so CommitUtterance can track its in-flight requests
  const inflight = new Map<string, Promise<CommitResult>>(); // idempotency keys whose commit is still running
  const iso = () => new Date(deps.clock()).toISOString(); // now, as ISO 8601 UTC
  const settled = new EventEmitter(); // emits a question's id when its answer is stored or it expires
  settled.setMaxListeners(0); // any number of get_answer calls may wait on one question

  /**
   * AskQuestion: expire the open question, store the new one and push it at once. With options, its replies are final
   * and question.candidates follows at once; without, the defaults that fit it go first and SuggestReplies pushes the
   * model's candidates. `delivered` says whether a TV was connected to receive it.
   */
  function askQuestion(text: string, askedBy: string, extra: { options?: readonly string[]; urgency?: Question['urgency'] } = {}): { question: Question; delivered: boolean; suggested: Promise<void> } { // S1 steps 1-5
    const turns = deps.store.recentTurns(TURNS); // the six latest, question then reply
    const open = deps.store.newestPending(); // the household's open question; asking expires it, so there is at most one
    if (open) { // never answered
      deps.store.saveQuestion({ ...open, status: 'expired' }); // replaced by the new one
      settled.emit(open.id); // a get_answer waiting on it returns now
    } // end of the expiry
    const question: Question = { // a new pending question
      id: deps.newId(), // random id
      text, // the question
      asked_by: askedBy, // who asked
      urgency: extra.urgency ?? 'normal', // as asked
      status: 'pending', // not answered yet
      created_at: iso(), // now
      answered_utterance_id: null, // no answer yet
      candidates: extra.options ? optionCandidates(extra.options) : defaultCandidates(text), // plan §4.3 step 1: replies immediately
    }; // end of the question
    deps.store.saveQuestion(question); // persist
    const delivered = deps.notifier.publish({ type: 'question.created', question }) > 0; // to the TV, before any model call
    deps.trace.span({ hop: 'server→tv', operation: 'question.created', duration_ms: 0, mode: deps.mode }); // pushed now
    deps.log('question.created', { question_id: question.id, options: extra.options?.length ?? 0 }); // no text in logs
    if (!extra.options) return { question, delivered, suggested: suggestReplies(question, turns) }; // the caller does not wait for the model
    deps.notifier.publish({ type: 'question.candidates', question_id: question.id, candidates: question.candidates }); // the final list now, so the TV starts its scan without waiting out the budget
    deps.trace.span({ hop: 'server→tv', operation: 'question.candidates', duration_ms: 0, mode: deps.mode }); // pushed now
    return { question, delivered, suggested: Promise.resolve() }; // no model call
  } // end of askQuestion

  /** SuggestReplies: the model's candidates within the budget; on timeout, error or invalid output the defaults stay. */
  async function suggestReplies(question: Question, recentTurns: SuggestRequest['recentTurns']): Promise<void> { // steps 2-5
    const live = deps.llm.live !== null && deps.llm.cap.take(1); // live model, unless mock mode or today's cap is used up
    if (deps.llm.live !== null && !live) deps.log('cap.reached', { cap: 'llm_calls' }); // fell back to mock
    const llm = live ? deps.llm.live! : deps.llm.mock; // the adapter for this call
    const started = deps.clock(); // for the span
    const signal = AbortSignal.timeout(deps.llm.budgetMs); // plan §4.3: 3.5 s budget
    const request = { question: question.text, askedBy: question.asked_by, recentTurns, localTime: hhmm(started), facts: deps.store.profileFacts(DEMO_HOUSEHOLD) }; // §4.6 inputs
    let outcome = 'suggest'; // span operation; a suffix marks failures
    let dropped = 0; // candidates the banned-term filter removed
    try { // the model call
      const raw = await Promise.race([llm.suggest(request, signal), rejectOnAbort(signal)]); // whichever comes first
      const filtered = dropBanned(cleanDrafts(raw)); // validate, trim, cap, de-duplicate, then drop banned terms
      const drafts = filtered.kept; // what may reach the TV
      dropped = filtered.dropped; // for the span; never the text
      const current = deps.store.getQuestion(question.id); // it may have been answered meanwhile
      if (drafts.length === 0) outcome = 'suggest.invalid'; // nothing usable: defaults stay
      else if (current?.status === 'pending') { // still on the TV
        const updated = { ...current, candidates: toCandidates(drafts, defaultsFor(current.text)) }; // merged with the defaults that fit, priors computed
        deps.store.saveQuestion(updated); // persist
        deps.notifier.publish({ type: 'question.candidates', question_id: updated.id, candidates: updated.candidates }); // to the TV
        deps.trace.span({ hop: 'server→tv', operation: 'question.candidates', duration_ms: deps.clock() - started, mode: deps.mode }); // since asked
      } // end of the push
    } catch (error) { // timeout or adapter failure
      outcome = signal.aborted ? 'suggest.timeout' : 'suggest.error'; // which one
      deps.log('suggest.failed', { question_id: question.id, outcome, error: String(error) }); // defaults stay on the TV
    } // end of the model call
    deps.trace.span({ hop: 'server→llm', operation: outcome, duration_ms: deps.clock() - started, mode: live ? 'live' : 'mock', dropped }); // hop
  } // end of suggestReplies

  /** SynthesizeSpeech: MP3 from the live voice, or the mock's WAV tone in mock mode or past today's cap; null on failure. Never throws. */
  async function synthesizeSpeech(text: string): Promise<Uint8Array | null> { // plan §4.3 speech pipeline
    const live = deps.tts.live !== null && deps.tts.cap.take(text.length); // characters count against the daily cap
    if (deps.tts.live !== null && !live) deps.log('cap.reached', { cap: 'tts_chars' }); // fell back to mock
    const tts = live ? deps.tts.live! : deps.tts.mock; // the adapter for this call
    const started = deps.clock(); // for the span
    let audio: Uint8Array | null = null; // no audio unless synthesis succeeds
    let operation = 'synthesize'; // span operation
    try { // the synthesis call
      audio = await tts.synthesize(text); // audio bytes or null
    } catch (error) { // Polly failed: the reply still counts, just without audio
      operation = 'synthesize.error'; // marks the span
      deps.log('synthesize.failed', { error: String(error) }); // no text in logs
    } // end of the call
    deps.trace.span({ hop: 'server→tts', operation, duration_ms: deps.clock() - started, mode: live ? 'live' : 'mock' }); // hop
    return audio; // bytes or null
  } // end of synthesizeSpeech

  /** CommitUtterance: idempotent by key; a retry while the first request still runs gets the same result. */
  function commitUtterance(key: string, input: CommitInput): Promise<CommitResult> { // POST /v1/utterances
    const done = deps.store.utteranceByKey(key); // committed before
    if (done) return Promise.resolve({ utterance: done, created: false, hasAudio: deps.store.getAudio(done.id) !== undefined }); // replay
    const running = inflight.get(key); // still committing
    if (running) return running.then((result) => ({ ...result, created: false })); // wait for it
    const job = commit(key, input).finally(() => inflight.delete(key)); // the first request with this key
    inflight.set(key, job); // visible to retries
    return job; // the result
  } // end of commitUtterance

  async function commit(key: string, input: CommitInput): Promise<CommitResult> { // the actual commit
    const question = input.question_id === null ? null : deps.store.getQuestion(input.question_id); // what it answers
    if (question === undefined) throw new NotFoundError('question not found'); // an id that was never issued
    const id = deps.newId(); // random id, known before the speech so the question can name it
    if (question?.status === 'pending') deps.store.saveQuestion({ ...question, status: 'answered', answered_utterance_id: id }); // answered at once, so a TV that connects during synthesis is not sent it again
    const audio = await synthesizeSpeech(input.text); // speech on commit (plan §3.3)
    const utterance: Utterance = { // the record
      id, // random id
      text: input.text, // the words
      kind: question ? 'reply' : 'spontaneous', // a reply names its question
      question_id: input.question_id, // or null
      question_text: question ? question.text : input.question_text, // the stored question's text wins over the TV's
      clicks: input.clicks, // selection statistics
      duration_ms: input.duration_ms, // selection statistics
      created_at: iso(), // now
    }; // end of the record
    deps.store.addUtterance(utterance, key, audio); // persist with its audio
    if (question) settled.emit(question.id); // the answer is stored: a get_answer waiting on it returns now
    deps.log('utterance.committed', { utterance_id: utterance.id, question_id: utterance.question_id, kind: utterance.kind, clicks: utterance.clicks, duration_ms: utterance.duration_ms, chars: utterance.text.length, audio: audio !== null }); // no text
    return { utterance, created: true, hasAudio: audio !== null }; // new
  } // end of commit

  /** GetAnswer: the question's answer once it is stored; waits up to `waitMs` for it, or until `signal` aborts. */
  async function getAnswer(id: string, waitMs: number, signal?: AbortSignal): Promise<Answer> { // get_answer (long-poll)
    const current = answerOf(id); // throws for an unknown id
    if (current.status !== 'pending' || waitMs <= 0) return current; // settled, or no wait asked for
    const stop = AbortSignal.any([AbortSignal.timeout(waitMs), ...(signal ? [signal] : [])]); // the wait ends, or the agent cancels
    while (answerOf(id).status === 'pending' && !stop.aborted) await once(settled, id, { signal: stop }).catch(() => {}); // a wake-up for another commit of the same question waits on
    return answerOf(id); // as it is now
  } // end of getAnswer

  function answerOf(id: string): Answer { // the question's state as get_answer reports it
    const question = deps.store.getQuestion(id); // by id
    if (!question) throw new NotFoundError('question not found'); // never issued
    const utterance = question.answered_utterance_id === null ? undefined : deps.store.getUtterance(question.answered_utterance_id); // stored once its speech is done
    if (question.status === 'pending' || !utterance) return { status: question.status === 'expired' ? 'expired' : 'pending', answer_text: null, answered_at: null, clicks: null }; // no stored answer
    return { status: 'answered', answer_text: utterance.text, answered_at: utterance.created_at, clicks: utterance.clicks }; // Sam's words
  } // end of answerOf

  /** GetRecentMessages: the last `limit` utterances after `since`, oldest first. */
  function recentMessages(since: string | null, limit: number): Message[] { // get_recent_messages
    return deps.store.recentUtterances(limit, since).map((u) => ({ text: u.text, time: u.created_at, kind: u.kind, question_text: u.question_text })); // what Sam said
  } // end of recentMessages

  /** AddProfileFact: a fact for the household's later questions; refused once it has FACTS_MAX. Returns its id. */
  function addProfileFact(fact: ProfileFact): string { // add_profile_fact
    if (deps.store.profileFacts(DEMO_HOUSEHOLD).length >= FACTS_MAX) throw new FactLimitError(`the profile already has ${FACTS_MAX} facts`); // plan §6.1 limit
    const id = deps.newId(); // random id
    deps.store.addProfileFact(DEMO_HOUSEHOLD, { ...fact, id }); // SuggestReplies reads it for the next question
    deps.log('fact.added', { fact_id: id, category: fact.category }); // never the text
    return id; // fact_id
  } // end of addProfileFact

  /** The audio of an utterance, if it has one. */
  function utteranceAudio(id: string): Uint8Array | undefined { // GET /v1/utterances/{id}/audio
    return deps.store.getAudio(id); // from the store
  } // end of utteranceAudio

  /** The newest unanswered question, if it was asked within REPLAY_MS: replayed to a TV when it connects. */
  function openQuestion(): Question | undefined { // GET /v1/stream on connect
    const question = deps.store.newestPending(); // with its current candidates
    return question && deps.clock() - Date.parse(question.created_at) <= REPLAY_MS ? question : undefined; // recent enough, or nothing
  } // end of openQuestion

  return { askQuestion, commitUtterance, utteranceAudio, openQuestion, getAnswer, recentMessages, addProfileFact }; // the public use-cases
} // end of createUseCases

/** The use-cases object, for typing the REST layer. */
export type UseCases = ReturnType<typeof createUseCases>; // inferred

/** A promise that rejects when the signal aborts, so a slow adapter cannot hold the budget open. */
function rejectOnAbort(signal: AbortSignal): Promise<never> { // the budget's side of the race
  return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); // rejects with the timeout
} // end of rejectOnAbort

/** Local time of day as HH:MM. */
function hhmm(epochMs: number): string { // for the prompt
  return new Date(epochMs).toTimeString().slice(0, 5); // "14:05"
} // end of hhmm
