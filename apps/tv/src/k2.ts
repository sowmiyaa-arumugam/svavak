// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Gate K2 instrumentation (plan §10.4), used in dev builds only: frames per second, and press offsets from onset.

import type { Selection } from './conversation'; // one committed selection

/** Mean and sample standard deviation (n - 1 denominator) of one or more values; the deviation is NaN for one. */
export function meanSd(xs: readonly number[]): { mean: number; sd: number } { // summary statistics
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length; // arithmetic mean
  const squares = xs.reduce((s, x) => s + (x - mean) ** 2, 0); // sum of squared deviations
  return { mean, sd: Math.sqrt(squares / (xs.length - 1)) }; // n - 1: the sample SD (window spread plus timing noise)
} // end of meanSd

/** Counts animation frames and reports the rate once per window. */
export class FpsMeter { // frames per second
  private readonly windowMs: number; // reporting interval
  private readonly report: (fps: number) => void; // where each rate goes
  private start: number; // start of the current window
  private frames = 0; // frames since then

  constructor(start: number, windowMs: number, report: (fps: number) => void) { // start counting now
    this.start = start; // first window starts here
    this.windowMs = windowMs; // keep the interval
    this.report = report; // keep the sink
  } // end of constructor

  /** Called once per animation frame with the frame's time on the shared clock. */
  frame(t: number): void { // one frame
    this.frames += 1; // count it
    if (t - this.start < this.windowMs) return; // window not over yet
    this.report((this.frames * 1000) / (t - this.start)); // frames per second over the window
    this.start = t; // next window
    this.frames = 0; // from zero
  } // end of frame
} // end of FpsMeter

/** A selection logger: one line per committed selection, with running totals over the session. */
export function selectionLog(log: (line: string) => void): (selection: Selection) => void { // stateful logger
  const all: number[] = []; // every offset logged in this session
  let count = 0; // selections so far
  const ms = (x: number) => (Number.isNaN(x) ? 'n/a' : `${x.toFixed(1)} ms`); // one number for the log
  return (selection) => { // called on every commit
    count += 1; // this selection's number
    all.push(...selection.offsetsMs); // add its offsets to the session
    const one = meanSd(selection.offsetsMs); // this selection
    const session = meanSd(all); // the session so far
    const offsets = selection.offsetsMs.map((d) => d.toFixed(0)).join(', '); // each press, rounded to 1 ms
    log(`[K2] selection ${count} "${selection.label}": offsets ${offsets} ms; mean ${ms(one.mean)}, SD ${ms(one.sd)}`); // this one
    log(`[K2] session: ${count} selections, ${all.length} presses; mean ${ms(session.mean)}, SD ${ms(session.sd)}`); // so far
  }; // end of the logger
} // end of selectionLog
