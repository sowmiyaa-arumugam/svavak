// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Use-cases with fake ports: the reply pipeline (defaults first, budget, fallbacks, caps) and idempotent commits.

import { describe, expect, it } from 'vitest'; // test API
import { MemoryStore } from '../src/adapters/memoryStore.ts'; // the real in-memory store
import { MockLlm } from '../src/adapters/mockLlm.ts'; // the real mock model
import { MockTts } from '../src/adapters/mockTts.ts'; // the real mock speech
import { createUseCases, FactLimitError, NotFoundError, type Deps } from '../src/application/useCases.ts'; // tested
import { BANNED_TERMS } from '../src/domain/candidates.ts'; // the banned-term list
import { DailyCap } from '../src/domain/dailyCap.ts'; // cost guard
import { DEMO_FACTS, DEMO_HOUSEHOLD, type ProfileFact } from '../src/domain/facts.ts'; // profile facts
import type { Span, StreamEvent } from '../src/domain/model.ts'; // shapes
import type { LlmPort, SuggestRequest, TtsPort } from '../src/ports/index.ts'; // ports

const TEA = { candidates: [{ text: 'Tea, please', intent: 'choice', score: 0.6 }, { text: 'Coffee, please', intent: 'choice', score: 0.4 }] }; // a model answer

/** Use-cases over fake ports that record what they receive. */
function setup(patch: { llm?: Partial<Deps['llm']>; tts?: Partial<Deps['tts']>; facts?: Record<string, readonly ProfileFact[]>; tvs?: number } = {}) { // fresh world per test
  let now = Date.parse('2026-10-19T10:00:00Z'); // fixed time, moved on by advance()
  let n = 0; // id counter
  const events: StreamEvent[] = []; // pushed to the TV
  const spans: Omit<Span, 'id' | 'at'>[] = []; // trace
  const logs: Record<string, unknown>[] = []; // log lines
  const store = new MemoryStore(patch.facts); // real store, with the test's profile facts
  const clock = () => now; // the fake clock
  const deps: Deps = { // the ports
    mode: 'mock', // server mode
    store, // store
    notifier: { publish: (e) => { events.push(e); return patch.tvs ?? 1; } }, // records events; one TV connected unless the test says otherwise
    trace: { span: (s) => spans.push(s) }, // records spans
    log: (msg, fields) => logs.push({ msg, ...fields }), // records logs
    clock, // time
    newId: () => `id${++n}`, // predictable ids
    llm: { live: null, mock: new MockLlm(), cap: new DailyCap(1000, clock), budgetMs: 200, ...patch.llm }, // replies
    tts: { live: null, mock: new MockTts(), cap: new DailyCap(100_000, clock), ...patch.tts }, // speech
  }; // end of deps
  const advance = (ms: number) => { now += ms; }; // moves the clock on
  return { uc: createUseCases(deps), events, spans, logs, store, advance }; // what tests inspect
} // end of setup

/** A model that answers with `output` and records each request. */
function fakeLlm(output: unknown, calls: SuggestRequest[] = []): LlmPort { // fake LLM
  return { suggest: async (request) => { calls.push(request); return output; } }; // immediate answer
} // end of fakeLlm

const commit = { question_id: null, question_text: null, text: 'Tea, please', clicks: 2, duration_ms: 3400 }; // a commit body

