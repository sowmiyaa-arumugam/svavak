// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import fc from 'fast-check'; // property-based testing
import { priors } from '../src/core/priors.ts'; // the expected starting posterior
import { cycleMs, DEFAULT_SCAN_CONFIG, onsetMs, ScanEngine, type ScanConfig } from '../src/core/scan.ts'; // unit under test

const CFG: ScanConfig = { ...DEFAULT_SCAN_CONFIG, noiseMs: 100 }; // defaults with sigma = 100 ms
const T0 = 1000; // the injected clock's time when options are set
const ABC = [{ id: 'a', score: 0.5 }, { id: 'b', score: 0.5 }, { id: 'c', score: 0.5 }]; // three equally likely replies
const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, score: 0.5 })); // five equally likely replies
let time = T0; // the injected clock, moved by the tests
const make = (config: ScanConfig = CFG, options = ABC): ScanEngine => { // engine with options set at T0
  time = T0; // options are set at T0
  const engine = new ScanEngine(config, () => time); // engine on the test clock
  engine.setOptions(options); // start a selection
  return engine; // ready for presses
}; // end of make

describe('scan timing', () => { // cycle and onsets
  it('gives every option one step and the first one extra time', () => { // the defaults
    expect(cycleMs(10, CFG)).toBe(11000); // 8 replies and 2 controls: 10 x 1 s + 1 s
    expect(cycleMs(2, CFG)).toBe(3000); // a top-two rescan: 2 s + 1 s
    expect([0, 1, 2, 9].map((p) => onsetMs(p, CFG))).toEqual([0, 2000, 3000, 10000]); // the first option's window is 2 s
  }); // end of the case
}); // end of scan timing

