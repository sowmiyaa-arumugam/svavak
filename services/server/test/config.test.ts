// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Configuration from the environment.

import { expect, it } from 'vitest'; // test API
import { loadConfig } from '../src/config.ts'; // tested

const TOKEN = 'a'.repeat(32); // a synthetic token

it('defaults to mock mode, Frankfurt, Nova 2 Lite on the EU profile and a neural voice', () => { // defaults
  expect(loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN })).toEqual({ mode: 'mock', deviceToken: TOKEN, awsProfile: undefined, awsRegion: 'eu-central-1', modelId: 'eu.amazon.nova-2-lite-v1:0', voice: 'Brian' }); // mock
}); // end of the case

it('reads live settings', () => { // live
  const env = { SAY_WHEN_MODE: 'live', SAY_WHEN_DEVICE_TOKEN: TOKEN, AWS_PROFILE: 'say-when-dev', AWS_REGION: 'eu-west-1', SAY_WHEN_MODEL_ID: 'm', SAY_WHEN_VOICE: 'Amy' }; // all set
  expect(loadConfig(env)).toEqual({ mode: 'live', deviceToken: TOKEN, awsProfile: 'say-when-dev', awsRegion: 'eu-west-1', modelId: 'm', voice: 'Amy' }); // as given
}); // end of the case

it('refuses a missing or short token, an unknown mode, and live mode without an SSO profile', () => { // fail closed
  expect(() => loadConfig({})).toThrow('SAY_WHEN_DEVICE_TOKEN'); // no token
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: '<device-token>' })).toThrow('SAY_WHEN_DEVICE_TOKEN'); // the placeholder
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_MODE: 'prod' })).toThrow('SAY_WHEN_MODE'); // typo
  expect(() => loadConfig({ SAY_WHEN_DEVICE_TOKEN: TOKEN, SAY_WHEN_MODE: 'live' })).toThrow('AWS_PROFILE'); // no profile
}); // end of the case