describe('askQuestion and suggestReplies', () => { // S1 steps 1 to 5
  it('pushes the question with the defaults at once, then the model candidates', async () => { // defaults first
    const { uc, events, store, spans } = setup(); // mock model
    const { question, suggested } = uc.askQuestion('Would you like tea or coffee?', 'Alex'); // ask
    expect(events).toEqual([{ type: 'question.created', question }]); // before the model has answered
    expect(question.candidates.map((c) => c.text)).toEqual(['Tea, please', 'Coffee, please', 'You decide', 'Not sure', 'Tell me more', 'Not now']); // a choice question's options, then its four defaults, fallbacks last
    await suggested; // the model's turn
    const pushed = events[1]; // the second event
    expect(pushed?.type).toBe('question.candidates'); // candidates follow
    if (pushed?.type !== 'question.candidates') throw new Error('unreachable'); // narrow the type
    expect(pushed.question_id).toBe(question.id); // for this question
    expect(pushed.candidates.slice(0, 2).map((c) => c.text)).toEqual(['Tea, please', 'Coffee, please']); // mock choice replies
    expect(store.getQuestion(question.id)?.candidates).toEqual(pushed.candidates); // stored too
    expect(spans).toContainEqual(expect.objectContaining({ hop: 'server→llm', operation: 'suggest', mode: 'mock', dropped: 0 })); // traced, nothing filtered
  }); // end of the case

  it('drops a candidate with a banned term and counts it in the span, never logging or tracing the text', async () => { // plan §4.6 filter
    const rude = `What a ${BANNED_TERMS[0]}`; // a candidate with the first listed term
    const { uc, events, spans, logs } = setup({ llm: { mock: fakeLlm({ candidates: [{ text: rude, intent: 'social', score: 0.9 }, ...TEA.candidates] }) } }); // a model that swears
    await uc.askQuestion('Tea or coffee?', 'Alex').suggested; // ask
    const pushed = events.find((e) => e.type === 'question.candidates'); // the model's candidates
    if (pushed?.type !== 'question.candidates') throw new Error('no candidates pushed'); // narrow the type
    expect(pushed.candidates.map((c) => c.text)).not.toContain(rude); // filtered out
    expect(pushed.candidates.slice(0, 2).map((c) => c.text)).toEqual(['Tea, please', 'Coffee, please']); // the rest kept
    expect(spans).toContainEqual(expect.objectContaining({ hop: 'server→llm', operation: 'suggest', dropped: 1 })); // counted
    expect(JSON.stringify([spans, logs]).toLowerCase()).not.toContain(BANNED_TERMS[0]); // the text is nowhere
  }); // end of the case

  it('keeps the defaults when the model misses the budget', async () => { // timeout
    const never: LlmPort = { suggest: () => new Promise(() => {}) }; // never answers
    const { uc, events, spans, logs } = setup({ llm: { mock: never, budgetMs: 30 } }); // short budget
    await uc.askQuestion('Tea?', 'Alex').suggested; // resolves when the budget runs out
    expect(events.map((e) => e.type)).toEqual(['question.created']); // no candidates event
    expect(spans).toContainEqual(expect.objectContaining({ hop: 'server→llm', operation: 'suggest.timeout', dropped: 0 })); // traced
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'suggest.failed', outcome: 'suggest.timeout' })); // logged
  }); // end of the case

  it('keeps the defaults when the model fails or returns nothing usable', async () => { // error and invalid output
    const failing: LlmPort = { suggest: async () => { throw new Error('throttled'); } }; // adapter error
    const a = setup({ llm: { mock: failing } }); // failing model
    await a.uc.askQuestion('Tea?', 'Alex').suggested; // ask
    expect(a.spans).toContainEqual(expect.objectContaining({ operation: 'suggest.error', dropped: 0 })); // error span
    const b = setup({ llm: { mock: fakeLlm({ candidates: [{ text: '', intent: 'yes', score: 1 }] }) } }); // nothing valid
    await b.uc.askQuestion('Tea?', 'Alex').suggested; // ask
    expect(b.spans).toContainEqual(expect.objectContaining({ operation: 'suggest.invalid' })); // invalid span
    expect([...a.events, ...b.events].map((e) => e.type)).toEqual(['question.created', 'question.created']); // defaults stay
  }); // end of the case

  it('uses the live model until the daily cap, then falls back to mock', async () => { // cost guard
    const calls: SuggestRequest[] = []; // live requests
    const { uc, spans, logs } = setup({ llm: { live: fakeLlm(TEA, calls), cap: new DailyCap(1, () => 0) } }); // one live call a day
    await uc.askQuestion('Tea or coffee?', 'Alex').suggested; // live
    await uc.askQuestion('Shall I open the window?', 'Alex').suggested; // over the cap: mock
    expect(calls).toHaveLength(1); // the live model saw one request
    expect(spans.filter((s) => s.hop === 'server→llm').map((s) => s.mode)).toEqual(['live', 'mock']); // modes traced
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'cap.reached', cap: 'llm_calls' })); // logged
  }); // end of the case

  it('sends the question, who asked, the time, the six latest turns and the household facts to the model', async () => { // §4.6 inputs
    const calls: SuggestRequest[] = []; // requests
    const { uc } = setup({ llm: { mock: fakeLlm(TEA, calls) }, facts: { [DEMO_HOUSEHOLD]: DEMO_FACTS, other: [{ text: 'Not this household', category: 'other' }] } }); // recording model, seeded facts
    for (let i = 1; i <= 6; i++) await uc.commitUtterance(`f${i}`, { ...commit, question_text: i === 6 ? null : `Fixture ${i}?`, text: `Reply ${i}` }); // replies to the TV's fixture questions; the sixth spontaneous
    await uc.askQuestion('Open the window?', 'Alex').suggested; // never answered, so never a turn
    const first = uc.askQuestion('Tea or coffee?', 'Alex'); // a server question
    await first.suggested; // its candidates
    await uc.commitUtterance('k1', { ...commit, question_id: first.question.id, question_text: 'Ignored?' }); // answered; the stored text wins
    await uc.askQuestion('Milk?', 'Alex').suggested; // the question under test
    expect(calls[2]).toEqual({ question: 'Milk?', askedBy: 'Alex', localTime: expect.stringMatching(/^\d\d:\d\d$/), facts: DEMO_FACTS, recentTurns: [ // the six latest, oldest first
      { question: 'Fixture 2?', reply: 'Reply 2' }, // the first reply is the seventh latest, so it is left out
      { question: 'Fixture 3?', reply: 'Reply 3' }, // a fixture question's text, as the TV sent it
      { question: 'Fixture 4?', reply: 'Reply 4' }, // likewise
      { question: 'Fixture 5?', reply: 'Reply 5' }, // likewise
      { question: null, reply: 'Reply 6' }, // spontaneous: no question
      { question: 'Tea or coffee?', reply: 'Tea, please' }, // the server question's text
    ] }); // end of the expected request
  }); // end of the case

  it('does not push candidates for a question answered before the model replied', async () => { // late model
    let release: (v: unknown) => void = () => {}; // resolves the model call
    const slow: LlmPort = { suggest: () => new Promise((r) => { release = r; }) }; // waits for release
    const { uc, events } = setup({ llm: { mock: slow } }); // slow model
    const { question, suggested } = uc.askQuestion('Tea?', 'Alex'); // ask
    await uc.commitUtterance('k1', { ...commit, question_id: question.id }); // answered with a default
    release(TEA); // the model answers now
    await suggested; // pipeline done
    expect(events.map((e) => e.type)).toEqual(['question.created']); // nothing pushed for an answered question
  }); // end of the case
}); // end of askQuestion and suggestReplies