describe('ScanEngine', () => { // the scanning state machine
  it('starts from the priors, with a full scan in option order from the injected clock', () => { // initial state
    const engine = make(); // fresh selection
    for (const p of engine.posterior()) expect(p).toBeCloseTo(1 / 3, 12); // uniform priors
    expect(engine.scanAt(T0)).toEqual({ items: [0, 1, 2], epoch: T0, end: Infinity }); // every option, repeating
    const ranked = [{ id: 'x', score: 0.6 }, { id: 'y', score: 0.3 }, { id: 'h', score: 0, control: true }]; // unequal scores
    const p = make(CFG, ranked).posterior(); // their posterior before any press
    priors(ranked, CFG).forEach((x, i) => expect(p[i]).toBeCloseTo(x, 12)); // is exactly the priors
  }); // end of the case
  it('starts a rescan when the press is handled, not at its key-down stamp', () => { // epoch from the injected clock
    const engine = make(); // fresh selection
    time = T0 + 3650 + 180; // handled 180 ms after the key went down (key-up on the TV)
    engine.click(T0 + 3650); // the non-committing press, stamped at key-down
    expect(engine.scanAt(time)).toEqual({ items: [0, 2], epoch: time, end: time + 3000 }); // the pair lights up from now
  }); // end of the case
  it('highlights the options in the fixed order, the first for 2 s, and repeats', () => { // the highlight timeline
    const engine = make(); // cycle of 1 + 3 x 1 s = 4 s
    const at = [0, 1999, 2000, 2999, 3000, 3999, 4000, 5 * 4000 + 2500].map((dt) => engine.highlighted(T0 + dt)); // samples
    expect(at).toEqual([0, 0, 1, 1, 2, 2, 0, 1]); // a for 2 s, b, c, then a again; the same every cycle
  }); // end of the case
  it('commits an option pressed one reaction time after its onset', () => { // the main path
    const engine = make(); // fresh selection
    const r = engine.click(T0 + 2000 + CFG.biasMs); // b lights up at 2 s; mu = 400 ms later
    expect(r.accepted).toBe(true); // the press counted
    expect(r.committed).toBe('b'); // posterior about 0.99 >= 0.95
    expect(r.posterior[1]).toBeGreaterThan(0.95); // b passed theta
  }); // end of the case
  it('measures each offset from the onset whose expected press is nearest', () => { // offsets
    const engine = make(); // cycle 4 s; onsets 0, 2 s, 3 s
    const [a = NaN, b = NaN, c = NaN] = engine.offsets(T0 + 2437) as number[]; // 437 ms after b's onset
    expect(b).toBeCloseTo(437, 9); // b: just after its expected press
    expect(a).toBeCloseTo(-1563, 9); // a: before its next onset at 4 s (2437 - 4000), nearer than 2437 after
    expect(c).toBeCloseTo(-563, 9); // c: before its onset at 3 s
  }); // end of the case
  it('rescans the top two in scan order from now when a press does not commit, for one cycle', () => { // the rescan
    const engine = make(); // c's expected press is at 3.4 s
    time = T0 + 3650; // 250 ms late for c: posterior about 0.88, short of theta
    const r = engine.click(time); // press
    expect(r.committed).toBeNull(); // not sure enough
    const end = time + 3000; // one rescan cycle: 2 s + 1 s
    expect(engine.scanAt(time)).toEqual({ items: [0, 2], epoch: time, end }); // c leads, a (350 ms early) edges out b
    const lit = [0, 1999, 2000, 2999].map((dt) => engine.highlighted(time + dt)); // the rescan's timeline
    expect(lit).toEqual([0, 0, 2, 2]); // a for 2 s, then c; b is skipped
    expect(engine.offsets(time + 500)[1]).toBeNull(); // b has no onset in the rescan
    expect(engine.scanAt(end)).toEqual({ items: [0, 1, 2], epoch: end, end: Infinity }); // no press: the full scan again
    expect([0, 2000, 3000].map((dt) => engine.highlighted(end + dt))).toEqual([0, 1, 2]); // from the top
  }); // end of the case
  it('scores options outside the rescan as spurious only, then commits within the pair', () => { // unlit options
    const engine = make(); // fresh selection
    time = T0 + 3650; // the non-committing press above: rescan of a and c
    const p1 = engine.click(time).posterior; // after the first press
    const r = engine.click(time + 2000 + CFG.biasMs); // mu after c's rescan onset
    expect(r.committed).toBe('c'); // c is chosen
    const pdf = (d: number) => Math.exp(-0.5 * ((d - 400) / 100) ** 2) / (100 * Math.sqrt(2 * Math.PI)); // N(d; mu, sigma)
    const like = [0.95 * pdf(-600) + 0.05 / 3000, 0.05 / 3000, 0.95 * pdf(400) + 0.05 / 3000]; // a, unlit b, c: eps over 3 s
    const joint = p1.map((p, i) => p * like[i]!); // prior times likelihood
    const total = joint.reduce((s, x) => s + x, 0); // the evidence
    r.posterior.forEach((p, i) => expect(p).toBeCloseTo(joint[i]! / total, 12)); // Bayes' rule with the rescan's own cycle
  }); // end of the case
  it('debounces presses closer than debounceMs to the last accepted press', () => { // key repeat and tremor
    const engine = make({ ...CFG, threshold: 1.01 }); // unreachable theta, so nothing commits
    const t = T0 + 2400; // first press
    expect(engine.click(t).accepted).toBe(true); // counts
    const before = engine.posterior(); // posterior after it
    expect(engine.click(t + 149).accepted).toBe(false); // 149 ms later: ignored
    expect(engine.posterior()).toEqual(before); // and left the posterior alone
    expect(engine.click(t + 150).accepted).toBe(true); // 150 ms later: counts
  }); // end of the case
  it('ignores presses after a commit until options are set again', () => { // one selection per setOptions
    const engine = make(); // fresh selection
    engine.click(T0 + 2400); // commits b
    expect(engine.click(T0 + 6400).accepted).toBe(false); // ignored
    engine.setOptions(ABC); // next selection
    expect(engine.click(T0 + 10400).accepted).toBe(true); // counts again
  }); // end of the case
  it('restarts the full scan, which keeps repeating, when there are only two options', () => { // the pair is everything
    const engine = make(CFG, ABC.slice(0, 2)); // a and b; cycle 3 s
    time = T0 + 1500; // far from both expected presses
    expect(engine.click(time).committed).toBeNull(); // no commit
    expect(engine.scanAt(time + 1e6)).toEqual({ items: [0, 1], epoch: time, end: Infinity }); // from now, without end
  }); // end of the case
  it('rejects an empty option list', () => { // nothing to select
    expect(() => new ScanEngine(CFG, () => 0).setOptions([])).toThrow(); // a caller error
  }); // end of the case
  it('keeps a distribution, a fixed order and the top two in any rescan, for any press sequence', () => { // property
    const gaps = fc.array(fc.double({ min: 150, max: 1e4, noNaN: true }), { minLength: 1, maxLength: 12 }); // gaps between presses
    const look = fc.double({ min: 0, max: 2e4, noNaN: true }); // how long after the last press to look
    fc.assert(fc.property(gaps, look, (g, dt) => { // for each sequence
      const engine = make({ ...CFG, threshold: 1.01 }, FIVE); // never commits, so every press starts a rescan
      for (const gap of g) engine.click((time += gap)); // feed the presses; each rescan starts at its press
      const p = engine.posterior(); // final posterior
      expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9); // sums to 1
      const scan = engine.scanAt(time + dt); // the scan running then
      expect(scan.items).toContain(engine.highlighted(time + dt)); // the highlight is on one of its options
      expect(scan.items).toEqual([...scan.items].sort((x, y) => x - y)); // in option order: no re-phasing
      const rest = p.filter((_, i) => !scan.items.includes(i)); // posterior of the options left out
      if (dt >= 3000) expect(scan.items).toEqual([0, 1, 2, 3, 4]); // after the 3 s rescan: everything again
      else for (const i of scan.items) expect(p[i]!).toBeGreaterThanOrEqual(Math.max(...rest)); // the pair are the top two
    })); // end of the property
  }); // end of the case
  it('keeps every offset within half a cycle of the reaction time and a whole number of cycles from its onset', () => { // property
    const t = fc.double({ min: -1e6, max: 1e6, noNaN: true }); // any press time
    fc.assert(fc.property(t, (dt) => { // for each time
      const engine = make(CFG, FIVE); // cycle 6 s; onsets 0, 2, 3, 4, 5 s
      const cycle = cycleMs(5, CFG); // 6000 ms
      engine.offsets(T0 + dt).forEach((d, p) => { // every option
        expect(d! - CFG.biasMs).toBeGreaterThanOrEqual(-cycle / 2 - 1e-6); // within half a cycle before mu
        expect(d! - CFG.biasMs).toBeLessThan(cycle / 2 + 1e-6); // and half a cycle after it
        const cycles = (dt - onsetMs(p, CFG) - d!) / cycle; // onset distance in cycles
        expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-6); // a whole number
      }); // end of the options
    })); // end of the property
  }); // end of the case
}); // end of ScanEngine
