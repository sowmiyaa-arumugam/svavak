// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config'; // Vitest's typed config helper

export default defineConfig({ // the package's test configuration
  test: { // test runner settings
    include: ['test/**/*.test.ts'], // unit, property and regression tests
    coverage: { // V8 coverage, gated per plan §7.3
      provider: 'v8', // native V8 coverage, no instrumentation step
      include: ['src/**/*.ts', 'sim/**/*.ts'], // measure the engine and simulator
      thresholds: { lines: 90, branches: 85 }, // fail the run below 90% lines or 85% branches
    }, // end of coverage settings
  }, // end of test settings
}); // end of the config
