// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import fc from 'fast-check'; // property-based testing
import { priors } from '../src/core/priors.ts'; // unit under test

const CFG = { priorFloor: 0.02, temperature: 1, controlShare: 0.03 }; // the default initial values
const replies = (scores: number[]) => scores.map((score, i) => ({ id: `r${i}`, score })); // reply options from scores
const controls = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, score: 0, control: true })); // control options

describe('priors', () => { // model scores to prior probabilities
  it('gives each control its fixed share and splits the rest uniformly for equal scores', () => { // K1 setting
    const p = priors([...replies(Array(8).fill(0.5)), ...controls(4)], CFG); // 8 replies + 4 controls
    for (const x of p.slice(0, 8)) expect(x).toBeCloseTo(0.88 / 8, 12); // replies share 1 - 4 x 3%
    for (const x of p.slice(8)) expect(x).toBeCloseTo(0.03, 12); // controls get 3% each
  }); // end of the case
  it('applies the floor and the temperature', () => { // max(s, s_floor) ^ (1 / tau)
    const [low = NaN, high = NaN] = priors(replies([0, 0.04]), CFG); // a zero score is raised to the floor
    expect(high / low).toBeCloseTo(2, 12); // 0.04 / 0.02
    const [a = NaN, b = NaN] = priors(replies([0.2, 0.4]), { ...CFG, temperature: 0.5 }); // tau = 0.5 squares the weights
    expect(b / a).toBeCloseTo(4, 12); // (0.4 / 0.2) ^ 2
  }); // end of the case
  it('sums to 1 and keeps every option reachable', () => { // property over random scores
    const scores = fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 20 }); // random reply scores
    fc.assert(fc.property(scores, fc.nat(5), (s, n) => { // replies plus up to five controls
      const p = priors([...replies(s), ...controls(n)], CFG); // values under test
      expect(p.reduce((sum, x) => sum + x, 0)).toBeCloseTo(1, 12); // a proper distribution
      for (const x of p) expect(x).toBeGreaterThan(0); // nothing is unreachable
      for (const x of p.slice(s.length)) expect(x).toBeCloseTo(0.03, 12); // controls keep their share
    })); // end of the property
  }); // end of the case
  it('shares equally among controls when there are no replies', () => { // degenerate but valid
    expect(priors(controls(4), CFG)).toEqual([0.25, 0.25, 0.25, 0.25]); // renormalised shares
  }); // end of the case
  it('rejects controls that leave replies no mass', () => { // a configuration error
    expect(() => priors([...replies([0.5]), ...controls(4)], { ...CFG, controlShare: 0.25 })).toThrow(); // 4 x 25% = 100%
  }); // end of the case
}); // end of priors
