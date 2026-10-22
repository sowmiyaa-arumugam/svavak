// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Seeded synthetic user and simulator: drives the real engine with simulated presses.

import { Engine, type EngineConfig } from '../src/core/engine.ts'; // the engine under simulation
import type { Option } from '../src/core/priors.ts'; // option shape
import { gaussian, mulberry32 } from './random.ts'; // seeded randomness

export { gaussian, mulberry32 } from './random.ts'; // re-exported for callers of the simulator

/** A simulated switch user, following the engine's own click model. */
export interface SyntheticUser { // timing behaviour
  biasMs: number; // mean offset from noon
  noiseMs: number; // standard deviation of the offset
  spuriousRate: number; // probability that a press is uniform over a turn instead of aimed
} // end of SyntheticUser

/** The user aims at a noon at least this long after the previous press (time to see the new layout). */
export const REACTION_LEAD_MS = 500; // fixed simulation assumption

/** First time at or after `after` when a clock with this phase points to noon. */
export function nextNoon(after: number, t0: number, periodMs: number, phase: number): number { // noon finder
  const turns = Math.ceil((after - t0) / periodMs + phase); // first whole turn at or after `after`
  return t0 + (turns - phase) * periodMs; // back to time
} // end of nextNoon

/** When the user presses, aiming at the clock with this phase from time `after` on. */
export function pressTime(user: SyntheticUser, rng: () => number, after: number, t0: number, periodMs: number, phase: number): number { // one press
  if (rng() < user.spuriousRate) return after + rng() * periodMs; // spurious: uniform over the turn
  return nextNoon(after, t0, periodMs, phase) + user.biasMs + user.noiseMs * gaussian(rng); // aimed, with bias and noise
} // end of pressTime

/** Outcome of one simulated selection. */
export interface Trial { // per-trial result
  target: string; // what the user wanted
  committed: string; // what the engine chose
  presses: number; // switch presses, including any the engine debounced
  durationMs: number; // from the clocks starting to the committing press
} // end of Trial

/** Run one selection to its commit, with simulated time starting at 0. */
export function simulateSelection(config: EngineConfig, options: readonly Option[], target: string, user: SyntheticUser, rng: () => number): Trial { // one trial
  let time = 0; // simulated clock
  const engine = new Engine(config, () => time); // engine reading the simulated clock
  engine.setOptions(options); // clocks start at time 0
  const index = options.findIndex((o) => o.id === target); // the target's position
  for (let presses = 1; ; presses++) { // press until the engine commits
    time = pressTime(user, rng, time + REACTION_LEAD_MS, engine.t0, config.periodMs, engine.phases()[index]!); // next press
    const r = engine.click(time); // report it
    if (r.committed !== null) return { target, committed: r.committed, presses, durationMs: time }; // done
  } // a commit is guaranteed within maxClicks + 1 accepted presses
} // end of simulateSelection

/** Aggregate over seeded trials. */
export interface Summary { // what a run measured
  trials: number; // number of selections
  errorRate: number; // fraction committed to something other than the target
  meanClicks: number; // mean presses per selection
} // end of Summary

/** Run `trials` selections; each target is drawn uniformly from `targets`. The same seed gives the same summary. */
export function simulate(run: { config: EngineConfig; options: readonly Option[]; targets: readonly string[]; user: SyntheticUser; trials: number; seed: number }): Summary { // a seeded run
  const rng = mulberry32(run.seed); // one stream for the whole run
  let errors = 0; // wrong commits
  let presses = 0; // total presses
  for (let i = 0; i < run.trials; i++) { // each trial
    const target = run.targets[Math.floor(rng() * run.targets.length)]!; // uniform target
    const trial = simulateSelection(run.config, run.options, target, run.user, rng); // run it
    if (trial.committed !== target) errors++; // count a wrong commit
    presses += trial.presses; // add its presses
  } // end of the trials
  return { trials: run.trials, errorRate: errors / run.trials, meanClicks: presses / run.trials }; // the summary
} // end of simulate
