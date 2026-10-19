// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Use-cases with fake ports: the reply pipeline (defaults first, budget, fallbacks, caps) and idempotent commits.

import { describe, expect, it } from 'vitest'; // test API
import { MemoryStore } from '../src/adapters/memoryStore.ts'; // the real in-memory store
import { MockLlm } from '../src/adapters/mockLlm.ts'; // the real mock model
import { MockTts } from '../src/adapters/mockTts.ts'; // the real mock speech
import { createUseCases, NotFoundError, type Deps } from '../src/application/useCases.ts'; // tested
import { DailyCap } from '../src/domain/dailyCap.ts'; // cost guard
import type { Span, StreamEvent } from '../src/domain/model.ts'; // shapes
import type { LlmPort, SuggestRequest, TtsPort } from '../src/ports/index.ts'; // ports

const TEA = { candidates: [{ text: 'Tea, please', intent: 'choice', score: 0.6 }, { text: 'Coffee, please', intent: 'choice', score: 0.4 }] }; // a model answer

/** Use-cases over fake ports that record what they receive. */
function setup(patch: { llm?: Partial<Deps['llm']>; tts?: Partial<Deps['tts']> } = {}) { // fresh world per test
  const now = Date.parse('2026-10-19T10:00:00Z'); // fixed time
  let n = 0; // id counter
  const events: StreamEvent[] = []; // pushed to the TV
  const spans: Omit<Span, 'id' | 'at'>[] = []; // trace
  const logs: Record<string, unknown>[] = []; // log lines
  const store = new MemoryStore(); // real store
  const clock = () => now; // fixed clock
  const deps: Deps = { // the ports
    mode: 'mock', // server mode
    store, // store
    notifier: { publish: (e) => events.push(e) }, // records events
    trace: { span: (s) => spans.push(s) }, // records spans
    log: (msg, fields) => logs.push({ msg, ...fields }), // records logs
    clock, // time
    newId: () => `id${++n}`, // predictable ids
    llm: { live: null, mock: new MockLlm(), cap: new DailyCap(1000, clock), budgetMs: 200, ...patch.llm }, // replies
    tts: { live: null, mock: new MockTts(), cap: new DailyCap(100_000, clock), ...patch.tts }, // speech
  }; // end of deps
  return { uc: createUseCases(deps), events, spans, logs, store }; // what tests inspect
} // end of setup

/** A model that answers with `output` and records each request. */
function fakeLlm(output: unknown, calls: SuggestRequest[] = []): LlmPort { // fake LLM
  return { suggest: async (request) => { calls.push(request); return output; } }; // immediate answer
} // end of fakeLlm

const commit = { question_id: null, text: 'Tea, please', clicks: 2, duration_ms: 3400 }; // a commit body

describe('askQuestion and suggestReplies', () => { // S1 steps 1 to 5
  it('pushes the question with the defaults at once, then the model candidates', async () => { // defaults first
    const { uc, events, store, spans } = setup(); // mock model
    const { question, suggested } = uc.askQuestion('Would you like tea or coffee?', 'Alex'); // ask
    expect(events).toEqual([{ type: 'question.created', question }]); // before the model has answered
    expect(question.candidates.map((c) => c.text).slice(0, 3)).toEqual(['Yes, please', 'No, thanks', 'Not now']); // defaults
    await suggested; // the model's turn
    const pushed = events[1]; // the second event
    expect(pushed?.type).toBe('question.candidates'); // candidates follow
    if (pushed?.type !== 'question.candidates') throw new Error('unreachable'); // narrow the type
    expect(pushed.question_id).toBe(question.id); // for this question
    expect(pushed.candidates.slice(0, 2).map((c) => c.text)).toEqual(['Tea, please', 'Coffee, please']); // mock choice replies
    expect(store.getQuestion(question.id)?.candidates).toEqual(pushed.candidates); // stored too
    expect(spans).toContainEqual(expect.objectContaining({ hop: 'server→llm', operation: 'suggest', mode: 'mock' })); // traced
  }); // end of the case

  it('keeps the defaults when the model misses the budget', async () => { // timeout
    const never: LlmPort = { suggest: () => new Promise(() => {}) }; // never answers
    const { uc, events, spans, logs } = setup({ llm: { mock: never, budgetMs: 30 } }); // short budget
    await uc.askQuestion('Tea?', 'Alex').suggested; // resolves when the budget runs out
    expect(events.map((e) => e.type)).toEqual(['question.created']); // no candidates event
    expect(spans).toContainEqual(expect.objectContaining({ hop: 'server→llm', operation: 'suggest.timeout' })); // traced
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'suggest.failed', outcome: 'suggest.timeout' })); // logged
  }); // end of the case

  it('keeps the defaults when the model fails or returns nothing usable', async () => { // error and invalid output
    const failing: LlmPort = { suggest: async () => { throw new Error('throttled'); } }; // adapter error
    const a = setup({ llm: { mock: failing } }); // failing model
    await a.uc.askQuestion('Tea?', 'Alex').suggested; // ask
    expect(a.spans).toContainEqual(expect.objectContaining({ operation: 'suggest.error' })); // error span
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

  it('sends the question, who asked, the time and earlier turns to the model', async () => { // §4.6 inputs
    const calls: SuggestRequest[] = []; // requests
    const { uc } = setup({ llm: { mock: fakeLlm(TEA, calls) } }); // recording model
    const first = uc.askQuestion('Tea or coffee?', 'Alex'); // first question
    await first.suggested; // its candidates
    await uc.commitUtterance('k1', { ...commit, question_id: first.question.id }); // answered
    await uc.askQuestion('Milk?', 'Alex').suggested; // second question
    expect(calls[1]).toEqual({ question: 'Milk?', askedBy: 'Alex', localTime: expect.stringMatching(/^\d\d:\d\d$/), recentTurns: [{ speaker: 'Alex', text: 'Tea or coffee?' }, { speaker: 'User', text: 'Tea, please' }] }); // context
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
    expect(result).toEqual({ created: true, hasAudio: false, utterance: { id: expect.any(String), text: 'Tea, please', kind: 'reply', question_id: question.id, clicks: 2, duration_ms: 3400, created_at: '2026-10-19T10:00:00.000Z' } }); // stored
    expect(store.getQuestion(question.id)).toMatchObject({ status: 'answered', answered_utterance_id: result.utterance.id }); // answered
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'utterance.committed', utterance_id: result.utterance.id, clicks: 2, chars: 11 })); // logged
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

  it('falls back to no audio beyond the character cap', async () => { // cost guard
    const { uc, logs } = setup({ tts: { live: { synthesize: async () => new Uint8Array([9]) }, cap: new DailyCap(5, () => 0) } }); // 5 characters a day
    expect((await uc.commitUtterance('k1', commit)).hasAudio).toBe(false); // 11 characters: mock
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'cap.reached', cap: 'tts_chars' })); // logged
  }); // end of the case

  it('commits without audio when synthesis fails', async () => { // Polly error
    const { uc, spans } = setup({ tts: { live: { synthesize: async () => { throw new Error('voice not found'); } } } }); // failing voice
    const result = await uc.commitUtterance('k1', commit); // still commits
    expect(result).toMatchObject({ created: true, hasAudio: false }); // no audio
    expect(spans).toContainEqual(expect.objectContaining({ operation: 'synthesize.error', mode: 'live' })); // traced
  }); // end of the case
}); // end of synthesizeSpeech
