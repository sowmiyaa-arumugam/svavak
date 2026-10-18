// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Public API of the switchclock engine.

export { DEFAULT_CONFIG, Engine, type ClickResult, type EngineConfig } from './core/engine.ts'; // the engine
export { logLikelihood, offsetMs, type ClickModel } from './core/model.ts'; // the click model
export { phasesByRank, vanDerCorput } from './core/phases.ts'; // the phase layout
export { priors, type Option, type PriorConfig } from './core/priors.ts'; // the priors
export { cycleMs, DEFAULT_SCAN_CONFIG, normalCdf, onsetMs, ScanEngine, windowMs, type Scan, type ScanClickResult, type ScanConfig } from './core/scan.ts'; // scan mode
