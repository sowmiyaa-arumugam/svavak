// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Scan mode: one highlight steps through the options in a fixed order, and each press is scored from the onsets.

import { type ClickModel, logLikelihood, normalise, wrap } from './model.ts'; // click likelihood and log-space helpers
import { rankOrder } from './phases.ts'; // options by posterior
import { type Option, type PriorConfig, priors } from './priors.ts'; // scores to priors

/** Scan-mode parameters. Times in milliseconds. */
export interface ScanConfig extends Omit<ClickModel, 'periodMs'>, PriorConfig { // click model (mu from onset), priors, plus:
  stepMs: number; // s: how long each option stays highlighted
  firstExtraMs: number; // extra highlight time for the first option of every cycle
  threshold: number; // theta: commit once the leading posterior reaches this
  debounceMs: number; // presses closer than this to the last accepted press are ignored
} // end of ScanConfig

/** Defaults: a 1 s step, 1 s more on the first option, a 400 ms reaction time; the rest as in clock mode. */
export const DEFAULT_SCAN_CONFIG: ScanConfig = { // design values, not measurements
  stepMs: 1000, // s
  firstExtraMs: 1000, // the first option of each cycle stays highlighted for 2 s
  biasMs: 400, // mu: mean reaction time from highlight onset to press
  noiseMs: 120, // sigma, as in clock mode until calibration (P1)
  spuriousRate: 0.05, // eps
  threshold: 0.95, // theta
  priorFloor: 0.02, // s_floor
  temperature: 1, // tau
  controlShare: 0.03, // 3% per control
  debounceMs: 150, // ignores key repeat and tremor
}; // end of DEFAULT_SCAN_CONFIG

/** The two timing parameters that place the highlights. */
type Timing = Pick<ScanConfig, 'stepMs' | 'firstExtraMs'>; // what the helpers below need

/** Length of one cycle over m options: every option's step, plus the first option's extra time. */
export function cycleMs(m: number, c: Timing): number { // cycle length
  return c.firstExtraMs + m * c.stepMs; // the scan repeats after this
} // end of cycleMs

/** Highlight onset of the option at position p of a cycle, measured from the start of the cycle. */
export function onsetMs(p: number, c: Timing): number { // onset within a cycle
  return p === 0 ? 0 : c.firstExtraMs + p * c.stepMs; // the first option opens the cycle; the rest follow its longer window
} // end of onsetMs

/** A running scan: the options it highlights, in scan order, from `epoch` until `end`. */
export interface Scan { // the full scan or a top-two rescan
  items: readonly number[]; // option indices, in scan order
  epoch: number; // start of its first cycle, in ms
  end: number; // when it stops: after one cycle for a rescan, never (Infinity) for the full scan
} // end of Scan

/** What a press did. Arrays are in option order. */
export interface ScanClickResult { // returned by ScanEngine.click
  accepted: boolean; // false when debounced or after a commit
  posterior: readonly number[]; // P(i | presses)
  committed: string | null; // the chosen option's id, once chosen
} // end of ScanClickResult

/** One selection at a time over a fixed set of options. Deterministic: time comes from the injected clock. */
export class ScanEngine { // single-switch Bayesian scanning
  private readonly config: ScanConfig; // parameters
  private readonly now: () => number; // injected clock, in ms
  private ids: string[] = []; // option ids, in scan order (never reordered)
  private order: number[] = []; // every option index, in scan order: the full scan
  private logPost: number[] = []; // normalised log posterior per option
  private scan: Scan = { items: [], epoch: 0, end: Infinity }; // the scan the last setOptions or press started
  private lastClick = -Infinity; // time of the last accepted press
  private committed: string | null = null; // the chosen id, once committed

  constructor(config: ScanConfig, now: () => number) { // create from a configuration and a clock
    this.config = config; // keep the parameters
    this.now = now; // keep the clock
  } // end of constructor