describe('commitUtterance', () => { // POST /v1/utterances
  it('stores a reply, answers its question and logs it without the text', async () => { // the commit
    const { uc, store, logs } = setup(); // mock speech
    const { question } = uc.askQuestion('Tea or coffee?', 'Alex'); // a question
    const result = await uc.commitUtterance('k1', { ...commit, question_id: question.id }); // commit
    expect(result).toEqual({ created: true, hasAudio: true, utterance: { id: expect.any(String), text: 'Tea, please', kind: 'reply', question_id: question.id, question_text: 'Tea or coffee?', clicks: 2, duration_ms: 3400, created_at: '2026-10-19T10:00:00.000Z' } }); // stored, with the mock tone
    expect(store.getQuestion(question.id)).toMatchObject({ status: 'answered', answered_utterance_id: result.utterance.id }); // answered
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'utterance.committed', utterance_id: result.utterance.id, clicks: 2, chars: 11, audio: true })); // logged
    expect(JSON.stringify(logs)).not.toContain('Tea, please'); // never the words
  }); // end of the case

  it('records a reply without a server question as spontaneous', async () => { // fixture questions on the TV
    const { uc } = setup(); // fresh
    expect((await uc.commitUtterance('k1', commit)).utterance.kind).toBe('spontaneous'); // no question id
  }); // end of the case

  it('refuses an unknown question id', async () => { // 404 at the edge
    const { uc } = setup(); // fresh
    await expect(uc.commitUtterance('k1', { ...commit, question_id: 'nope' })).rejects.toBeInstanceOf(NotFoundError); // not found
  }); // end of the case

  it('is idempotent by key, also for a retry that arrives while the first commit is running', async () => { // idempotency
    let synths = 0; // Polly calls
    const tts: TtsPort = { synthesize: async () => { synths++; await new Promise((r) => setTimeout(r, 20)); return new Uint8Array([1, 2]); } }; // slow live voice
    const { uc, store } = setup({ tts: { live: tts } }); // live speech
    const [a, b] = await Promise.all([uc.commitUtterance('k1', commit), uc.commitUtterance('k1', commit)]); // concurrent retry
    const c = await uc.commitUtterance('k1', commit); // later retry
    expect(a.created).toBe(true); // the first created it
    expect([b.created, c.created]).toEqual([false, false]); // the retries did not
    expect(new Set([a, b, c].map((r) => r.utterance.id)).size).toBe(1); // one utterance
    expect([a, b, c].every((r) => r.hasAudio)).toBe(true); // all point at the audio
    expect(synths).toBe(1); // one synthesis
    expect(store.recentTurns(10)).toHaveLength(1); // one stored
  }); // end of the case
}); // end of commitUtterance

