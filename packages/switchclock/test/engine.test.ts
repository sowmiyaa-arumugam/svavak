// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'; // test API
import fc from 'fast-check'; // property-based testing
import { DEFAULT_CONFIG, Engine, type EngineConfig } from '../src/core/engine.ts'; // unit under test

const CFG: EngineConfig = { ...DEFAULT_CONFIG, noiseMs: 100 }; // the default values with sigma = 100 ms
const T0 = 1000; // the injected clock's time when options are set
const ABC = [{ id: 'a', score: 0.5 }, { id: 'b', score: 0.5 }, { id: 'c', score: 0.5 }]; // three equally likely replies
const make = (config: EngineConfig = CFG): Engine => { // engine with options set at T0
  const engine = new Engine(config, () => T0); // fixed injected clock
  engine.setOptions(ABC); // start a selection
  return engine; // ready for clicks
}; // end of make

describe('Engine', () => { // the selection state machine
  it('starts from the priors, with phases by prior rank and t0 from the injected clock', () => { // initial state
    const engine = make(); // fresh selection
    expect(engine.t0).toBe(T0); // epoch read from the clock
    for (const p of engine.posterior()) expect(p).toBeCloseTo(1 / 3, 12); // uniform priors
    expect(engine.phases()).toEqual([0, 0.5, 0.25]); // equal priors rank in option order
  }); // end of the case
  it('commits an option after a click on its noon when that reaches theta', () => { // the main path
    const r = make().click(T0 + CFG.periodMs); // a's noon one turn later
    expect(r.accepted).toBe(true); // the click counted
    expect(r.committed).toBe('a'); // posterior about 0.99 >= 0.95
    expect(r.posterior[0]).toBeGreaterThan(0.95); // a's posterior passed theta
  }); // end of the case
  it('re-phases by posterior rank after a click without moving the options', () => { // phases change, order does not
    const engine = make({ ...CFG, threshold: 0.999 }); // high theta, so one click does not commit
    const r = engine.click(T0 + CFG.periodMs); // a's noon
    expect(r.committed).toBeNull(); // not yet certain enough
    expect(engine.phases()[0]).toBe(0); // a leads, so it takes phase 0
    expect(engine.phases()).toEqual([0, 0.25, 0.5]); // c (600 ms off) now outranks b (1200 ms off)
    expect(r.posterior.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 12); // still a distribution over a, b, c
  }); // end of the case
  it('debounces clicks closer than debounceMs to the last accepted click', () => { // key repeat and tremor
    const engine = make({ ...CFG, threshold: 1.01 }); // unreachable theta, so nothing commits
    const t = T0 + CFG.periodMs; // first click time
    expect(engine.click(t).accepted).toBe(true); // first click counts
    const before = engine.posterior(); // posterior after one click
    expect(engine.click(t + 149).accepted).toBe(false); // 149 ms later: ignored
    expect(engine.posterior()).toEqual(before); // and left the posterior alone
    expect(engine.click(t + 150).accepted).toBe(true); // 150 ms later: counts
  }); // end of the case
  it('shows the top two after maxClicks and commits the leader of the two on the confirming click', () => { // K_max path
    const engine = make({ ...CFG, threshold: 1.01, maxClicks: 1 }); // confirm after one click
    const r1 = engine.click(T0 + CFG.periodMs / 4); // a is 600 ms late, b 600 ms early: a tie
    expect(r1.committed).toBeNull(); // theta is unreachable
    expect(r1.confirm).toEqual(['a', 'b']); // the tied pair, in option order
    expect(engine.phases()[1]).toBe(0.5); // b sits half a turn from a
    const r2 = engine.click(T0 + CFG.periodMs * 1.5); // b's noon: phase 1/2 reaches noon half a turn after t0
    expect(r2.committed).toBe('b'); // the confirming click picks b
    expect(r2.confirm).toBeNull(); // confirm is over
  }); // end of the case
  it('confirms a lone option against itself', () => { // one option has no runner-up
    const engine = new Engine({ ...CFG, threshold: 1.01, maxClicks: 1 }, () => 0); // confirm after one click
    engine.setOptions([{ id: 'only', score: 0.5 }]); // a single option
    expect(engine.click(0).confirm).toEqual(['only', 'only']); // it is both of the top two
    expect(engine.click(CFG.periodMs).committed).toBe('only'); // and the confirming click commits it
  }); // end of the case
  it('ignores clicks after a commit until options are set again', () => { // one selection per setOptions
    const engine = make(); // fresh selection
    engine.click(T0 + CFG.periodMs); // commits a
    expect(engine.click(T0 + 2 * CFG.periodMs).accepted).toBe(false); // ignored
    engine.setOptions(ABC); // next selection
    expect(engine.click(T0 + 3 * CFG.periodMs).accepted).toBe(true); // counts again
  }); // end of the case
  it('rejects an empty option list', () => { // nothing to select
    expect(() => new Engine(CFG, () => 0).setOptions([])).toThrow(); // a caller error
  }); // end of the case
  it('keeps a distribution with the leader at phase 0 for any click sequence', () => { // property
    const gaps = fc.array(fc.double({ min: 150, max: 1e4, noNaN: true }), { minLength: 1, maxLength: 12 }); // gaps between clicks
    fc.assert(fc.property(gaps, (g) => { // for each sequence
      const engine = make({ ...CFG, threshold: 1.01, maxClicks: 100 }); // never commits, never confirms
      let t = T0; // click time
      for (const gap of g) engine.click((t += gap)); // feed the clicks
      const p = engine.posterior(); // final posterior
      expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9); // sums to 1
      const lead = p.indexOf(Math.max(...p)); // the leading option
      expect(engine.phases()[lead]).toBe(0); // sits at phase 0
    })); // end of the property
  }); // end of the case
}); // end of Engine
