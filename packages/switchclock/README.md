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

## Scan mode

`ScanEngine` keeps the log-space posterior and the priors, without clocks. One highlight steps through the options
in their fixed order, `stepMs` each (1 s by default). The first option of every cycle gets `firstExtraMs` more (1 s),
and the scan repeats.

- **Click model: press while your card is lit.** The user decides at a uniformly random moment while the target is
  lit and presses after a reaction delay d ~ N(μ, σ²), with μ = 150 ms and σ = 120 ms by default. A press at time t
  therefore has likelihood
  L_k = (1 − ε)·[Φ((t − μ − start_k)/σ) − Φ((t − μ − end_k)/σ)] / (end_k − start_k) + ε/C,
  where [start_k, end_k) is option k's highlight window and C the cycle length. Only windows that really occur
  count: the full scan's copies from its start, and a rescan's single cycle.
- **Commit and rescan.** The engine commits once P(i*) ≥ θ (0.97 by default). Otherwise it rescans only the top two,
  in scan order, for one cycle from when the press is handled. An option outside the pair has no window, so a press
  gives it only ε/C. If nobody presses during that cycle, the full scan resumes from the top and the posterior is
  kept. A press soon after the rescan ends still counts against the rescan's windows, since it can be a reaction to
  the last of them. There is no re-phasing: the scan order never changes.
- **Simulator** (`switchclock/sim/scan`). A seeded synthetic user follows the same model: a uniform moment in its
  target's next window plus a delay d ~ N(μ, σ²), or with probability ε a press at a uniform time within the running
  cycle.

## Use

```ts
import { DEFAULT_CONFIG, Engine } from 'switchclock';

const engine = new Engine(DEFAULT_CONFIG, () => performance.now()); // injected clock, in ms
engine.setOptions([{ id: 'yes', score: 0.6 }, { id: 'no', score: 0.3 }, { id: 'undo', score: 0, control: true }]);
// Draw option i's hand at (now - engine.t0) / periodMs + engine.phases()[i] turns.
const r = engine.click(pressTimestampMs); // { accepted, posterior, committed, confirm }
```

Scan mode:

```ts
import { DEFAULT_SCAN_CONFIG, ScanEngine } from 'switchclock';

const scan = new ScanEngine(DEFAULT_SCAN_CONFIG, () => performance.now()); // injected clock, in ms
scan.setOptions([{ id: 'yes', score: 0.6 }, { id: 'no', score: 0.3 }, { id: 'help', score: 0, control: true }]);
// Highlight option scan.highlighted(now); dim the options missing from scan.scanAt(now).items.
const r = scan.click(pressTimestampMs); // { accepted, posterior, committed }
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

## Gate K1-scan result

Setup:
- The engine and the synthetic user both use the window model with μ = 150 ms, σ = 120 ms and ε = 0.05, with
  θ = 0.97 and s = 1 s (2 s for the first option of each cycle).
- There are 10 options: 8 replies, then Something else and Help.
- 10,000 trials per case with seed 20261014 ([test/k1scan.test.ts](test/k1scan.test.ts)).

| Reply priors | Targets | Error rate | Mean presses | Mean seconds per selection |
|---|---|---|---|---|
| Uniform; controls 3% each | uniform over the 8 replies | **0.48%** | 2.260 | 7.77 |
| AI-like 0.35, 0.20, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04; controls 1% each | drawn from the priors | **1.19%** | 1.843 | 5.52 |

Both cases are gated at an error rate of at most 2%, and the test asserts that a second run with the same seed gives
identical results. Seconds are counted from the start of the scan to the committing press. The figures are measured
by the simulator, not taken from trials with users.

At θ = 0.95 this engine errs on 2.07% (uniform) and 1.82% (AI-like) of trials: a single spurious press inside a
wrong window is enough to commit it. θ = 0.97 makes such a press start a rescan instead.

Simulator assumption: the synthetic user aims at the first window of its target that starts at or after its previous
press.

## Develop

```bash
yarn workspace switchclock test       # Vitest with coverage gates (90% lines, 85% branches), then the Node smoke test
yarn workspace switchclock typecheck  # strict tsc: engine without DOM or Node types, then the tests
```

The K1 and K1-scan tests print their measured values. When Vitest detects an AI coding agent it hides the console
output of passing tests; `npx vitest run --silent=false` (in this folder) shows it.

## Licence

Apache-2.0. Copyright 2026 Sowmiya Arumugam.