describe('synthesizeSpeech (through commitUtterance)', () => { // speech pipeline
  it('stores live audio for the utterance and traces it as live', async () => { // live voice
    const { uc, spans } = setup({ tts: { live: { synthesize: async () => new Uint8Array([9]) } } }); // live speech
    const { utterance, hasAudio } = await uc.commitUtterance('k1', commit); // commit
    expect(hasAudio).toBe(true); // has audio
    expect(uc.utteranceAudio(utterance.id)).toEqual(new Uint8Array([9])); // served by GET .../audio
    expect(spans).toContainEqual(expect.objectContaining({ hop: 'server→tts', operation: 'synthesize', mode: 'live' })); // traced
  }); // end of the case

  it('falls back to the mock tone beyond the character cap', async () => { // cost guard
    const { uc, logs, spans } = setup({ tts: { live: { synthesize: async () => new Uint8Array([9]) }, cap: new DailyCap(5, () => 0) } }); // 5 characters a day
    const { utterance, hasAudio } = await uc.commitUtterance('k1', commit); // 11 characters: mock
    expect(hasAudio).toBe(true); // the mock's tone
    expect(uc.utteranceAudio(utterance.id)).not.toEqual(new Uint8Array([9])); // not the live voice
    expect(spans).toContainEqual(expect.objectContaining({ hop: 'server→tts', operation: 'synthesize', mode: 'mock' })); // traced as mock
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'cap.reached', cap: 'tts_chars' })); // logged
  }); // end of the case

  it('commits without audio when synthesis fails', async () => { // Polly error
    const { uc, spans } = setup({ tts: { live: { synthesize: async () => { throw new Error('voice not found'); } } } }); // failing voice
    const result = await uc.commitUtterance('k1', commit); // still commits
    expect(result).toMatchObject({ created: true, hasAudio: false }); // no audio
    expect(spans).toContainEqual(expect.objectContaining({ operation: 'synthesize.error', mode: 'live' })); // traced
  }); // end of the case
}); // end of synthesizeSpeech

describe('openQuestion', () => { // the question a TV that connects late should still see
  it('returns the newest pending question, with its current candidates, up to 2 minutes after it was asked', async () => { // the window
    const { uc, store, advance } = setup(); // fresh, with an adjustable clock
    expect(uc.openQuestion()).toBeUndefined(); // nothing asked yet
    const { question, suggested } = uc.askQuestion('Tea or coffee?', 'Alex'); // a question
    await suggested; // the model's candidates are stored
    advance(120_000); // exactly 2 minutes later
    expect(uc.openQuestion()).toEqual(store.getQuestion(question.id)); // still open, as stored now
    advance(1); // 2 minutes and 1 ms
    expect(uc.openQuestion()).toBeUndefined(); // too old to replay
  }); // end of the case

  it('replays only the newest question: nothing once it is answered, not an older one', async () => { // answered is not open
    const { uc } = setup(); // fresh
    const older = uc.askQuestion('Tea?', 'Alex'); // the older question, never answered
    const newer = uc.askQuestion('Coffee?', 'Alex'); // the newer question
    await Promise.all([older.suggested, newer.suggested]); // both settled
    await uc.commitUtterance('k1', { ...commit, question_id: newer.question.id }); // the newer one is answered
    expect(uc.openQuestion()).toBeUndefined(); // nothing open: the older one expired when the newer one was asked
  }); // end of the case

  it('skips a question whose reply is still being committed', async () => { // speech can take a while
    let release: (audio: Uint8Array | null) => void = () => {}; // resolves the synthesis
    const slow: TtsPort = { synthesize: () => new Promise((r) => { release = r; }) }; // waits for release
    const { uc } = setup({ tts: { mock: slow } }); // slow speech
    const { question, suggested } = uc.askQuestion('Tea?', 'Alex'); // a question
    await suggested; // settled
    const committing = uc.commitUtterance('k1', { ...commit, question_id: question.id }); // the TV has answered; speech is on its way
    expect(uc.openQuestion()).toBeUndefined(); // answered already, so not replayed
    release(null); // the speech is done
    await committing; // committed
  }); // end of the case

  it('returns the newer of two questions asked', async () => { // newest first
    const { uc, advance } = setup(); // fresh
    await uc.askQuestion('Tea?', 'Alex').suggested; // the older question
    advance(1000); // a second later
    const newer = uc.askQuestion('Coffee?', 'Alex'); // the newer question
    await newer.suggested; // settled
    expect(uc.openQuestion()?.id).toBe(newer.question.id); // the newer one
  }); // end of the case
}); // end of openQuestion

