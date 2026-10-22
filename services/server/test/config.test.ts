// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Configuration from the environment.

import { readFileSync } from 'node:fs'; // reads .env.example
import { parseEnv } from 'node:util'; // parses it as --env-file does
import { expect, it } from 'vitest'; // test API
import { loadConfig } from '../src/config.ts'; // tested

const TOKEN = 'a'.repeat(32); // a synthetic token
const AGENT = 'b'.repeat(32); // a synthetic agent token
const MCP_DEFAULTS = { mcpAllowedHosts: ['localhost', '127.0.0.1'], mcpAllowedOrigins: ['http://localhost:5173'] }; // the /mcp allow-lists by default
const EXAMPLE = parseEnv(readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8')); // .env.example, as a judge copies it to .env

it('starts in mock mode on .env.example as it is, with its public demo tokens', () => { // copying it is all mock mode needs
  expect(loadConfig(EXAMPLE)).toMatchObject({ mode: 'mock', deviceToken: EXAMPLE.SVAVAK_DEVICE_TOKEN, agentToken: EXAMPLE.SVAVAK_AGENT_TOKEN }); // no edits
}); // end of the case

it("refuses live mode with either of .env.example's public demo tokens", () => { // public, mock mode only
  const live = { ...EXAMPLE, SVAVAK_MODE: 'live', AWS_PROFILE: 'svavak-dev' }; // live, with both public tokens
  expect(() => loadConfig(live)).toThrow('SVAVAK_MODE=live refuses the public demo tokens from .env.example'); // both
  expect(() => loadConfig({ ...live, SVAVAK_AGENT_TOKEN: AGENT })).toThrow('public demo tokens'); // the public device token
  expect(() => loadConfig({ ...live, SVAVAK_DEVICE_TOKEN: TOKEN })).toThrow('public demo tokens'); // the public agent token
  expect(() => loadConfig({ ...live, SVAVAK_DEVICE_TOKEN: EXAMPLE.SVAVAK_AGENT_TOKEN, SVAVAK_AGENT_TOKEN: AGENT })).toThrow('public demo tokens'); // either one, in either setting
  expect(loadConfig({ ...live, SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: AGENT }).mode).toBe('live'); // own tokens: live starts
}); // end of the case

it('defaults to mock mode, Frankfurt, Nova 2 Lite on the EU profile, a neural voice and local-only /mcp allow-lists', () => { // defaults
  expect(loadConfig({ SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: AGENT })).toEqual({ mode: 'mock', deviceToken: TOKEN, agentToken: AGENT, awsProfile: undefined, awsRegion: 'eu-central-1', modelId: 'eu.amazon.nova-2-lite-v1:0', voice: 'Brian', pollyRegion: 'eu-central-1', pollyEngine: 'neural', ...MCP_DEFAULTS }); // mock
}); // end of the case

it('reads live settings; Polly follows AWS_REGION with the neural engine unless told otherwise', () => { // live
  const env = { SVAVAK_MODE: 'live', SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: AGENT, AWS_PROFILE: 'svavak-dev', AWS_REGION: 'eu-west-1', SVAVAK_MODEL_ID: 'm', SVAVAK_VOICE: 'Amy' }; // all set but Polly's own two
  expect(loadConfig(env)).toEqual({ mode: 'live', deviceToken: TOKEN, agentToken: AGENT, awsProfile: 'svavak-dev', awsRegion: 'eu-west-1', modelId: 'm', voice: 'Amy', pollyRegion: 'eu-west-1', pollyEngine: 'neural', ...MCP_DEFAULTS }); // as given
}); // end of the case

it("reads Polly's own region and engine", () => { // the project's Polly region has only the standard engine
  const env = { SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: AGENT, SVAVAK_POLLY_REGION: 'eu-north-1', SVAVAK_POLLY_ENGINE: 'standard' }; // both set
  expect(loadConfig(env)).toMatchObject({ awsRegion: 'eu-central-1', pollyRegion: 'eu-north-1', pollyEngine: 'standard' }); // Bedrock stays in Frankfurt
  expect(() => loadConfig({ ...env, SVAVAK_POLLY_ENGINE: 'generative' })).toThrow('SVAVAK_POLLY_ENGINE'); // only neural or standard
}); // end of the case

it('reads the /mcp allow-lists as comma-separated values, ignoring spaces and empty entries', () => { // allow-lists
  const env = { SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: AGENT, SVAVAK_MCP_ALLOWED_HOSTS: ' localhost , svavak.test ,', SVAVAK_MCP_ALLOWED_ORIGINS: 'http://localhost:5173, http://localhost:6274' }; // two of each
  expect(loadConfig(env)).toMatchObject({ mcpAllowedHosts: ['localhost', 'svavak.test'], mcpAllowedOrigins: ['http://localhost:5173', 'http://localhost:6274'] }); // trimmed
}); // end of the case

it('refuses a missing or short token, an unknown mode, and live mode without an SSO profile', () => { // fail closed
  expect(() => loadConfig({ SVAVAK_AGENT_TOKEN: AGENT })).toThrow('SVAVAK_DEVICE_TOKEN'); // no token
  expect(() => loadConfig({ SVAVAK_DEVICE_TOKEN: '<device-token>', SVAVAK_AGENT_TOKEN: AGENT })).toThrow('SVAVAK_DEVICE_TOKEN'); // the placeholder
  expect(() => loadConfig({ SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: AGENT, SVAVAK_MODE: 'prod' })).toThrow('SVAVAK_MODE'); // typo
  expect(() => loadConfig({ SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: AGENT, SVAVAK_MODE: 'live' })).toThrow('AWS_PROFILE'); // no profile
}); // end of the case

it('refuses a missing or short agent token, and one equal to the device token', () => { // the agent token fails closed too
  expect(() => loadConfig({ SVAVAK_DEVICE_TOKEN: TOKEN })).toThrow('SVAVAK_AGENT_TOKEN'); // no agent token
  expect(() => loadConfig({ SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: '<agent-token>' })).toThrow('SVAVAK_AGENT_TOKEN'); // the placeholder
  expect(() => loadConfig({ SVAVAK_DEVICE_TOKEN: TOKEN, SVAVAK_AGENT_TOKEN: TOKEN })).toThrow('SVAVAK_AGENT_TOKEN'); // the same token would let an agent post answers
}); // end of the case
