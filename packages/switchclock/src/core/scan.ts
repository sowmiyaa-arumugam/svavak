// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Scan mode: one highlight steps through the options in a fixed order, and each press is scored against the windows.

import erfc from '@stdlib/math-base-special-erfc'; // complementary error function (Apache-2.0; FreeBSD msun's s_erf.c)
import { type ClickModel, normalise } from './model.ts'; // the click-model parameters and log-space normalisation
import { rankOrder } from './phases.ts'; // options by posterior
import { type Option, type PriorConfig, priors } from './priors.ts'; // scores to priors

/** Scan-mode parameters. Times in milliseconds. */
export interface ScanConfig extends Omit<ClickModel, 'periodMs'>, PriorConfig { // click model (mu: reaction delay), priors, plus:
  stepMs: number; // s: how long each option stays highlighted
  firstExtraMs: number; // extra highlight time for the first option of every cycle
  threshold: number; // theta: commit once the leading posterior reaches this
  debounceMs: number; // presses closer than this to the last accepted press are ignored
} // end of ScanConfig

/** Defaults: a 1 s step, 1 s more on the first option, a 150 ms reaction delay, theta 0.97; the rest as in clock mode. */
export const DEFAULT_SCAN_CONFIG: ScanConfig = { // design values, not measurements
  stepMs: 1000, // s
  firstExtraMs: 1000, // the first option of each cycle stays highlighted for 2 s
  biasMs: 150, // mu: mean delay from the moment the user decides to the press
  noiseMs: 120, // sigma of that delay
  spuriousRate: 0.05, // eps
  threshold: 0.97, // theta: at 0.95, K1-scan's uniform case erred on 2.07% of trials (gate: 2%)
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

/** How long the option at position p of a cycle stays highlighted. */
export function windowMs(p: number, c: Timing): number { // window length
  return p === 0 ? c.stepMs + c.firstExtraMs : c.stepMs; // the first option gets the extra time
} // end of windowMs

/** Phi(x), the standard normal distribution function, through stdlib's erfc (double precision). */
export function normalCdf(x: number): number { // P(Z <= x)
  const z = Math.abs(x) / Math.SQRT2; // erfc argument for |x|
  const tail = erfc(z); // P(|Z| >= |x|), accurate far into the tail
  return x >= 0 ? 1 - tail / 2 : tail / 2; // Phi(x) = erfc(-x / sqrt 2) / 2
} // end of normalCdf

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

/** A highlight window a press may answer: the press's offset from its onset, and its length. */
interface Answer { // one window of one option
  d: number; // press time minus the window's onset, in ms
  w: number; // the window's length, in ms
} // end of Answer

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

  /** Offset of a press at t from the onset of the window it most likely answers, per option; null if none shows it. */
  offsets(t: number): (number | null)[] { // per option, in ms
    return this.answers(t).map((a) => (a === null ? null : a.d)); // the K2 log reads these
  } // end of offsets

  /** Current posterior per option. */
  posterior(): number[] { // probabilities
    return this.logPost.map(Math.exp); // out of log space
  } // end of posterior

  /** Report a press at time t (ms, same clock as now()). */
  click(t: number): ScanClickResult { // one switch press
    if (this.committed !== null || t - this.lastClick < this.config.debounceMs) return this.result(false); // ignored
    this.lastClick = t; // debounce the next press against this one
    const eps = this.config.spuriousRate; // probability that a press is unrelated to any window
    const floor = eps / cycleMs(this.scanAt(t).items.length, this.config); // eps spread over the running cycle
    const ll = this.answers(t).map((a) => Math.log((1 - eps) * (a === null ? 0 : this.density(a)) + floor)); // log L_k(t)
    if (ll.some(Number.isFinite)) this.logPost = normalise(this.logPost.map((lp, i) => lp + ll[i]!)); // Bayes' rule; with
    // eps = 0 a press that no window can explain carries no evidence, and the posterior stays as it was
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

  /**
   * For each option, the highlight window a press at t most likely answers, or null if no window shows the option.
   * Only windows that really occur count: the full scan's copies from its epoch on, and a rescan's single cycle. A
   * rescan that has just ended still counts, since a press can come one reaction delay after its last window.
   */
  private answers(t: number): (Answer | null)[] { // per option
    const running = this.scanAt(t); // the scan on screen at t
    const scans = running === this.scan ? [running] : [running, this.scan]; // plus the rescan that ended, if any
    return this.ids.map((_, k) => { // each option
      let best: Answer | null = null; // its likeliest window so far
      for (const { items, epoch, end } of scans) { // each scan that could have shown it
        const p = items.indexOf(k); // its position there, or -1
        if (p < 0) continue; // not shown by this scan
        const w = windowMs(p, this.config); // how long it is lit there
        const fromFirst = t - epoch - onsetMs(p, this.config); // offset from its first window there
        const cycle = cycleMs(items.length, this.config); // that scan's period
        const n = end === Infinity ? Math.max(0, Math.round((fromFirst - this.config.biasMs - w / 2) / cycle)) : 0; // copy
        const copy = { d: fromFirst - n * cycle, w }; // the offset from the nearest real copy's onset
        if (best === null || this.density(copy) > this.density(best)) best = copy; // keep the likelier window
      } // end of the scans
      return best; // null when neither scan shows the option
    }); // end of the options
  } // end of answers

  /** Density of an aimed press: uniform over the window, plus a reaction delay d ~ N(mu, sigma^2). */
  private density({ d, w }: Answer): number { // per ms
    const { biasMs: mu, noiseMs: sigma } = this.config; // the reaction delay
    return (normalCdf((d - mu) / sigma) - normalCdf((d - mu - w) / sigma)) / w; // [Phi(start term) - Phi(end term)] / length
  } // end of density

  private result(accepted: boolean): ScanClickResult { // snapshot for the caller
    return { accepted, posterior: this.posterior(), committed: this.committed }; // the state after this press
  } // end of result
} // end of ScanEngine