describe('askQuestion with options', () => { // ask_question's options: no model call
  it('pushes exactly the options, Not now and Not sure, then question.candidates at once, without calling the model', async () => { // the TV starts its scan at once
    const calls: SuggestRequest[] = []; // model requests
    const { uc, events, spans } = setup({ llm: { mock: fakeLlm(TEA, calls) } }); // a recording model
    const { question, delivered, suggested } = uc.askQuestion('Would you like tea or coffee?', 'Alex', { options: ['Tea', 'Coffee'], urgency: 'high' }); // ask
    expect(question.candidates.map((c) => c.text)).toEqual(['Tea', 'Coffee', 'Not now', 'Not sure']); // four replies
    expect(question.urgency).toBe('high'); // stored as asked
    expect(events).toEqual([{ type: 'question.created', question }, { type: 'question.candidates', question_id: question.id, candidates: question.candidates }]); // both events now
    expect(delivered).toBe(true); // a TV received it
    await suggested; // nothing to wait for
    expect(calls).toEqual([]); // no model call
    expect(events).toHaveLength(2); // and no later candidates
    expect(spans.filter((s) => s.hop === 'server→llm')).toEqual([]); // no model hop
  }); // end of the case

  it('reports delivered false when no TV is connected, and stores urgency normal by default', () => { // delivered
    const { uc } = setup({ tvs: 0 }); // no TV
    const { question, delivered } = uc.askQuestion('Tea?', 'Alex'); // ask
    expect([delivered, question.urgency]).toEqual([false, 'normal']); // nobody saw it yet
  }); // end of the case
}); // end of askQuestion with options

describe('question lifecycle', () => { // one open question per household
  it('expires an earlier unanswered question when a new one is asked, and leaves an answered one answered', async () => { // expiry
    const { uc, store } = setup(); // fresh
    const first = uc.askQuestion('Tea?', 'Alex'); // answered below
    await uc.commitUtterance('k1', { ...commit, question_id: first.question.id }); // answered
    const second = uc.askQuestion('Coffee?', 'Alex'); // never answered
    const third = uc.askQuestion('Milk?', 'Alex'); // the newest
    await Promise.all([first.suggested, second.suggested, third.suggested]); // all settled
    expect([first, second, third].map((q) => store.getQuestion(q.question.id)?.status)).toEqual(['answered', 'expired', 'pending']); // one open question
    expect(await uc.getAnswer(second.question.id, 0)).toEqual({ status: 'expired', answer_text: null, answered_at: null, clicks: null }); // get_answer says so
  }); // end of the case

  it('keeps an expired question expired when a late reply to it arrives', async () => { // a TV still saying the old reply
    const { uc, store } = setup(); // fresh
    const older = uc.askQuestion('Tea?', 'Alex'); // replaced below
    uc.askQuestion('Coffee?', 'Alex'); // the newer question expires it
    const late = await uc.commitUtterance('k1', { ...commit, question_id: older.question.id }); // the reply to the older one
    expect(late.utterance).toMatchObject({ kind: 'reply', question_id: older.question.id, question_text: 'Tea?' }); // still recorded with its question
    expect(store.getQuestion(older.question.id)?.status).toBe('expired'); // but the question stays expired
  }); // end of the case
}); // end of question lifecycle

