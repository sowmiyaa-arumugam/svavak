// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import { priors } from '../src/core/priors.ts'; // to check the AI-like case's priors
import { DEFAULT_SCAN_CONFIG, type ScanConfig } from '../src/core/scan.ts'; // scan-mode defaults
import { simulateScan } from '../sim/scan.ts'; // seeded scan simulator

// Gate K1-scan: engine and user share mu = 400 ms, sigma = 100 ms, eps = 0.05; theta = 0.95, s = 1 s (+1 s first)
const CONFIG: ScanConfig = { ...DEFAULT_SCAN_CONFIG, biasMs: 400, noiseMs: 100, spuriousRate: 0.05, threshold: 0.95, stepMs: 1000 }; // engine
const USER = { biasMs: 400, noiseMs: 100, spuriousRate: 0.05 }; // synthetic-user side, matching the engine
const CONTROLS = ['something else', 'help'].map((id) => ({ id, score: 0, control: true })); // the two controls, scanned last
const AI_SCORES = [0.35, 0.2, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04]; // AI-like reply priors, best guess first
const SEED = 20261014; // as in K1
const CASES = [ // the two gated cases, 10,000 trials each
  { // uniform reply priors; controls at the default 3% each; targets uniform over the 8 replies
    name: 'uniform', // label for the report
    config: CONFIG, // default control share
    options: [...Array.from({ length: 8 }, (_, i) => ({ id: `reply${i}`, score: 0.5 })), ...CONTROLS], // 8 equal replies, then the controls
    targetWeights: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // a reply, uniformly
  }, // end of the uniform case
  { // AI-like priors; the remaining 2% split over the controls; targets drawn from those priors
    name: 'AI-like', // label for the report
    config: { ...CONFIG, controlShare: 0.01 }, // 1% each, so the engine's priors equal the scores
    options: [...AI_SCORES.map((score, i) => ({ id: `reply${i}`, score })), ...CONTROLS], // ranked replies, then the controls
    targetWeights: [...AI_SCORES, 0.01, 0.01], // the priors themselves, controls included
  }, // end of the AI-like case
]; // end of the cases

describe('gate K1-scan', () => { // scan-mode correctness
  it('uses the AI-like priors exactly as given', () => { // the case set-up
    const p = priors(CASES[1]!.options, CASES[1]!.config); // the engine's priors for the AI-like case
    p.forEach((x, i) => expect(x).toBeCloseTo(CASES[1]!.targetWeights[i]!, 12)); // 0.35 ... 0.04, 0.01, 0.01
  }); // end of the case
  for (const c of CASES) { // each case
    it(`errs on at most 2% of 10,000 seeded trials with ${c.name} priors, identically on every run`, () => { // the gate itself
      const run = { config: c.config, options: c.options, targetWeights: c.targetWeights, user: USER, trials: 10000, seed: SEED }; // the run
      const first = simulateScan(run); // first run
      const second = simulateScan(run); // same seed again
      const line = `${(first.errorRate * 100).toFixed(2)}%, ${first.meanClicks.toFixed(3)} presses, ${first.meanSeconds.toFixed(2)} s`; // measured
      console.log(`K1-scan ${c.name}: error ${line} per selection`); // the report
      expect(second).toEqual(first); // deterministic
      expect(first.trials).toBe(10000); // the full trial count ran
      expect(first.errorRate).toBeLessThanOrEqual(0.02); // the pass condition
    }); // end of the case
  } // end of the cases
}); // end of gate K1-scan
