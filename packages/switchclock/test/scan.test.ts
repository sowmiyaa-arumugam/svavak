// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import fc from 'fast-check'; // property-based testing
import { priors } from '../src/core/priors.ts'; // the expected starting posterior
import { cycleMs, DEFAULT_SCAN_CONFIG, normalCdf, onsetMs, ScanEngine, type ScanConfig, windowMs } from '../src/core/scan.ts'; // under test

const CFG: ScanConfig = DEFAULT_SCAN_CONFIG; // mu = 150 ms, sigma = 120 ms, eps = 0.05, theta = 0.97
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
const simpson = (x: number): number => { // the standard normal density integrated from -10 to x, as a reference for Phi
  const n = 20000; // even number of intervals
  const h = (x + 10) / n; // interval width
  let sum = 0; // weighted sum of the density
  for (let i = 0; i <= n; i++) sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * Math.exp(-((-10 + i * h) ** 2) / 2); // Simpson's weights
  return (sum * h) / 3 / Math.sqrt(2 * Math.PI); // the integral
}; // end of simpson

describe('scan timing', () => { // cycle, onsets and windows
  it('gives every option one step and the first one extra time', () => { // the defaults
    expect(cycleMs(10, CFG)).toBe(11000); // 8 replies and 2 controls: 10 x 1 s + 1 s
    expect(cycleMs(2, CFG)).toBe(3000); // a top-two rescan: 2 s + 1 s
    expect([0, 1, 2, 9].map((p) => onsetMs(p, CFG))).toEqual([0, 2000, 3000, 10000]); // the first option's window is 2 s
    expect([0, 1, 9].map((p) => windowMs(p, CFG))).toEqual([2000, 1000, 1000]); // window lengths
  }); // end of the case
}); // end of scan timing

describe('normalCdf', () => { // Phi, for the window model
  it('matches numerical integration of the normal density to 1e-7', () => { // against an independent reference
    for (const x of [-4, -2.5, -1, 0, 0.5, 1.96, 3]) expect(Math.abs(normalCdf(x) - simpson(x))).toBeLessThan(1e-7); // spot values
  }); // end of the case
}); // end of normalCdf