describe('getAnswer', () => { // get_answer
  const PENDING = { status: 'pending', answer_text: null, answered_at: null, clicks: null }; // no answer yet

  it('reports pending, then the answer with its time and clicks once committed', async () => { // fetch without waiting
    const { uc } = setup(); // fresh
    const { question } = uc.askQuestion('Tea?', 'Alex'); // ask
    expect(await uc.getAnswer(question.id, 0)).toEqual(PENDING); // not yet
    await uc.commitUtterance('k1', { ...commit, question_id: question.id }); // the TV commits
    expect(await uc.getAnswer(question.id, 0)).toEqual({ status: 'answered', answer_text: 'Tea, please', answered_at: '2026-10-19T10:00:00.000Z', clicks: 2 }); // the answer
  }); // end of the case

  it('returns as soon as the answer is committed while it waits', async () => { // long-poll
    const { uc } = setup(); // fresh
    const { question } = uc.askQuestion('Tea?', 'Alex'); // ask
    const started = performance.now(); // real time
    const waiting = uc.getAnswer(question.id, 5000); // waits up to 5 s
    setTimeout(() => void uc.commitUtterance('k1', { ...commit, question_id: question.id }), 20); // the TV commits 20 ms later
    expect(await waiting).toMatchObject({ status: 'answered', answer_text: 'Tea, please' }); // the answer
    expect(performance.now() - started).toBeLessThan(1000); // long before the wait ended
  }); // end of the case

  it('returns pending when the wait ends without an answer', async () => { // timeout
    const { uc } = setup(); // fresh
    const { question } = uc.askQuestion('Tea?', 'Alex'); // ask
    const started = performance.now(); // real time
    expect(await uc.getAnswer(question.id, 50)).toEqual(PENDING); // still nothing
    expect(performance.now() - started).toBeGreaterThanOrEqual(45); // it did wait (timer granularity aside)
  }); // end of the case

  it('returns expired as soon as a newer question replaces it while it waits', async () => { // expiry wakes the wait
    const { uc } = setup(); // fresh
    const { question } = uc.askQuestion('Tea?', 'Alex'); // ask
    const waiting = uc.getAnswer(question.id, 5000); // waits
    uc.askQuestion('Coffee?', 'Alex'); // a newer question
    expect(await waiting).toMatchObject({ status: 'expired' }); // at once
  }); // end of the case

  it('stops waiting when its signal aborts', async () => { // the agent cancelled the call
    const { uc } = setup(); // fresh
    const { question } = uc.askQuestion('Tea?', 'Alex'); // ask
    const controller = new AbortController(); // the request's signal
    const waiting = uc.getAnswer(question.id, 5000, controller.signal); // waits
    controller.abort(); // cancelled
    expect(await waiting).toEqual(PENDING); // the state at that moment
  }); // end of the case

  it('reports pending while the reply is still being spoken, and answered once it is stored', async () => { // commit = stored
    let release: (audio: Uint8Array | null) => void = () => {}; // resolves the synthesis
    const slow: TtsPort = { synthesize: () => new Promise((r) => { release = r; }) }; // waits for release
    const { uc } = setup({ tts: { mock: slow } }); // slow speech
    const { question } = uc.askQuestion('Tea?', 'Alex'); // ask
    const committing = uc.commitUtterance('k1', { ...commit, question_id: question.id }); // the TV has answered; speech is on its way
    expect(await uc.getAnswer(question.id, 0)).toEqual(PENDING); // no stored answer yet
    const waiting = uc.getAnswer(question.id, 5000); // waits
    release(null); // the speech is done
    await committing; // stored
    expect(await waiting).toMatchObject({ status: 'answered', answer_text: 'Tea, please' }); // woken by the commit
  }); // end of the case

  it('keeps waiting when another reply to the same question is stored before the answer', async () => { // two TVs answering
    const releases: ((audio: Uint8Array | null) => void)[] = []; // one per synthesis, in commit order
    const slow: TtsPort = { synthesize: () => new Promise((r) => { releases.push(r); }) }; // waits for release
    const { uc } = setup({ tts: { mock: slow } }); // slow speech
    const { question } = uc.askQuestion('Tea?', 'Alex'); // ask
    const first = uc.commitUtterance('k1', { ...commit, question_id: question.id }); // the answer; its speech is still running
    const second = uc.commitUtterance('k2', { ...commit, question_id: question.id, text: 'Coffee, please' }); // another TV's reply
    const waiting = uc.getAnswer(question.id, 5000); // waits
    releases[1]!(null); // the second reply's speech ends first
    await second; // stored, which wakes the wait
    releases[0]!(null); // then the answer's
    await first; // stored
    expect(await waiting).toMatchObject({ status: 'answered', answer_text: 'Tea, please' }); // the answer, not an early pending
  }); // end of the case

  it('refuses an unknown question id', async () => { // not found
    const { uc } = setup(); // fresh
    await expect(uc.getAnswer('nope', 0)).rejects.toBeInstanceOf(NotFoundError); // an id that was never issued
  }); // end of the case
}); // end of getAnswer

