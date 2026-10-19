// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Configuration from the environment.

import { expect, it } from 'vitest'; // test API
import { loadConfig } from '../src/config.ts'; // tested

const TOKEN = 'a'.repeat(32); // a synthetic token
const AGENT = 'b'.repeat(32); // a synthetic agent token
const MCP_DEFAULTS = { mcpAllowedHosts: ['localhost', '127.0.0.1'], mcpAllowedOrigins: ['http://localhost:5173'] }; // the /mcp allow-lists by default

it('defaults to mock mode, Frankfurt, Nova 2 Lite on the EU profile, a neural voice and local-only /mcp allow-lists', () => { // defaults
  expect(loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_AGENT_TOKEN: AGENT })).toEqual({ mode: 'mock', deviceToken: TOKEN, agentToken: AGENT, awsProfile: undefined, awsRegion: 'eu-central-1', modelId: 'eu.amazon.nova-2-lite-v1:0', voice: 'Brian', ...MCP_DEFAULTS }); // mock
}); // end of the case

it('reads live settings', () => { // live
  const env = { SAY_WHEN_MODE: 'live', SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_AGENT_TOKEN: AGENT, AWS_PROFILE: 'say-when-dev', AWS_REGION: 'eu-west-1', SAY_WHEN_MODEL_ID: 'm', SAY_WHEN_VOICE: 'Amy' }; // all set
  expect(loadConfig(env)).toEqual({ mode: 'live', deviceToken: TOKEN, agentToken: AGENT, awsProfile: 'say-when-dev', awsRegion: 'eu-west-1', modelId: 'm', voice: 'Amy', ...MCP_DEFAULTS }); // as given
}); // end of the case

it('reads the /mcp allow-lists as comma-separated values, ignoring spaces and empty entries', () => { // allow-lists
  const env = { SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_AGENT_TOKEN: AGENT, SAY_WHEN_MCP_ALLOWED_HOSTS: ' localhost , saywhen.test ,', SAY_WHEN_MCP_ALLOWED_ORIGINS: 'http://localhost:5173, http://localhost:6274' }; // two of each
  expect(loadConfig(env)).toMatchObject({ mcpAllowedHosts: ['localhost', 'saywhen.test'], mcpAllowedOrigins: ['http://localhost:5173', 'http://localhost:6274'] }); // trimmed
}); // end of the case

it('refuses a missing or short token, an unknown mode, and live mode without an SSO profile', () => { // fail closed
  expect(() => loadConfig({ SAY_WHEN_AGENT_TOKEN: AGENT })).toThrow('SAY_WHEN_DEVICE_TOKEN'); // no token
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: '<device-token>', SAY_WHEN_AGENT_TOKEN: AGENT })).toThrow('SAY_WHEN_DEVICE_TOKEN'); // the placeholder
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_AGENT_TOKEN: AGENT, SAY_WHEN_MODE: 'prod' })).toThrow('SAY_WHEN_MODE'); // typo
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_AGENT_TOKEN: AGENT, SAY_WHEN_MODE: 'live' })).toThrow('AWS_PROFILE'); // no profile
}); // end of the case

it('refuses a missing or short agent token, and one equal to the device token', () => { // the agent token fails closed too
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN })).toThrow('SAY_WHEN_AGENT_TOKEN'); // no agent token
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_AGENT_TOKEN: '<agent-token>' })).toThrow('SAY_WHEN_AGENT_TOKEN'); // the placeholder
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_AGENT_TOKEN: TOKEN })).toThrow('SAY_WHEN_AGENT_TOKEN'); // the same token would let an agent post answers
}); // end of the case
