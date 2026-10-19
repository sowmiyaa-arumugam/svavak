// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MockLlm: deterministic, schema-valid candidates for the demo questions.

import { describe, expect, it } from 'vitest'; // test API
import { MockLlm, mockReplies } from '../src/adapters/mockLlm.ts'; // tested
import { cleanDrafts } from '../src/domain/candidates.ts'; // the same validation as live output
import { DEMO_FACTS, type ProfileFact } from '../src/domain/facts.ts'; // profile facts

const DEMO = [ // demo questions and the first two replies expected
  ['Would you like tea or coffee?', ['Tea, please', 'Coffee, please']], // a choice
  ['Shall we watch a film or the news?', ['A film, please', 'The news, please']], // a choice with articles
  ['How are you feeling today?', ['Good, thanks', 'A bit tired']], // feelings
  ['What would you like for lunch?', ['Something light', 'Soup, please']], // food
  ['Shall I open the window?', ['Yes, please', 'No, thanks']], // yes or no
  ['Tell me about your day.', ["I'm not sure", 'Tell me more']], // anything else
] as const; // end of the cases

describe('mockReplies', () => { // the rules
  it.each(DEMO)('answers "%s" with fitting replies first', (question, firstTwo) => { // each demo question
    const drafts = mockReplies(question); // the mock candidates
    expect(drafts.slice(0, 2).map((d) => d.text)).toEqual(firstTwo); // the best two
    expect(cleanDrafts({ candidates: drafts })).toHaveLength(8); // eight, all valid and distinct
  }); // end of the case

  it('is deterministic', () => { // same input, same output
    expect(mockReplies('Would you like tea or coffee?')).toEqual(mockReplies('Would you like tea or coffee?')); // equal lists
  }); // end of the case
}); // end of mockReplies

const CRICKET: ProfileFact = { text: 'Sam follows cricket', category: 'likes' }; // a demo fact
const TEA: ProfileFact = { text: 'Sam prefers tea to coffee', category: 'likes' }; // another demo fact
const WATCH = 'What shall we watch tonight?'; // a question the cricket fact fits
const DRINK = 'Would you like coffee or tea?'; // a question the tea fact fits

describe('mockReplies with profile facts', () => { // plan FR-03: replies that use what is known about Sam
  it('ranks "The cricket, please" first for a watch question with the cricket fact, and does not offer it without', () => { // cricket
    expect(mockReplies(WATCH, [CRICKET])[0]).toEqual({ text: 'The cricket, please', intent: 'choice', score: 0.4 }); // first, above every rule
    expect(mockReplies(WATCH).map((d) => d.text)).not.toContain('The cricket, please'); // not without the fact
  }); // end of the case

  it('ranks "Tea, please" first with the tea fact, and "Coffee, please" first without', () => { // tea
    expect(mockReplies(DRINK, [TEA]).map((d) => d.text).slice(0, 2)).toEqual(['Tea, please', 'Coffee, please']); // the fact wins
    expect(mockReplies(DRINK)[0]?.text).toBe('Coffee, please'); // the rule alone: the first option
  }); // end of the case

  it('gives the cricket and tea replies with the demo facts', () => { // the seeded facts fit the table
    expect(mockReplies(WATCH, DEMO_FACTS)[0]?.text).toBe('The cricket, please'); // the cricket fact
    expect(mockReplies(DRINK, DEMO_FACTS)[0]?.text).toBe('Tea, please'); // the tea fact
  }); // end of the case

  it('uses only facts in the likes category', () => { // a person or a routine is no preference
    expect(mockReplies(WATCH, [{ ...CRICKET, category: 'people' }])).toEqual(mockReplies(WATCH)); // no effect
  }); // end of the case

  it('keeps every list to eight valid, distinct drafts', () => { // the grid stays full
    for (const facts of [[], [CRICKET], [TEA], [CRICKET, TEA]]) { // with and without facts
      for (const question of [WATCH, DRINK]) expect(cleanDrafts({ candidates: mockReplies(question, facts) })).toHaveLength(8); // eight survive
    } // end of the facts
  }); // end of the case
}); // end of mockReplies with profile facts

describe('MockLlm', () => { // the adapter
  const suggest = (facts: unknown[]) => new MockLlm().suggest({ question: WATCH, askedBy: 'Alex', recentTurns: [], localTime: '19:00', facts: facts as ProfileFact[] }, new AbortController().signal); // one call
  const first = async (facts: unknown[]) => ((await suggest(facts)) as { candidates: { text: string }[] }).candidates[0]?.text; // the best reply

  it('returns the candidates in the tool-call envelope', async () => { // the adapter
    const out = await new MockLlm().suggest({ question: 'Shall I open the window?', askedBy: 'Alex', recentTurns: [], localTime: '10:00', facts: [] }, new AbortController().signal); // one call
    expect(out).toEqual({ candidates: mockReplies('Shall I open the window?') }); // same shape as Bedrock's tool input
  }); // end of the case

  it('uses only the facts promptFacts keeps', async () => { // the same limits as the live prompt
    expect(await first([{ text: 'Sam follows cricket'.padEnd(121, '.'), category: 'likes' }])).not.toBe('The cricket, please'); // 121 characters: dropped
    expect(await first([{ text: '', category: 'likes' }, { text: 'Sam follows cricket', category: 'health' }])).not.toBe('The cricket, please'); // empty, unlisted category: dropped
    expect(await first([{ text: 'Sam follows cricket'.padEnd(120, '.'), category: 'likes' }])).toBe('The cricket, please'); // 120 characters: kept
  }); // end of the case
}); // end of MockLlm
