// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Smoke test: plain Node imports the package's TypeScript source by name, with no build step.

import assert from 'node:assert/strict'; // Node's assertions (this script only; the package stays Node-free)
import { DEFAULT_CONFIG, Engine } from 'switchclock'; // the package entry point, resolved through "exports"
import { mulberry32, simulate } from 'switchclock/sim'; // the simulator entry point

const engine = new Engine(DEFAULT_CONFIG, () => 0); // engine with a fixed injected clock
engine.setOptions([{ id: 'yes', score: 0.5 }, { id: 'no', score: 0.5 }]); // two replies
assert.equal(engine.click(DEFAULT_CONFIG.periodMs).committed, 'yes'); // a click on "yes" at noon commits it
const options = [{ id: 'yes', score: 0.5 }, { id: 'no', score: 0.5 }]; // options for the simulator
const user = { biasMs: 0, noiseMs: 100, spuriousRate: 0 }; // a synthetic user
const summary = simulate({ config: DEFAULT_CONFIG, options, targets: ['yes', 'no'], user, trials: 50, seed: 1 }); // a short run
assert.equal(summary.trials, 50); // every trial ran
assert.equal(typeof mulberry32(1)(), 'number'); // the generator is exported too
console.log(`smoke ok: Node ${process.version} imported switchclock from TypeScript source`); // report success
