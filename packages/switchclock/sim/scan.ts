// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Seeded synthetic user and simulator for scan mode: drives the real ScanEngine with simulated presses.

import type { Option } from '../src/core/priors.ts'; // option shape
import { cycleMs, onsetMs, type ScanConfig, ScanEngine, windowMs } from '../src/core/scan.ts'; // the engine under simulation
import { gaussian, mulberry32 } from './random.ts'; // seeded randomness
import type { Summary, SyntheticUser, Trial } from './simulate.ts'; // the user model and result shapes of clock mode

/** First highlight onset of option `k` at or after time `after`, if nobody presses before it. */
export function nextOnset(engine: ScanEngine, config: ScanConfig, k: number, after: number): number { // onset finder
  const { items, epoch, end } = engine.scanAt(after); // the scan running at `after`
  const cycle = cycleMs(items.length, config); // its cycle length
  const p = items.indexOf(k); // the option's position in it, or -1
  const first = epoch + onsetMs(p, config); // its onset in the first cycle
  const onset = first + Math.max(0, Math.ceil((after - first) / cycle)) * cycle; // the first one at or after `after`
  if (p >= 0 && onset < end) return onset; // shown by this scan before it stops
  return nextOnset(engine, config, k, end); // not in the rescan, or too late for it: the full scan that follows
} // end of nextOnset

/** When the user presses next, aiming at option `k` from time `after` on: while it is lit, plus the reaction delay. */
export function scanPressTime(user: SyntheticUser, rng: () => number, engine: ScanEngine, config: ScanConfig, k: number, after: number): number { // one press
  if (rng() < user.spuriousRate) return after + rng() * cycleMs(engine.scanAt(after).items.length, config); // spurious: uniform over a cycle
  const onset = nextOnset(engine, config, k, after); // when the target next lights up
  const w = windowMs(engine.scanAt(onset).items.indexOf(k), config); // and how long it stays lit
  return onset + rng() * w + user.biasMs + user.noiseMs * gaussian(rng); // a uniform moment in the window, plus the delay
} // end of scanPressTime

/** Index drawn with probability proportional to its weight. */
export function draw(weights: readonly number[], rng: () => number): number { // inverse-CDF sampling
  let u = rng() * weights.reduce((s, w) => s + w, 0); // a point on the total weight
  for (let i = 0; i < weights.length - 1; i++) if ((u -= weights[i]!) < 0) return i; // the weight it falls in
  return weights.length - 1; // the last weight, also when rounding leaves u at the top
} // end of draw

/** Run one selection to its commit, with simulated time starting at 0. */
export function simulateScanSelection(config: ScanConfig, options: readonly Option[], target: string, user: SyntheticUser, rng: () => number): Trial { // one trial
  let time = 0; // simulated clock
  const engine = new ScanEngine(config, () => time); // engine reading the simulated clock
  engine.setOptions(options); // the scan starts at time 0
  const index = options.findIndex((o) => o.id === target); // the target's position
  for (let presses = 1; ; presses++) { // press until the engine commits
    time = scanPressTime(user, rng, engine, config, index, time); // next press, aimed from the previous one on
    const r = engine.click(time); // report it
    if (r.committed !== null) return { target, committed: r.committed, presses, durationMs: time }; // done
  } // every aimed press can commit, so this ends
} // end of simulateScanSelection

/** Aggregate over seeded scan trials. */
export interface ScanSummary extends Summary { // the clock-mode summary, plus:
  meanSeconds: number; // mean time per selection, from the scan start to the committing press
} // end of ScanSummary

/** Run `trials` selections; each target is drawn by `targetWeights` (in option order). The same seed gives the same summary. */
export function simulateScan(run: { config: ScanConfig; options: readonly Option[]; targetWeights: readonly number[]; user: SyntheticUser; trials: number; seed: number }): ScanSummary { // a seeded run
  const rng = mulberry32(run.seed); // one stream for the whole run
  let errors = 0; // wrong commits
  let presses = 0; // total presses
  let ms = 0; // total time
  for (let i = 0; i < run.trials; i++) { // each trial
    const target = run.options[draw(run.targetWeights, rng)]!.id; // the option the user wants
    const trial = simulateScanSelection(run.config, run.options, target, run.user, rng); // run it
    if (trial.committed !== target) errors++; // count a wrong commit
    presses += trial.presses; // add its presses
    ms += trial.durationMs; // and its time
  } // end of the trials
  return { trials: run.trials, errorRate: errors / run.trials, meanClicks: presses / run.trials, meanSeconds: ms / run.trials / 1000 }; // the summary
} // end of simulateScan
