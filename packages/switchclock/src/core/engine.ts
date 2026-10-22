// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The clock-mode selection engine: log-space posterior, commit at theta, top-two confirm, re-phasing, debounce.

import { type ClickModel, logLikelihood, normalise, offsetMs } from './model.ts'; // clock and click model
import { phasesByRank, rankOrder } from './phases.ts'; // ranking and bit-reversal phase layout
import { type Option, type PriorConfig, priors } from './priors.ts'; // scores to priors

/** Engine parameters. Times in milliseconds. */
export interface EngineConfig extends ClickModel, PriorConfig { // likelihood and prior parameters, plus:
  threshold: number; // theta: commit once the leading posterior reaches this
  maxClicks: number; // K_max: clicks before falling back to a top-two confirm
  debounceMs: number; // clicks closer than this to the last accepted click are ignored
} // end of EngineConfig

/** Initial design values; bias and noise are the defaults used until calibration (P1). */
export const DEFAULT_CONFIG: EngineConfig = { // design values, not measurements
  periodMs: 2400, // T = 2.4 s
  threshold: 0.95, // theta
  spuriousRate: 0.05, // eps
  biasMs: 0, // mu
  noiseMs: 120, // sigma
  priorFloor: 0.02, // s_floor
  temperature: 1, // tau
  controlShare: 0.03, // 3% per control
  maxClicks: 6, // K_max
  debounceMs: 150, // ignores key repeat and tremor
}; // end of DEFAULT_CONFIG

/** What a click did. Arrays are in option order. */
export interface ClickResult { // returned by Engine.click
  accepted: boolean; // false when debounced or after a commit
  posterior: readonly number[]; // P(i | clicks)
  committed: string | null; // the chosen option's id, once chosen
  confirm: readonly [string, string] | null; // the top two, while waiting for a confirming click
} // end of ClickResult

/** One selection at a time over a fixed set of options. Deterministic: time comes from the injected clock. */
export class Engine { // single-switch Bayesian clock selection
  private readonly config: EngineConfig; // parameters
  private readonly now: () => number; // injected clock, in ms
  private ids: string[] = []; // option ids, in display order (never reordered)
  private logPost: number[] = []; // normalised log posterior per option
  private phase: number[] = []; // current clock phase per option
  private epoch = 0; // t0: when the clocks started
  private clicks = 0; // accepted clicks in this selection
  private lastClick = -Infinity; // time of the last accepted click
  private committed: string | null = null; // the chosen id, once committed
  private pair: [number, number] | null = null; // indices of the top two during confirm

  constructor(config: EngineConfig, now: () => number) { // create from a configuration and a clock
    this.config = config; // keep the parameters
    this.now = now; // keep the clock
  } // end of constructor

  /** Start a selection: priors from the scores, clocks started now, phases by prior rank. */
  setOptions(options: readonly Option[]): void { // new selection
    if (options.length === 0) throw new Error('switchclock: setOptions needs at least one option'); // nothing to select
    this.ids = options.map((o) => o.id); // remember the ids in display order
    this.logPost = normalise(priors(options, this.config).map(Math.log)); // prior as a log distribution
    this.phase = phasesByRank(this.logPost); // initial layout by prior rank
    this.epoch = this.now(); // the clocks start turning now
    this.clicks = 0; // no clicks yet
    this.lastClick = -Infinity; // nothing to debounce against
    this.committed = null; // not chosen
    this.pair = null; // not confirming
  } // end of setOptions

  /** t0: the time the clocks started, for rendering hands at (now - t0)/T + phase. */
  get t0(): number { // epoch accessor
    return this.epoch; // read-only view
  } // end of t0

  /** Current clock phase per option, in [0, 1). */
  phases(): number[] { // for rendering
    return [...this.phase]; // a copy, so callers cannot change the layout
  } // end of phases

  /** Current posterior per option. */
  posterior(): number[] { // probabilities
    return this.logPost.map(Math.exp); // out of log space
  } // end of posterior

  /** Report a click at time t (ms, same clock as now()). */
  click(t: number): ClickResult { // one switch press
    if (this.committed !== null || t - this.lastClick < this.config.debounceMs) return this.result(false); // ignored
    this.lastClick = t; // debounce the next click against this one
    this.clicks += 1; // count it
    const ll = this.phase.map((p) => logLikelihood(offsetMs(t, this.epoch, this.config.periodMs, p), this.config)); // log L_i(t)
    this.logPost = normalise(this.logPost.map((lp, i) => lp + ll[i]!)); // Bayes' rule in log space
    const rank = rankOrder(this.logPost); // options by posterior
    const first = rank[0]!; // the leader (there is always at least one option)
    const second = rank[1] ?? first; // the runner-up; a lone option is its own runner-up
    if (this.pair !== null) { // this was the confirming click
      const [a, b] = this.pair; // the two candidates shown
      this.committed = this.ids[this.logPost[a]! >= this.logPost[b]! ? a : b]!; // the likelier of the two
      this.pair = null; // confirm is over
    } else if (this.logPost[first]! >= Math.log(this.config.threshold)) { // P(i*) >= theta
      this.committed = this.ids[first]!; // commit the leader
    } else if (this.clicks >= this.config.maxClicks) { // K_max clicks without a commit
      this.pair = [first, second]; // show the top two for a confirming click
    } // otherwise keep clicking
    this.phase = phasesByRank(this.logPost); // re-phase by rank; card positions stay put
    return this.result(true); // report the new state
  } // end of click

  private result(accepted: boolean): ClickResult { // snapshot for the caller
    const pair = this.pair; // current confirm pair, if any
    const confirm = pair === null ? null : ([this.ids[pair[0]]!, this.ids[pair[1]]!] as const); // ids of the pair
    return { accepted, posterior: this.posterior(), committed: this.committed, confirm }; // the state after this click
  } // end of result
} // end of Engine
