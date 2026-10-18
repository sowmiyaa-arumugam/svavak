// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The one clock shared by the engine, the switch handler and the dials (plan §4.2), and the dial-angle maths.

/** Milliseconds on the shared clock: the JavaScript thread's performance.now, which also stamps animation frames. */
export const now = (): number => performance.now(); // the same clock everywhere in the app

/**
 * Hand position in turns past noon, in [0, 1), for an option with this phase: (t - t0)/T + phase, fractional part.
 * It is 0 exactly when the engine scores a press at time t as offset 0 from that option's noon.
 */
export function handTurns(t: number, t0: number, periodMs: number, phase: number): number { // hand position
  const turns = (t - t0) / periodMs + phase; // turns since the clocks started, shifted by the phase
  return turns - Math.floor(turns); // the fractional part: where the hand is on the dial
} // end of handTurns
