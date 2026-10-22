// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import fc from 'fast-check'; // property-based testing
import { DEFAULT_CONFIG } from '../src/core/engine.ts'; // engine defaults
import { gaussian, mulberry32 } from '../sim/random.ts'; // seeded generators
import { nextNoon, pressTime, simulate, simulateSelection } from '../sim/simulate.ts'; // units under test

const ABC = [{ id: 'a', score: 0.5 }, { id: 'b', score: 0.5 }, { id: 'c', score: 0.5 }]; // three equally likely replies
const SHARP = { biasMs: 0, noiseMs: 10, spuriousRate: 0 }; // a very precise synthetic user

describe('random', () => { // seeded generators
  it('repeats for a seed and stays in [0, 1)', () => { // determinism and range
    const a = mulberry32(42); // first stream
    const b = mulberry32(42); // same seed
    for (let i = 0; i < 1000; i++) { // a thousand draws
      const x = a(); // draw from the first stream
      expect(x).toBe(b()); // identical to the second
      expect(x >= 0 && x < 1).toBe(true); // in range
    } // end of the draws
  }); // end of the case
  it('draws standard normals', () => { // Box-Muller moments
    const rng = mulberry32(7); // seeded stream
    const xs = Array.from({ length: 20000 }, () => gaussian(rng)); // samples
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length; // sample mean
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length); // sample standard deviation
    expect(Math.abs(mean)).toBeLessThan(0.03); // about 0
    expect(Math.abs(sd - 1)).toBeLessThan(0.03); // about 1
  }); // end of the case
}); // end of random

describe('synthetic user', () => { // press timing
  it('finds the first noon at or after a time', () => { // property
    const args = fc.tuple(fc.double({ min: 0, max: 1e6, noNaN: true }), fc.double({ min: 0, max: 0.999, noNaN: true })); // time and phase
    fc.assert(fc.property(args, ([after, phase]) => { // for each pair
      const t = nextNoon(after, 100, 2400, phase); // value under test
      expect(t).toBeGreaterThanOrEqual(after - 1e-6); // not before the time
      expect(t).toBeLessThan(after + 2400); // within one turn
      const turns = (t - 100) / 2400 + phase; // hand position at t
      expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-6); // at noon
    })); // end of the property
  }); // end of the case
  it('aims at noon plus bias, or presses uniformly over a turn when spurious', () => { // the two press kinds
    const rng = mulberry32(1); // seeded stream
    expect(pressTime({ biasMs: 30, noiseMs: 0, spuriousRate: 0 }, rng, 500, 0, 2400, 0.5)).toBe(1230); // noon at 1200, plus 30
    for (let i = 0; i < 100; i++) { // spurious presses
      const t = pressTime({ biasMs: 0, noiseMs: 0, spuriousRate: 1 }, rng, 500, 0, 2400, 0); // always spurious
      expect(t >= 500 && t < 2900).toBe(true); // within the turn after 500
    } // end of the presses
  }); // end of the case
}); // end of synthetic user

describe('simulator', () => { // trials through the real engine
  it('selects the target for a precise user', () => { // a single trial
    const trial = simulateSelection(DEFAULT_CONFIG, ABC, 'c', SHARP, mulberry32(3)); // aim at c
    expect(trial.committed).toBe('c'); // reached the target
    expect(trial.presses).toBeGreaterThanOrEqual(1); // at least one press
  }); // end of the case
  it('gives the same summary for the same seed', () => { // reproducible from a seed
    const run = { config: DEFAULT_CONFIG, options: ABC, targets: ['a', 'b', 'c'], user: { ...SHARP, noiseMs: 150, spuriousRate: 0.1 }, trials: 300 }; // a noisy run
    expect(simulate({ ...run, seed: 9 })).toEqual(simulate({ ...run, seed: 9 })); // identical
  }); // end of the case
}); // end of simulator
