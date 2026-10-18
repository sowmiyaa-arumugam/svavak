// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import { DEFAULT_CONFIG, type EngineConfig } from '../src/core/engine.ts'; // engine defaults
import { simulate } from '../sim/simulate.ts'; // seeded simulator

// Gate K1 (plan §7.3, §10.4): engine and user share mu = 0, sigma = 100 ms, eps = 0.05; theta = 0.95, T = 2.4 s
const CONFIG: EngineConfig = { ...DEFAULT_CONFIG, biasMs: 0, noiseMs: 100, spuriousRate: 0.05, threshold: 0.95, periodMs: 2400 }; // engine side
const USER = { biasMs: 0, noiseMs: 100, spuriousRate: 0.05 }; // synthetic-user side, matching the engine
const REPLIES = Array.from({ length: 8 }, (_, i) => ({ id: `reply${i}`, score: 0.5 })); // 8 replies with uniform priors
const CONTROLS = ['undo', 'more', 'spell', 'help'].map((id) => ({ id, score: 0, control: true })); // 4 controls, 3% each
const RUN = { config: CONFIG, options: [...REPLIES, ...CONTROLS], targets: REPLIES.map((r) => r.id), trials: 10000, seed: 20261014 }; // 10,000 seeded trials

describe('gate K1', () => { // engine correctness
  it('errs on at most 2% of 10,000 seeded trials, identically on every run', () => { // the gate itself
    const first = simulate({ ...RUN, user: USER }); // first run
    const second = simulate({ ...RUN, user: USER }); // same seed again
    console.log(`K1 eps=0.05: error ${(first.errorRate * 100).toFixed(2)}%, ${first.meanClicks.toFixed(3)} clicks/selection`); // measured values
    expect(second).toEqual(first); // deterministic
    expect(first.trials).toBe(10000); // the full trial count ran
    expect(first.errorRate).toBeLessThanOrEqual(0.02); // the pass condition
  }); // end of the case
  it('reports the measured values with no spurious user clicks', () => { // reported, not gated
    const r = simulate({ ...RUN, user: { ...USER, spuriousRate: 0 } }); // user eps = 0, engine eps still 0.05
    console.log(`K1 user eps=0: error ${(r.errorRate * 100).toFixed(2)}%, ${r.meanClicks.toFixed(3)} clicks/selection`); // measured values
    expect(r.trials).toBe(10000); // the full trial count ran
  }); // end of the case
}); // end of gate K1