describe('ScanEngine', () => { // the scanning state machine
  it('starts from the priors, with a full scan in option order from the injected clock', () => { // initial state
    const engine = make(); // fresh selection
    for (const p of engine.posterior()) expect(p).toBeCloseTo(1 / 3, 12); // uniform priors
    expect(engine.scanAt(T0)).toEqual({ items: [0, 1, 2], epoch: T0, end: Infinity }); // every option, repeating
    const ranked = [{ id: 'x', score: 0.6 }, { id: 'y', score: 0.3 }, { id: 'h', score: 0, control: true }]; // unequal scores
    const p = make(CFG, ranked).posterior(); // their posterior before any press
    priors(ranked, CFG).forEach((x, i) => expect(p[i]).toBeCloseTo(x, 12)); // is exactly the priors
  }); // end of the case
  it('highlights the options in the fixed order, the first for 2 s, and repeats', () => { // the highlight timeline
    const engine = make(); // cycle of 1 + 3 x 1 s = 4 s
    const at = [0, 1999, 2000, 2999, 3000, 3999, 4000, 5 * 4000 + 2500].map((dt) => engine.highlighted(T0 + dt)); // samples
    expect(at).toEqual([0, 0, 1, 1, 2, 2, 0, 1]); // a for 2 s, b, c, then a again; the same every cycle
  }); // end of the case
  it('commits an option pressed while it is lit', () => { // the main path
    const r = make().click(T0 + 2000 + 500 + CFG.biasMs); // mid-window for b, plus the reaction delay
    expect(r.accepted).toBe(true); // the press counted
    expect(r.committed).toBe('b'); // posterior about 0.975 >= 0.97
  }); // end of the case
  it('scores a late press on the 2 s first card like one in the middle of its window', () => { // late press, first card
    const late = make().click(T0 + 1500 + CFG.biasMs).posterior; // 1.5 s into a's 2 s window
    const middle = make().click(T0 + 1000 + CFG.biasMs).posterior; // 1 s into it
    expect(late[0]).toBeCloseTo(middle[0]!, 4); // the same support for a: about 0.951
    expect(late[0]).toBeGreaterThan(0.95); // a leads by far
    const ranked = [{ id: 'x', score: 0.6 }, { id: 'y', score: 0.2 }, { id: 'z', score: 0.2 }]; // a best guess first
    expect(make(CFG, ranked).click(T0 + 1500 + CFG.biasMs).committed).toBe('x'); // the late press chooses it
  }); // end of the case
  it('keeps both cards when a press comes just after the highlight moves on, the earlier about 2 : 1', () => { // boundary
    const engine = make(); // b's window ends at 3 s, c's begins
    time = T0 + 3100; // 100 ms after c lit up
    const r = engine.click(time); // as likely a late press for b as an early one for c
    expect(r.committed).toBeNull(); // too close to call
    expect(r.posterior[1]! / r.posterior[2]!).toBeCloseTo(1.92, 2); // b, which was lit, leads c about 2 : 1
    expect(r.posterior[2]).toBeGreaterThan(r.posterior[0]!); // and c leads a
    expect(engine.scanAt(time).items).toEqual([1, 2]); // the two are rescanned
  }); // end of the case
  it('measures each offset from the nearest window that really occurs', () => { // offsets
    const engine = make(); // cycle 4 s; onsets 0, 2 s, 3 s
    expect(engine.offsets(T0 + 2437)).toEqual([2437, 437, -563]); // a's next window at 4 s is further than its first
    expect(engine.offsets(T0 + 4437)[0]).toBe(437); // a's second window
    expect(engine.offsets(T0 + 3100)[0]).toBe(3100); // nearer a's first window than its second, allowing for the delay
    expect(engine.offsets(T0 + 100)[2]).toBe(-2900); // c had no window before the scan started
  }); // end of the case
  it('rescans the top two in scan order from now when a press does not commit, for one cycle', () => { // the rescan
    const engine = make(); // fresh selection
    time = T0 + 3100; // the boundary press above
    engine.click(time); // b and c lead
    const end = time + 3000; // one rescan cycle: 2 s + 1 s
    expect(engine.scanAt(time)).toEqual({ items: [1, 2], epoch: time, end }); // b, then c
    expect([0, 1999, 2000, 2999].map((dt) => engine.highlighted(time + dt))).toEqual([1, 1, 2, 2]); // b for 2 s, then c
    expect(engine.offsets(time + 500)[0]).toBeNull(); // a has no window in the rescan
    expect(engine.scanAt(end)).toEqual({ items: [0, 1, 2], epoch: end, end: Infinity }); // no press: the full scan again
    expect([0, 2000, 3000].map((dt) => engine.highlighted(end + dt))).toEqual([0, 1, 2]); // from the top
  }); // end of the case
  it('scores options outside the rescan with eps over the rescan cycle only, then commits within the pair', () => { // Bayes
    const engine = make(); // fresh selection
    time = T0 + 3100; // the boundary press: rescan of b and c from here
    const p1 = engine.click(time).posterior; // after the first press
    const r = engine.click(time + 1000 + CFG.biasMs); // mid-window for b, first in the rescan
    expect(r.committed).toBe('b'); // b is chosen
    const dens = (d: number, w: number) => (normalCdf((d - 150) / 120) - normalCdf((d - 150 - w) / 120)) / w; // window model
    const like = [0.05 / 3000, 0.95 * dens(1150, 2000) + 0.05 / 3000, 0.95 * dens(-850, 1000) + 0.05 / 3000]; // a unlit
    const joint = p1.map((p, i) => p * like[i]!); // prior times likelihood
    const total = joint.reduce((s, x) => s + x, 0); // the evidence
    r.posterior.forEach((p, i) => expect(p).toBeCloseTo(joint[i]! / total, 12)); // Bayes' rule with the rescan's cycle
  }); // end of the case
  it('scores a press just after a rescan ends against the rescan it answers', () => { // the look-back
    const engine = make(); // fresh selection
    time = T0 + 3100; // the boundary press: rescan of b and c, ending 3 s later
    engine.click(time); // start it
    const t = time + 3000 + 100; // 100 ms after it ended, as the full scan restarts with a
    expect(engine.offsets(t)[2]).toBe(1100); // c: from its window in the rescan
    expect(engine.click(t).posterior[2]).toBeGreaterThan(0.95); // a late press for c, not an early one for a
    const later = make(); // the same rescan, but the press comes once the full scan is well on
    time = T0 + 3100; // the boundary press
    later.click(time); // rescan of b and c until 6.1 s; the full scan then shows b from 8.1 s
    const u = time + 3000 + 2000 + 500 + CFG.biasMs; // mid-window for b in the full scan
    expect(later.offsets(u)[1]).toBe(650); // measured from b's full-scan window, not its rescan window
    expect(later.click(u).committed).toBe('b'); // and chosen
  }); // end of the case
  it('leaves the posterior unchanged when eps = 0 and no window can explain a press', () => { // no evidence, no NaN
    const engine = make({ ...CFG, spuriousRate: 0 }); // no spurious presses in the model
    const r = engine.click(T0 - 5000); // long before the scan started: every window's density is 0
    expect(r.accepted).toBe(true); // the press counted
    for (const p of r.posterior) expect(p).toBeCloseTo(1 / 3, 12); // still the priors, not NaN
  }); // end of the case
  it('starts a rescan when the press is handled, not at its key-down stamp', () => { // epoch from the injected clock
    const engine = make(); // fresh selection
    time = T0 + 3100 + 180; // handled 180 ms after the key went down (key-up on the TV)
    engine.click(T0 + 3100); // the boundary press, stamped at key-down
    expect(engine.scanAt(time)).toEqual({ items: [1, 2], epoch: time, end: time + 3000 }); // the pair lights up from now
  }); // end of the case
  it('debounces presses closer than debounceMs to the last accepted press', () => { // key repeat and tremor
    const engine = make({ ...CFG, threshold: 1.01 }); // unreachable theta, so nothing commits
    const t = T0 + 2650; // first press
    expect(engine.click(t).accepted).toBe(true); // counts
    const before = engine.posterior(); // posterior after it
    expect(engine.click(t + 149).accepted).toBe(false); // 149 ms later: ignored
    expect(engine.posterior()).toEqual(before); // and left the posterior alone
    expect(engine.click(t + 150).accepted).toBe(true); // 150 ms later: counts
  }); // end of the case
  it('ignores presses after a commit until options are set again', () => { // one selection per setOptions
    const engine = make(); // fresh selection
    engine.click(T0 + 2650); // commits b
    expect(engine.click(T0 + 6650).accepted).toBe(false); // ignored
    engine.setOptions(ABC); // next selection
    expect(engine.click(T0 + 10650).accepted).toBe(true); // counts again
  }); // end of the case
  it('restarts the full scan, which keeps repeating, when there are only two options', () => { // the pair is everything
    const engine = make(CFG, ABC.slice(0, 2)); // a and b; cycle 3 s
    time = T0 + 2100; // 100 ms after b lit up: too close to call
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
  it('measures every offset in the full scan from a real window: none before the start, the nearest after it', () => { // property
    const t = fc.double({ min: -1e5, max: 1e6, noNaN: true }); // any press time
    fc.assert(fc.property(t, (dt) => { // for each time
      const engine = make(CFG, FIVE); // cycle 6 s; onsets 0, 2, 3, 4, 5 s
      const cycle = cycleMs(5, CFG); // 6000 ms
      engine.offsets(T0 + dt).forEach((d, p) => { // every option
        const copies = (dt - onsetMs(p, CFG) - d!) / cycle; // which window the offset is measured from
        expect(Math.abs(copies - Math.round(copies))).toBeLessThan(1e-6); // a whole number of cycles in
        expect(copies).toBeGreaterThan(-1e-6); // never a window before the scan started
        const centre = CFG.biasMs + windowMs(p, CFG) / 2; // the expected offset of an aimed press
        if (copies > 0.5) expect(Math.abs(d! - centre)).toBeLessThanOrEqual(cycle / 2 + 1e-6); // a later copy is the nearest
      }); // end of the options
    })); // end of the property
  }); // end of the case
}); // end of ScanEngine