  /** Start a selection: priors from the scores, and a full scan in option order from now. */
  setOptions(options: readonly Option[]): void { // new selection
    if (options.length === 0) throw new Error('switchclock: setOptions needs at least one option'); // nothing to select
    this.ids = options.map((o) => o.id); // ids in scan order
    this.order = options.map((_, i) => i); // the full scan's items
    this.logPost = normalise(priors(options, this.config).map(Math.log)); // prior as a log distribution
    this.scan = { items: this.order, epoch: this.now(), end: Infinity }; // every option, starting now, repeating
    this.lastClick = -Infinity; // nothing to debounce against
    this.committed = null; // not chosen
  } // end of setOptions

  /** The scan running at time t: a top-two rescan runs for one cycle, then the full scan resumes from the top. */
  scanAt(t: number): Scan { // for scoring, rendering and the simulator
    if (t < this.scan.end) return this.scan; // the scan started last is still on
    return { items: this.order, epoch: this.scan.end, end: Infinity }; // nobody pressed during the rescan: everything again
  } // end of scanAt

  /** The option highlighted at time t. */
  highlighted(t: number): number { // for rendering
    const { items, epoch } = this.scanAt(t); // the scan on screen at t
    const cycle = cycleMs(items.length, this.config); // its cycle length
    const x = (((t - epoch) % cycle) + cycle) % cycle; // time into the current cycle, in [0, cycle)
    if (x < onsetMs(1, this.config)) return items[0]!; // the first option's longer window
    return items[Math.floor((x - this.config.firstExtraMs) / this.config.stepMs)]!; // a later option; x < cycle keeps it in range
  } // end of highlighted

  /** Offset of a press at t from each option's highlight onset in the scan running at t; null if it is not in it. */
  offsets(t: number): (number | null)[] { // per option, in ms
    const { items, epoch } = this.scanAt(t); // the scan the press answers
    const cycle = cycleMs(items.length, this.config); // its cycle length
    const mu = this.config.biasMs; // the expected reaction time
    const out: (number | null)[] = this.ids.map(() => null); // options outside the scan have no onset
    items.forEach((option, p) => { // each scanned option
      const late = t - epoch - onsetMs(p, this.config) - mu; // time past its expected press in the first cycle
      out[option] = mu + cycle * wrap(late / cycle); // from the onset whose expected press is nearest
    }); // end of the scanned options
    return out; // in option order
  } // end of offsets

  /** Current posterior per option. */
  posterior(): number[] { // probabilities
    return this.logPost.map(Math.exp); // out of log space
  } // end of posterior

  /** Report a press at time t (ms, same clock as now()). */
  click(t: number): ScanClickResult { // one switch press
    if (this.committed !== null || t - this.lastClick < this.config.debounceMs) return this.result(false); // ignored
    this.lastClick = t; // debounce the next press against this one
    const model = { ...this.config, periodMs: cycleMs(this.scanAt(t).items.length, this.config) }; // eps spread over the cycle
    const unlit = Math.log(model.spuriousRate / model.periodMs); // log L of an option the scan does not show
    const ll = this.offsets(t).map((d) => (d === null ? unlit : logLikelihood(d, model))); // log L_k(t)
    this.logPost = normalise(this.logPost.map((lp, i) => lp + ll[i]!)); // Bayes' rule in log space
    const rank = rankOrder(this.logPost); // options by posterior
    const first = rank[0]!; // the leader (there is always at least one option)
    if (this.logPost[first]! >= Math.log(this.config.threshold)) { // P(i*) >= theta
      this.committed = this.ids[first]!; // commit the leader
    } else { // not sure yet: rescan the top two, in scan order, from now
      const items = rank.slice(0, 2).sort((a, b) => a - b); // the pair keeps the fixed order; no re-phasing
      const epoch = this.now(); // the rescan starts when the press is handled
      const end = items.length < this.order.length ? epoch + cycleMs(items.length, this.config) : Infinity; // one cycle
      this.scan = { items, epoch, end }; // with one or two options the pair is the full scan, which repeats
    } // end of the commit check
    return this.result(true); // report the new state
  } // end of click

  private result(accepted: boolean): ScanClickResult { // snapshot for the caller
    return { accepted, posterior: this.posterior(), committed: this.committed }; // the state after this press
  } // end of result
} // end of ScanEngine
