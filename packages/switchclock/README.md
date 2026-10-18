# switchclock

A Bayesian single-switch selection engine (plan §4.1), with a seeded synthetic user and simulator.

Each option has a small clock, and every clock turns with the same period T. To choose an option, the user
presses the one switch when that option's hand points to noon. Each press updates a posterior over the options,
and the engine commits when the leading option reaches the threshold θ. Pure TypeScript with no runtime
dependencies, so the same source runs in React Native (Hermes via Metro), in the browser and in Node 24.

## What it does

- **Click model.** A press at offset d from an option's nearest noon has likelihood
  L = (1 − ε)·N(d; μ, σ) + ε/T, where ε is the probability that a press is spurious.
- **Posterior and commit.** The posterior is computed in log space with log-sum-exp normalisation. The engine
  commits once P(i*) ≥ θ. If no option reaches θ after K_max presses, it reports the top two, and one
  confirming press picks the likelier of the pair.
- **Re-phasing.** After every press, clock phases are reassigned by posterior rank in bit-reversal order
  (0, ½, ¼, ¾, …). Card positions never change; only the phases do.
- **Priors.** Model scores become priors: π ∝ max(s, s_floor)^(1/τ). Each control option (Undo, More, Spell,
  Help) first receives a fixed share.
- **Debounce.** A press closer than `debounceMs` to the last accepted press is ignored.
- **Simulator** (`switchclock/sim`). A seeded synthetic user follows the same click model and drives the real
  engine. The same seed always gives the same result.

Not yet built (P1): calibration and adaptation, undo, snapshot and restore, the benchmark sweep.

## Use

```ts
import { DEFAULT_CONFIG, Engine } from 'switchclock';

const engine = new Engine(DEFAULT_CONFIG, () => performance.now()); // injected clock, in ms
engine.setOptions([{ id: 'yes', score: 0.6 }, { id: 'no', score: 0.3 }, { id: 'undo', score: 0, control: true }]);
// Draw option i's hand at (now - engine.t0) / periodMs + engine.phases()[i] turns.
const r = engine.click(pressTimestampMs); // { accepted, posterior, committed, confirm }
```

The package exports its TypeScript source directly, with no build step. Node 24 runs it through type stripping,
which is why the source uses only erasable syntax and `.ts` import paths.

## Gate K1 result

Setup:
- The engine and the synthetic user both use μ = 0, σ = 100 ms and ε = 0.05, with θ = 0.95, T = 2.4 s.
- There are 12 options: 8 replies with uniform priors and 4 controls.
- Each trial's target is drawn uniformly from the 8 replies.
- 10,000 trials with seed 20261014 ([test/k1.test.ts](test/k1.test.ts)).

| User's ε | Error rate | Mean presses per selection |
|---|---|---|
| 0.05 (gate: error ≤ 2%) | **1.19%** | 2.224 |
| 0 (reported only) | 0.00% | 2.120 |

Running K1 twice with the same seed gives identical results, and the test asserts this. The figures above are
measured by the simulator, not taken from trials with users.

Simulator assumption: the synthetic user aims at the first noon at least 500 ms after its previous press
(`REACTION_LEAD_MS`).

## Develop

```bash
yarn workspace switchclock test       # Vitest with coverage gates (90% lines, 85% branches), then the Node smoke test
yarn workspace switchclock typecheck  # strict tsc: engine without DOM or Node types, then the tests
```

## Licence

Apache-2.0. Copyright 2026 Sowmiya Arumugam.
