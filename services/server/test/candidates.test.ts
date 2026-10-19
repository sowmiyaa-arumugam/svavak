// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Reply pipeline post-processing (plan §4.6): validation, trimming, length cap, de-duplication, merge and priors.

import { describe, expect, it } from 'vitest'; // test API
import { cleanDrafts, DEFAULT_REPLIES, defaultCandidates, toCandidates } from '../src/domain/candidates.ts'; // tested
import { REPLY_COUNT } from '../src/domain/model.ts'; // eight per question

describe('cleanDrafts', () => { // raw model output to drafts
  it('rejects an output without a candidates list', () => { // envelope validation
    expect(cleanDrafts(null)).toEqual([]); // nothing
    expect(cleanDrafts({ replies: [] })).toEqual([]); // wrong key
    expect(cleanDrafts({ candidates: 'Yes' })).toEqual([]); // not a list
  }); // end of the case

  it('drops invalid candidates and keeps the valid ones', () => { // per-candidate validation
    const raw = { candidates: [ // a mixed list
      { text: 'Tea, please', intent: 'choice', score: 0.6 }, // valid
      { text: 'Coffee', intent: 'maybe', score: 0.5 }, // unknown intent
      { text: 'Water', intent: 'choice', score: 1.5 }, // score out of range
      { text: 42, intent: 'yes', score: 0.2 }, // text not a string
      'No', // not an object
    ] }; // end of the list
    expect(cleanDrafts(raw)).toEqual([{ text: 'Tea, please', intent: 'choice', score: 0.6 }]); // only the valid one
  }); // end of the case

  it('trims whitespace, caps the length at 60 and drops empty text', () => { // sanitising
    const long = 'x'.repeat(61); // one over the cap
    const raw = { candidates: [{ text: '  Yes,\n  please ', intent: 'yes', score: 0.4 }, { text: long, intent: 'no', score: 0.3 }, { text: '   ', intent: 'no', score: 0.2 }, { text: 'y'.repeat(60), intent: 'no', score: 0.1 }] }; // cases
    expect(cleanDrafts(raw).map((d) => d.text)).toEqual(['Yes, please', 'y'.repeat(60)]); // trimmed; 60 kept; 61 and blank dropped
  }); // end of the case

  it('sorts by score and de-duplicates case-insensitively, keeping the best score', () => { // ranking
    const raw = { candidates: [{ text: 'not now', intent: 'later', score: 0.1 }, { text: 'Yes', intent: 'yes', score: 0.5 }, { text: 'Not Now', intent: 'later', score: 0.3 }] }; // a duplicate
    expect(cleanDrafts(raw)).toEqual([{ text: 'Yes', intent: 'yes', score: 0.5 }, { text: 'Not Now', intent: 'later', score: 0.3 }]); // best of each
  }); // end of the case
}); // end of cleanDrafts

describe('toCandidates', () => { // merge with defaults and priors
  it('returns the eight defaults, Yes, No and Not now first, when the model gave nothing', () => { // FR-02
    const c = defaultCandidates(); // no model output
    expect(c).toHaveLength(REPLY_COUNT); // a full grid
    expect(c.slice(0, 3).map((x) => x.text)).toEqual(['Yes, please', 'No, thanks', 'Not now']); // shown at once
    expect(c.every((x) => x.source === 'default')).toBe(true); // all defaults
  }); // end of the case

  it('keeps the model candidates and fills up with defaults that are not duplicates', () => { // merge
    const model = [{ text: 'Tea, please', intent: 'choice' as const, score: 0.6 }, { text: 'yes, please', intent: 'yes' as const, score: 0.2 }]; // two drafts, one a default
    const c = toCandidates(model); // merged
    expect(c).toHaveLength(REPLY_COUNT); // eight
    expect(c.filter((x) => x.source === 'llm').map((x) => x.text)).toEqual(['Tea, please', 'yes, please']); // both model drafts
    expect(c.map((x) => x.text.toLowerCase()).filter((t) => t === 'yes, please')).toHaveLength(1); // the default "Yes, please" not repeated
    expect(c.filter((x) => x.source === 'default')).toHaveLength(6); // six defaults fill the grid
  }); // end of the case

  it('uses only the best eight model candidates', () => { // cap at the grid size
    const model = Array.from({ length: 10 }, (_, i) => ({ text: `Reply ${i}`, intent: 'choice' as const, score: 1 - i / 10 })); // ten drafts, best first
    const c = toCandidates(model); // merged
    expect(c.map((x) => x.text)).toEqual(model.slice(0, 8).map((d) => d.text)); // the first eight, no defaults
  }); // end of the case

  it('orders by score and computes priors that sum to 1 and follow the scores', () => { // priors from scores
    const c = toCandidates([{ text: 'Coffee, please', intent: 'choice', score: 0.9 }]); // one strong model candidate
    expect(c[0]!.text).toBe('Coffee, please'); // best guess first
    for (let i = 1; i < c.length; i++) expect(c[i - 1]!.score).toBeGreaterThanOrEqual(c[i]!.score); // descending scores
    expect(c.reduce((s, x) => s + x.prior, 0)).toBeCloseTo(1, 12); // a distribution
    const total = 0.9 + DEFAULT_REPLIES.slice(0, 7).reduce((s, d) => s + d.score, 0); // tau = 1 and every score above the floor
    expect(c[0]!.prior).toBeCloseTo(0.9 / total, 12); // proportional to the score
  }); // end of the case
}); // end of toCandidates
