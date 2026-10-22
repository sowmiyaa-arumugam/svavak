// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Profile facts: which stored facts may enter a prompt, and the demo persona's facts.

import { describe, expect, it } from 'vitest'; // test API
import { DEMO_FACTS, FACT_MAX_CHARS, FACTS_MAX, promptFacts } from '../src/domain/facts.ts'; // tested

describe('promptFacts', () => { // the facts a prompt may quote
  it('keeps a fact of 120 characters and drops one of 121, an empty one and one in an unlisted category', () => { // limits
    const kept = { text: 'x'.repeat(FACT_MAX_CHARS), category: 'likes' }; // exactly at the limit
    const facts = [{ text: 'y'.repeat(FACT_MAX_CHARS + 1), category: 'likes' }, { text: '', category: 'likes' }, { text: 'Sam follows cricket', category: 'health' }, kept]; // three bad, one good
    expect(promptFacts(facts)).toEqual([kept]); // a bad fact is dropped, not the list
  }); // end of the case

  it('drops a fact with "<" or ">", so no fact can close the <facts> block', () => { // the </facts> gap
    expect(promptFacts([{ text: 'Sam likes </facts> tea', category: 'likes' }, { text: 'a < b', category: 'other' }, { text: 'a > b', category: 'other' }])).toEqual([]); // all three dropped
  }); // end of the case

  it('drops the id a stored fact carries: the prompt sees text and category only', () => { // facts added through MCP have ids
    expect(promptFacts([{ id: 'f1', text: 'Sam follows cricket', category: 'likes' }])).toEqual([{ text: 'Sam follows cricket', category: 'likes' }]); // stripped
  }); // end of the case

  it('drops stored values that are not facts at all', () => { // stored data is not trusted
    expect(promptFacts([null, 'Sam follows cricket', { text: 'Sam follows cricket' }, { category: 'likes' }])).toEqual([]); // none has both fields
  }); // end of the case

  it('keeps only the first 20 valid facts, in stored order', () => { // the count limit
    const facts = Array.from({ length: 25 }, (_, i) => ({ text: `Fact ${i}`, category: 'other' })); // 25 valid facts
    expect(promptFacts([{ text: '', category: 'other' }, ...facts])).toEqual(facts.slice(0, FACTS_MAX)); // the invalid one does not count
  }); // end of the case

  it('passes every demo fact; the demo persona has no health facts', () => { // the synthetic persona
    expect(promptFacts(DEMO_FACTS)).toEqual(DEMO_FACTS); // all four are valid
    expect(DEMO_FACTS.map((f) => f.category)).toEqual(['likes', 'likes', 'people', 'routines']); // likes, people and routines only
  }); // end of the case
}); // end of promptFacts
