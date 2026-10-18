// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import fc from 'fast-check'; // property-based testing
import { phasesByRank, vanDerCorput } from '../src/core/phases.ts'; // units under test

const circular = (a: number, b: number): number => Math.min(Math.abs(a - b), 1 - Math.abs(a - b)); // distance on the dial, in turns

describe('vanDerCorput', () => { // bit-reversal order
  it('gives 0, 1/2, 1/4, 3/4, 1/8, 5/8, 3/8, 7/8', () => { // plan §4.1 sequence
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(vanDerCorput)).toEqual([0, 0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875]); // first eight ranks
  }); // end of the case
}); // end of vanDerCorput

describe('phasesByRank', () => { // phase per option from its score rank
  it('puts the leader at 0, the runner-up half a turn away and ties in index order', () => { // spot check
    expect(phasesByRank([0.1, 0.6, 0.3])).toEqual([0.25, 0, 0.5]); // ranks 2, 0, 1
    expect(phasesByRank([1, 1, 1])).toEqual([0, 0.5, 0.25]); // equal scores keep option order
  }); // end of the case
  it('gives distinct phases in [0, 1), the top four at least a quarter turn apart', () => { // property
    const scores = fc.array(fc.double({ min: -1e3, max: 0, noNaN: true }), { minLength: 4, maxLength: 64 }); // random log scores
    fc.assert(fc.property(scores, (s) => { // for each score vector
      const phases = phasesByRank(s); // values under test
      expect(new Set(phases).size).toBe(s.length); // no two options share a phase
      for (const p of phases) expect(p >= 0 && p < 1).toBe(true); // each phase is in [0, 1)
      const order = s.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x || a.i - b.i); // options by rank
      const top = order.slice(0, 4).map(({ i }) => phases[i] ?? NaN); // phases of the four leaders
      for (const a of top) for (const b of top) if (a !== b) expect(circular(a, b)).toBeGreaterThanOrEqual(0.25); // a quarter turn apart
      expect(circular(top[0] ?? NaN, top[1] ?? NaN)).toBe(0.5); // the two leaders are half a turn apart
    })); // end of the property
  }); // end of the case
}); // end of phasesByRank
