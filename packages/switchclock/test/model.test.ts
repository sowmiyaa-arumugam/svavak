// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import fc from 'fast-check'; // property-based testing
import { logLikelihood, logSumExp, normalise, offsetMs, wrap } from '../src/core/model.ts'; // units under test

const PLAN = { periodMs: 2400, biasMs: 0, noiseMs: 120, spuriousRate: 0.05 }; // the worked example's values

describe('wrap', () => { // fractional part mapped to [-1/2, 1/2)
  it('stays in [-1/2, 1/2) and differs from its input by an integer', () => { // the defining properties
    fc.assert(fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (x) => { // any finite input
      const w = wrap(x); // value under test
      expect(w).toBeGreaterThanOrEqual(-0.5); // lower bound, inclusive
      expect(w).toBeLessThan(0.5); // upper bound, exclusive
      expect(Math.abs(x - w - Math.round(x - w))).toBeLessThan(1e-6); // x - w is an integer
    })); // end of the property
  }); // end of the case
  it('maps exactly one half to minus one half', () => { // the half-open interval's edge
    expect(wrap(0.5)).toBe(-0.5); // 1/2 is outside [-1/2, 1/2), so it wraps
  }); // end of the case
}); // end of wrap

describe('offsetMs', () => { // signed offset to an option's nearest noon
  it('is zero at noon and +-T/4 a quarter turn away', () => { // spot values
    expect(offsetMs(1000, 1000, 2400, 0)).toBe(0); // phase 0 is at noon at t0
    expect(offsetMs(1000 + 600, 1000, 2400, 0)).toBeCloseTo(600); // a quarter turn late
    expect(offsetMs(1000, 1000, 2400, 0.75)).toBeCloseTo(-600); // phase 3/4 reaches noon a quarter turn later
    expect(offsetMs(1000 + 2400 * 7, 1000, 2400, 0)).toBeCloseTo(0); // every whole turn is noon again
  }); // end of the case
}); // end of offsetMs

describe('logLikelihood', () => { // log of (1 - eps) N(d; mu, sigma) + eps / T
  it('matches the formula directly', () => { // reference computation
    const d = 137; // an arbitrary offset in ms
    const n = Math.exp(-0.5 * (d / 120) ** 2) / (120 * Math.sqrt(2 * Math.PI)); // Gaussian density
    expect(logLikelihood(d, PLAN)).toBeCloseTo(Math.log(0.95 * n + 0.05 / 2400), 10); // same value
  }); // end of the case
  it('reproduces the worked-example ratios: about 153:1 a quarter turn apart, about 20:1 an eighth apart', () => { // likelihood ratios between nearby presses
    const atNoon = logLikelihood(0, PLAN); // click on the intended option's noon
    expect(Math.exp(atNoon - logLikelihood(600, PLAN))).toBeCloseTo(152.5, 0); // a quarter turn = 0.6 s away
    expect(Math.exp(atNoon - logLikelihood(300, PLAN))).toBeCloseTo(19.9, 0); // an eighth of a turn = 0.3 s away
  }); // end of the case
  it('stays finite far from noon with no spurious term', () => { // computed in log space, so no underflow
    const v = logLikelihood(1200, { ...PLAN, noiseMs: 30, spuriousRate: 0 }); // density exp(-800) underflows
    expect(Number.isFinite(v)).toBe(true); // still a usable log value
    expect(v).toBeCloseTo(-800 - Math.log(30 * Math.sqrt(2 * Math.PI)), 6); // exactly the Gaussian log-density
  }); // end of the case
  it('is symmetric about the bias', () => { // the Gaussian is centred on mu
    const c = { ...PLAN, biasMs: 40 }; // a 40 ms late bias
    expect(logLikelihood(40 + 90, c)).toBeCloseTo(logLikelihood(40 - 90, c), 12); // equal either side of mu
  }); // end of the case
}); // end of logLikelihood

describe('logSumExp and normalise', () => { // log-space normalisation
  it('matches the naive sum and survives huge magnitudes', () => { // correctness and stability
    expect(logSumExp([Math.log(1), Math.log(2), Math.log(3)])).toBeCloseTo(Math.log(6), 12); // naive reference
    expect(logSumExp([-1e4, -1e4])).toBeCloseTo(-1e4 + Math.log(2), 9); // exp(-1e4) would underflow
    expect(logSumExp([0, -Infinity])).toBe(0); // a zero-probability term adds nothing
  }); // end of the case
  it('normalises to probabilities that sum to 1', () => { // property over random log vectors
    const logs = fc.array(fc.double({ min: -700, max: 700, noNaN: true }), { minLength: 1, maxLength: 20 }); // random log vectors
    fc.assert(fc.property(logs, (xs) => { // for each vector
      const total = normalise(xs).reduce((s, x) => s + Math.exp(x), 0); // sum of the probabilities
      expect(total).toBeCloseTo(1, 9); // a proper distribution
    })); // end of the property
  }); // end of the case
}); // end of logSumExp and normalise
