// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Clock and click model of clock mode. All times are in milliseconds.

/** The parameters the click likelihood depends on. */
export interface ClickModel { // subset of the engine configuration
  periodMs: number; // T: one full turn of every clock
  biasMs: number; // mu: the user's mean offset from noon
  noiseMs: number; // sigma: the standard deviation of that offset
  spuriousRate: number; // eps: probability that a click is unrelated to any noon
} // end of ClickModel

/** w(x): the fractional part of x, mapped to [-1/2, 1/2). */
export function wrap(x: number): number { // nearest-integer remainder
  return x - Math.floor(x + 0.5); // subtract the nearest integer, rounding halves up
} // end of wrap

/** d_i(t) = T * w((t - t0)/T + phi_i): signed offset of a click from the option's nearest noon. */
export function offsetMs(t: number, t0: number, periodMs: number, phase: number): number { // offset in ms
  return periodMs * wrap((t - t0) / periodMs + phase); // turns to the nearest noon, as time
} // end of offsetMs

/** log L_i = log((1 - eps) N(d; mu, sigma) + eps / T), computed in log space. */
export function logLikelihood(d: number, m: ClickModel): number { // log-likelihood of one click offset
  const z = (d - m.biasMs) / m.noiseMs; // standardised offset
  const logNormal = -0.5 * z * z - Math.log(m.noiseMs * Math.sqrt(2 * Math.PI)); // log Gaussian density, per ms
  const aimed = Math.log(1 - m.spuriousRate) + logNormal; // log of the aimed-click term
  const spurious = Math.log(m.spuriousRate / m.periodMs); // log of the uniform term (-Infinity when eps = 0)
  return logSumExp([aimed, spurious]); // log of their sum
} // end of logLikelihood

/** log(sum exp(x_i)), stable for large and small magnitudes. */
export function logSumExp(xs: readonly number[]): number { // log-sum-exp normalising constant
  const m = Math.max(...xs); // factor out the largest term
  return m + Math.log(xs.reduce((s, x) => s + Math.exp(x - m), 0)); // every exp is at most 1
} // end of logSumExp

/** Shift log weights so that their exponentials sum to 1. */
export function normalise(xs: readonly number[]): number[] { // log-space normalisation
  const z = logSumExp(xs); // log of the total
  return xs.map((x) => x - z); // divide each weight by the total
} // end of normalise
