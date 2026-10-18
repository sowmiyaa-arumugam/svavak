// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Dial-angle maths against the engine: each hand is at noon exactly when the engine scores a press as offset 0.

import { DEFAULT_CONFIG, Engine, offsetMs } from 'switchclock'; // the engine and its clock model
import { handTurns } from '../src/clock'; // tested
import { optionsFor } from '../src/conversation'; // the 12 options of the screen
import { QUESTIONS } from '../src/questions'; // the fixture

const T = DEFAULT_CONFIG.periodMs; // clock period

/** Distance between two dial positions, in turns, in [0, 1/2]. */
function apart(a: number, b: number): number { // circular distance
  const d = Math.abs(a - b) % 1; // distance modulo one turn
  return Math.min(d, 1 - d); // the shorter way round
} // end of apart

describe('handTurns', () => { // the dial angle
  it("matches the engine's offset for every option, before and after re-phasing", () => { // against engine phases
    let time = 1234.5; // clocks start at an arbitrary time
    const engine = new Engine(DEFAULT_CONFIG, () => time); // the engine on a fake clock
    engine.setOptions(optionsFor(QUESTIONS[0]!)); // the screen's 12 options
    for (let press = 0; press < 3; press++) { // the initial layout, then after each of two presses
      const phases = engine.phases(); // the layout the dials draw
      for (let k = 0; k < 200; k++) { // times across several turns
        const t = engine.t0 + k * 37.3; // a frame time
        for (const phase of phases) { // every dial
          const hand = handTurns(t, engine.t0, T, phase); // where the hand is drawn
          expect(hand).toBeGreaterThanOrEqual(0); // within one turn
          expect(hand).toBeLessThan(1); // within one turn
          expect(apart(hand, offsetMs(t, engine.t0, T, phase) / T)).toBeLessThan(1e-9); // same as the engine's offset
        } // end of the dials
      } // end of the times
      time = engine.t0 + (press + 1) * 900; // the next press
      engine.click(time); // re-phases the options
    } // end of the layouts
  }); // end of the case

  it("points at noon at each option's noon and turns clockwise once per period", () => { // geometry
    const t0 = 500; // clocks start
    for (const phase of [0, 0.5, 0.25, 0.75, 0.125, 0.0625]) { // bit-reversal phases
      const noon = t0 + (3 - phase) * T; // a noon of this option: (t - t0)/T + phase is 3
      expect(apart(handTurns(noon, t0, T, phase), 0)).toBeLessThan(1e-9); // hand at twelve
      expect(handTurns(noon + T / 4, t0, T, phase)).toBeCloseTo(0.25, 9); // a quarter period later: three o'clock
      expect(handTurns(noon - T / 4, t0, T, phase)).toBeCloseTo(0.75, 9); // a quarter period earlier: nine o'clock
    } // end of the phases
  }); // end of the case
}); // end of handTurns
