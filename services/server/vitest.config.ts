// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config'; // Vitest's typed config helper

export default defineConfig({ // the server's test configuration
  test: { // test runner settings
    include: ['test/**/*.test.ts'], // unit, adapter and contract tests
    coverage: { // V8 coverage, gated per plan §7.3 (server unit: 80% lines)
      provider: 'v8', // native V8 coverage, no instrumentation step
      include: ['src/**/*.ts'], // the whole server
      exclude: ['src/main.ts'], // the entry point only reads the environment and listens
      thresholds: { lines: 80 }, // fail the run below 80% lines
    }, // end of coverage settings
  }, // end of test settings
}); // end of the config