describe('recentMessages', () => { // get_recent_messages
  it('lists what was said, oldest first, with time, kind and the question text when there is one; since and limit narrow it', async () => { // the list
    const { uc, advance } = setup(); // fresh, with an adjustable clock
    const { question } = uc.askQuestion('Tea or coffee?', 'Alex'); // a server question
    await uc.commitUtterance('k1', { ...commit, question_id: question.id }); // its reply, at 10:00:00
    advance(1000); // a second later
    await uc.commitUtterance('k2', { ...commit, text: 'Hello' }); // something said on its own
    advance(1000); // a second later
    await uc.commitUtterance('k3', { ...commit, text: 'The cricket', question_text: 'What shall we watch?' }); // a reply to a fixture question
    expect(uc.recentMessages(null, 20)).toEqual([ // everything, oldest first
      { text: 'Tea, please', time: '2026-10-19T10:00:00.000Z', kind: 'reply', question_text: 'Tea or coffee?' }, // a reply
      { text: 'Hello', time: '2026-10-19T10:00:01.000Z', kind: 'spontaneous', question_text: null }, // no question
      { text: 'The cricket', time: '2026-10-19T10:00:02.000Z', kind: 'spontaneous', question_text: 'What shall we watch?' }, // the fixture question
    ]); // end of the list
    expect(uc.recentMessages(null, 2).map((m) => m.text)).toEqual(['Hello', 'The cricket']); // the latest two
    expect(uc.recentMessages('2026-10-19T10:00:00.000Z', 20).map((m) => m.text)).toEqual(['Hello', 'The cricket']); // strictly after since
    expect(uc.recentMessages('2026-10-19T12:00:01+02:00', 20).map((m) => m.text)).toEqual(['The cricket']); // a time with an offset
  }); // end of the case
}); // end of recentMessages

describe('addProfileFact', () => { // add_profile_fact
  it("adds a fact with an id; the next question's model request carries it", async () => { // facts shape candidates
    const calls: SuggestRequest[] = []; // model requests
    const { uc } = setup({ llm: { mock: fakeLlm(TEA, calls) } }); // no facts yet
    const id = uc.addProfileFact({ text: 'Sam follows cricket', category: 'likes' }); // add one
    await uc.askQuestion('What shall we watch?', 'Alex').suggested; // the next question
    expect(calls[0]?.facts).toEqual([{ id, text: 'Sam follows cricket', category: 'likes' }]); // as stored; promptFacts drops the id
  }); // end of the case

  it('refuses a 21st fact', () => { // plan §6.1: at most 20 facts
    const nineteen = Array.from({ length: 19 }, (_, i) => ({ text: `Fact ${i}`, category: 'other' as const })); // 19 facts
    const { uc, store } = setup({ facts: { [DEMO_HOUSEHOLD]: nineteen } }); // seeded
    uc.addProfileFact({ text: 'Fact 19', category: 'other' }); // the 20th
    expect(() => uc.addProfileFact({ text: 'Fact 20', category: 'other' })).toThrow(FactLimitError); // the 21st
    expect(store.profileFacts(DEMO_HOUSEHOLD)).toHaveLength(20); // not stored
  }); // end of the case
}); // end of addProfileFact
