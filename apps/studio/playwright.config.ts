// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The studio's browser end-to-end test, in mock mode: Playwright starts the server, the agent and the
// studio one after another, each with fresh tokens made here (never the .env's), and no AWS profile.

import { randomBytes } from 'node:crypto'; // throwaway tokens
import { defineConfig, devices } from '@playwright/test'; // Playwright's config helpers

const token = () => randomBytes(24).toString('hex'); // 48 hex characters: a valid header value and WebSocket subprotocol
const env = { SVAVAK_MODE: 'mock', SVAVAK_DEVICE_TOKEN: token(), SVAVAK_AGENT_TOKEN: token(), AWS_PROFILE: '' }; // they override the .env in all three

export default defineConfig({ // the test run
  testDir: 'e2e', // the tests
  outputDir: '../../test-results/b5/playwright', // traces and failure screenshots, git-ignored
  timeout: 90_000, // one whole caregiver turn, pressed on the virtual TV
  workers: 1, // one server, one agent, one studio
  reporter: 'list', // one line per test
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173', viewport: { width: 1920, height: 1080 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' }, // the studio at 1080p, from its own origin; artefacts only when a run fails
  webServer: [ // started in this order, each once the one before is ready
    { command: 'node src/main.ts', cwd: '../../services/server', url: 'http://127.0.0.1:8787/healthz', env, reuseExistingServer: false }, // the server: a running one would have other tokens
    { command: 'uv run python -m svavak_agent', cwd: '../../services/agent', port: 8790, env, reuseExistingServer: false }, // the agent: it needs the server at start-up
    { command: 'corepack yarn vite', url: 'http://localhost:5173', env, reuseExistingServer: false }, // the studio, with this run's device token
  ], // end of the servers
}); // end of the config
