// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import fc from 'fast-check'; // property-based testing
import { DEFAULT_SCAN_CONFIG, ScanEngine, type ScanConfig } from '../src/core/scan.ts'; // the engine driven
import { mulberry32 } from '../sim/random.ts'; // seeded generator
import { draw, nextOnset, scanPressTime, simulateScan, simulateScanSelection } from '../sim/scan.ts'; // units under test

const CFG: ScanConfig = { ...DEFAULT_SCAN_CONFIG, noiseMs: 100 }; // defaults with sigma = 100 ms
const ABC = [{ id: 'a', score: 0.5 }, { id: 'b', score: 0.5 }, { id: 'c', score: 0.5 }]; // three equally likely replies
const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, score: 0.5 })); // five equally likely replies
const SHARP = { biasMs: 400, noiseMs: 10, spuriousRate: 0 }; // a very precise synthetic user

describe('draw', () => { // weighted target choice
  it('draws in proportion to the weights and never a zero weight', () => { // frequencies
    const rng = mulberry32(5); // seeded stream
    const xs = Array.from({ length: 20000 }, () => draw([1, 0, 3], rng)); // samples
    const count = (k: number) => xs.filter((x) => x === k).length; // how often k was drawn
    expect(count(1)).toBe(0); // a zero weight is never drawn
    expect(count(2) / count(0)).toBeCloseTo(3, 0); // about 3 : 1
  }); // end of the case
}); // end of draw

describe('nextOnset', () => { // when the synthetic user's target lights up next
  it('finds the first time at or after a moment that the option lights up, through any rescans', () => { // property
    const gaps = fc.array(fc.integer({ min: 150, max: 10000 }), { maxLength: 6 }); // whole-ms gaps between presses
    const args = fc.tuple(gaps, fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 20000 })); // presses, option, wait
    fc.assert(fc.property(args, ([g, k, dt]) => { // for each case
      let time = 0; // the injected clock
      const engine = new ScanEngine({ ...CFG, threshold: 1.01 }, () => time); // never commits
      engine.setOptions(FIVE); // full scan from 0
      for (const gap of g) engine.click((time += gap)); // each press starts a rescan of the top two
      const after = time + dt; // the moment to look from
      const onset = nextOnset(engine, CFG, k, after); // value under test
      expect(onset).toBeGreaterThanOrEqual(after); // not before the moment
      expect(engine.highlighted(onset)).toBe(k); // the option is lit then
      let earlier = false; // whether it lit up sooner
      for (let u = after; u < onset; u++) if (engine.highlighted(u) === k && engine.highlighted(u - 1) !== k) earlier = true; // every ms before it
      expect(earlier).toBe(false); // it did not
    })); // end of the property
  }); // end of the case
  it('waits for the full scan when the option is not in the rescan or its turn there has passed', () => { // spot values
    let time = 0; // the injected clock: options set at 0
    const engine = new ScanEngine(CFG, () => time); // engine on the test clock
    engine.setOptions(ABC); // cycle 4 s
    time = 3650; // the non-committing press of the engine tests
    engine.click(time); // starts the rescan of a and c, from 3.65 s to 6.65 s
    expect(nextOnset(engine, CFG, 2, time)).toBe(5650); // c: second in the rescan, 2 s in
    expect(nextOnset(engine, CFG, 1, time)).toBe(8650); // b: not in it; 2 s into the full scan from 6.65 s
    expect(nextOnset(engine, CFG, 0, time + 1)).toBe(6650); // a: its rescan onset has passed; the full scan opens with it
  }); // end of the case
}); // end of nextOnset

describe('scan synthetic user', () => { // press timing
  it('aims a reaction time after the onset, or presses uniformly over a cycle when spurious', () => { // the two press kinds
    const engine = new ScanEngine(CFG, () => 0); // options set at 0
    engine.setOptions(FIVE); // cycle 6 s; c lights up at 3 s
    const rng = mulberry32(1); // seeded stream
    expect(scanPressTime({ biasMs: 400, noiseMs: 0, spuriousRate: 0 }, rng, engine, CFG, 2, 500)).toBe(3400); // 3 s + 400 ms
    for (let i = 0; i < 100; i++) { // spurious presses
      const t = scanPressTime({ biasMs: 400, noiseMs: 0, spuriousRate: 1 }, rng, engine, CFG, 2, 500); // always spurious
      expect(t >= 500 && t < 6500).toBe(true); // within the cycle after 500
    } // end of the presses
  }); // end of the case
}); // end of scan synthetic user

describe('scan simulator', () => { // trials through the real engine
  it('selects the target with one press for a precise user', () => { // a single trial
    const trial = simulateScanSelection(CFG, FIVE, 'd', SHARP, mulberry32(3)); // aim at d, lit from 4 s
    expect(trial.committed).toBe('d'); // reached the target
    expect(trial.presses).toBe(1); // one press
    expect(trial.durationMs).toBeCloseTo(4400, -2); // about 400 ms after d lit up
  }); // end of the case
  it('counts errors, presses and seconds exactly as the trials it runs', () => { // the summary arithmetic
    const user = { biasMs: 400, noiseMs: 300, spuriousRate: 0.1 }; // a sloppy user, so some commits are wrong
    const weights = [1, 1, 1, 1, 1]; // targets uniform over the five options
    const rng = mulberry32(4); // the stream simulateScan will use for seed 4
    let errors = 0; // replayed wrong commits
    let presses = 0; // replayed presses
    let ms = 0; // replayed time
    for (let i = 0; i < 200; i++) { // the same 200 trials, one by one
      const target = FIVE[draw(weights, rng)]!.id; // the same target draw
      const trial = simulateScanSelection(CFG, FIVE, target, user, rng); // the same trial
      errors += trial.committed === target ? 0 : 1; // a wrong commit
      presses += trial.presses; // its presses
      ms += trial.durationMs; // its time
    } // end of the replay
    const summary = simulateScan({ config: CFG, options: FIVE, targetWeights: weights, user, trials: 200, seed: 4 }); // tested
    expect(errors).toBeGreaterThan(0); // the error count is exercised
    expect(summary).toEqual({ trials: 200, errorRate: errors / 200, meanClicks: presses / 200, meanSeconds: ms / 200 / 1000 }); // exact
  }); // end of the case
  it('gives the same summary for the same seed', () => { // reproducible from a seed (FR-22)
    const user = { biasMs: 400, noiseMs: 150, spuriousRate: 0.1 }; // a noisy user
    const run = { config: CFG, options: FIVE, targetWeights: [1, 1, 1, 1, 1], user, trials: 300 }; // a short run
    expect(simulateScan({ ...run, seed: 9 })).toEqual(simulateScan({ ...run, seed: 9 })); // identical
  }); // end of the case
}); // end of scan simulator
