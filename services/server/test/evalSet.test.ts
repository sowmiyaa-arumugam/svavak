// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The evaluation set's automatic checks (plan §4.6) against mock output, through the real reply pipeline.

import { describe, expect, it } from 'vitest'; // test API
import { MemoryStore } from '../src/adapters/memoryStore.ts'; // the real store
import { MockLlm, mockReplies } from '../src/adapters/mockLlm.ts'; // the mock model
import { MockTts } from '../src/adapters/mockTts.ts'; // the mock speech
import { createUseCases } from '../src/application/useCases.ts'; // the pipeline
import { cleanDrafts, questionKind } from '../src/domain/candidates.ts'; // validation and the question kinds
import { DailyCap } from '../src/domain/dailyCap.ts'; // caps
import { DEMO_FACTS, DEMO_HOUSEHOLD, promptFacts } from '../src/domain/facts.ts'; // the seeded facts
import type { Candidate, StreamEvent } from '../src/domain/model.ts'; // shapes
import { EVAL_SET, evalChecks } from './evalSet.ts'; // tested

/** The candidates the TV gets for `question` in mock mode, with the demo facts seeded. */
async function candidatesFor(question: string): Promise<Candidate[]> { // ask, then read question.candidates
  const events: StreamEvent[] = []; // pushed to the TV
  const clock = () => Date.parse('2026-10-20T18:00:00Z'); // a fixed time
  const uc = createUseCases({ mode: 'mock', store: new MemoryStore({ [DEMO_HOUSEHOLD]: DEMO_FACTS }), notifier: { publish: (e) => { events.push(e); return 1; } }, trace: { span: () => {} }, log: () => {}, clock, newId: () => 'q1', llm: { live: null, mock: new MockLlm(), cap: new DailyCap(1000, clock), budgetMs: 3500 }, tts: { live: null, announcer: null, mock: new MockTts(), cap: new DailyCap(100_000, clock), announceMs: 2000 } }); // mock wiring, as compose.ts seeds it
  await (await uc.askQuestion(question, 'Alex')).suggested; // the model's turn
  const pushed = events.find((e) => e.type === 'question.candidates'); // the final list
  if (pushed?.type !== 'question.candidates') throw new Error(`no candidates for "${question}"`); // the model gave nothing usable
  return pushed.candidates; // as the TV gets them
} // end of candidatesFor

describe('evaluation set', () => { // plan §4.6
  it('has 30 questions of every kind, three of them with a seeded fact to show', () => { // the set itself
    expect(EVAL_SET).toHaveLength(30); // thirty
    expect(new Set(EVAL_SET.map((q) => q.text)).size).toBe(30); // all different
    expect(EVAL_SET.map((q) => questionKind(q.text)).sort()).toEqual([...Array(8).fill('choice'), ...Array(10).fill('open'), ...Array(12).fill('yesno')]); // twelve yes/no, eight choice, ten open
    expect(EVAL_SET.filter((q) => q.fact)).toHaveLength(3); // three fact questions
  }); // end of the case

  it.each(EVAL_SET.map((q) => q.text))('mock output for "%s" is schema-valid in full', (question) => { // schema of the raw tool input
    const raw = { candidates: mockReplies(question, promptFacts(DEMO_FACTS)) }; // what MockLlm returns
    expect(raw.candidates.length).toBeGreaterThanOrEqual(6); // 6 to 8 (plan §4.6)
    expect(cleanDrafts(raw)).toHaveLength(raw.candidates.length); // none dropped by validation or de-duplication
  }); // end of the case

  it.each(EVAL_SET.map((q) => q.text))('mock candidates for "%s" pass the length, intent and banned-term checks', async (question) => { // the pipeline's output
    expect(evalChecks(question, await candidatesFor(question))).toEqual([]); // no failures
  }); // end of the case

  it('reports what fails: too many or malformed candidates, a long text, a missing intent and a banned term', () => { // the checks themselves
    const c = (text: string, intent: Candidate['intent']): Candidate => ({ text, intent, score: 0.1, prior: 0.1, source: 'llm' }); // a candidate
    expect(evalChecks('Tea?', [c('Yes', 'yes'), c('No', 'no'), c('Later', 'later')])).toEqual([]); // a good yes/no list
    expect(evalChecks('Tea?', [c('x'.repeat(61), 'yes'), c('Damn', 'no')])).toEqual(['length: "' + 'x'.repeat(61) + '"', 'intent: no later reply', 'banned: 1 candidates']); // long, no later, banned
    expect(evalChecks('What now?', [{ ...c('Hm', 'later'), intent: 'maybe' as Candidate['intent'] }, ...Array(8).fill(c('Not now', 'later'))])).toEqual(['schema: 9 candidates', expect.stringMatching(/^schema: \{/)]); // too many, one malformed
    expect(evalChecks('What now?', [c('Not now', 'later')])).toEqual([]); // an open question needs no Yes or No
  }); // end of the case
}); // end of evaluation set
