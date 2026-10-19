// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Use-cases of plan §4.3 for flow S1: AskQuestion, SuggestReplies, CommitUtterance and SynthesizeSpeech.

import { cleanDrafts, defaultCandidates, dropBanned, toCandidates } from '../domain/candidates.ts'; // reply pipeline
import type { DailyCap } from '../domain/dailyCap.ts'; // cost guard
import { DEMO_HOUSEHOLD } from '../domain/facts.ts'; // the one household for now
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

/** An utterance names a question that does not exist. */
export class NotFoundError extends Error {} // mapped to 404 by the REST layer

const TURNS = 6; // plan §4.6: up to six recent turns
const REPLAY_MS = 120_000; // a TV that connects within 2 minutes of a question still gets it; an older one is stale

/** The use-cases, sharing one set of ports. */
export function createUseCases(deps: Deps) { // a closure, so CommitUtterance can track its in-flight requests
  const inflight = new Map<string, Promise<CommitResult>>(); // idempotency keys whose commit is still running
  const iso = () => new Date(deps.clock()).toISOString(); // now, as ISO 8601 UTC

  /** AskQuestion: store it, push it with the defaults at once, then let SuggestReplies push the model's candidates. */
  function askQuestion(text: string, askedBy: string): { question: Question; suggested: Promise<void> } { // S1 steps 1-5
    const turns = deps.store.recentTurns(TURNS); // the six latest, question then reply
    const question: Question = { // a new pending question
      id: deps.newId(), // random id
      text, // the question
      asked_by: askedBy, // who asked
      status: 'pending', // not answered yet
      created_at: iso(), // now
      answered_utterance_id: null, // no answer yet
      candidates: defaultCandidates(), // plan §4.3 step 1: defaults immediately
    }; // end of the question
    deps.store.saveQuestion(question); // persist
    deps.notifier.publish({ type: 'question.created', question }); // to the TV, before any model call
    deps.trace.span({ hop: 'server→tv', operation: 'question.created', duration_ms: 0, mode: deps.mode }); // pushed now
    deps.log('question.created', { question_id: question.id }); // no text in logs
    return { question, suggested: suggestReplies(question, turns) }; // the caller does not wait for the model
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
        const updated = { ...current, candidates: toCandidates(drafts) }; // merged with defaults, priors computed
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
    deps.log('utterance.committed', { utterance_id: utterance.id, question_id: utterance.question_id, kind: utterance.kind, clicks: utterance.clicks, duration_ms: utterance.duration_ms, chars: utterance.text.length, audio: audio !== null }); // no text
    return { utterance, created: true, hasAudio: audio !== null }; // new
  } // end of commit

  /** The audio of an utterance, if it has one. */
  function utteranceAudio(id: string): Uint8Array | undefined { // GET /v1/utterances/{id}/audio
    return deps.store.getAudio(id); // from the store
  } // end of utteranceAudio

  /** The newest unanswered question, if it was asked within REPLAY_MS: replayed to a TV when it connects. */
  function openQuestion(): Question | undefined { // GET /v1/stream on connect
    const question = deps.store.newestPending(); // with its current candidates
    return question && deps.clock() - Date.parse(question.created_at) <= REPLAY_MS ? question : undefined; // recent enough, or nothing
  } // end of openQuestion

  return { askQuestion, commitUtterance, utteranceAudio, openQuestion }; // the public use-cases
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
