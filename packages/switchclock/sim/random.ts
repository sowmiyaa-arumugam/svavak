// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Seeded random numbers, so every simulation is reproducible.

/** Mulberry32: a small, fast 32-bit generator returning values in [0, 1). */
export function mulberry32(seed: number): () => number { // generator from a seed
  let state = seed >>> 0; // 32-bit unsigned state
  return () => { // next value
    state = (state + 0x6d2b79f5) >>> 0; // Weyl step
    let z = state; // mix a copy of the state
    z = Math.imul(z ^ (z >>> 15), z | 1); // first xorshift-multiply round
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61); // second round
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296; // final xorshift, scaled to [0, 1)
  }; // end of next value
} // end of mulberry32

/** A standard normal draw (Box-Muller). */
export function gaussian(rng: () => number): number { // N(0, 1)
  const u = 1 - rng(); // in (0, 1], so the log is finite
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); // radius times cosine of a uniform angle
} // end of gaussian
