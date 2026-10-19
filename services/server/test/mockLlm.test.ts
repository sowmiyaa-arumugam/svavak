// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MockLlm: deterministic, schema-valid candidates for the demo questions.

import { describe, expect, it } from 'vitest'; // test API
import { MockLlm, mockReplies } from '../src/adapters/mockLlm.ts'; // tested
import { cleanDrafts } from '../src/domain/candidates.ts'; // the same validation as live output

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

it('MockLlm returns the candidates in the tool-call envelope', async () => { // the adapter
  const out = await new MockLlm().suggest({ question: 'Shall I open the window?', askedBy: 'Alex', recentTurns: [], localTime: '10:00' }, new AbortController().signal); // one call
  expect(out).toEqual({ candidates: mockReplies('Shall I open the window?') }); // same shape as Bedrock's tool input
}); // end of the case
