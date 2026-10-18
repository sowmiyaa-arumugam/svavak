// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Phase layout of plan §4.1: phases by posterior rank, in bit-reversal order.

/** The r-th value of the base-2 van der Corput sequence: 0, 1/2, 1/4, 3/4, 1/8, ... */
export function vanDerCorput(r: number): number { // r reversed as a binary fraction
  let value = 0; // accumulated fraction
  for (let bit = 0.5; r > 0; r >>= 1, bit /= 2) if (r & 1) value += bit; // mirror each bit of r about the binary point
  return value; // a phase in [0, 1)
} // end of vanDerCorput

/** Option indices from highest to lowest score; ties keep option order. */
export function rankOrder(scores: readonly number[]): number[] { // indices by rank
  return scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]! || a - b); // descending score, then index
} // end of rankOrder

/** Phase for each option: rank 0 (highest score) gets 0, rank 1 gets 1/2, and so on. */
export function phasesByRank(scores: readonly number[]): number[] { // phase per option, in option order
  const phases = new Array<number>(scores.length); // result, indexed by option
  rankOrder(scores).forEach((option, rank) => (phases[option] = vanDerCorput(rank))); // the rank decides the phase
  return phases; // options keep their positions; only their phases change
} // end of phasesByRank
