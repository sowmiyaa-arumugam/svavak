// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Server configuration from the environment (the git-ignored .env; names and placeholders in .env.example).

export const HOST = '127.0.0.1'; // loopback only; the Android emulator reaches it as 10.0.2.2
export const PORT = 8787; // the server's port

/** Validated settings. AWS credentials are never part of it: the SDK's default chain resolves the SSO profile. */
export interface Config { // what compose.ts needs
  mode: 'mock' | 'live'; // SAY_WHEN_MODE: mock needs no AWS at all
  deviceToken: string; // SAY_WHEN_DEVICE_TOKEN: the static bearer token for every call except /healthz
  awsProfile: string | undefined; // AWS_PROFILE: the IAM Identity Center (SSO) profile, used in live mode only
  awsRegion: string; // AWS_REGION: Bedrock and Polly region (plan §8.1)
  modelId: string; // SAY_WHEN_MODEL_ID: the Bedrock model or inference profile id
  voice: string; // SAY_WHEN_VOICE: the Polly neural voice
} // end of Config

/** Reads and checks the settings; throws with a readable message when one is missing or wrong. */
export function loadConfig(env: Record<string, string | undefined>): Config { // from process.env
  const mode = env.SAY_WHEN_MODE || 'mock'; // mock by default
  if (mode !== 'mock' && mode !== 'live') throw new Error(`SAY_WHEN_MODE must be "mock" or "live", not "${mode}"`); // typo guard
  const deviceToken = env.SAY_WHEN_DEVICE_TOKEN ?? ''; // fail closed: no token, no server
  if (deviceToken.length < 16) throw new Error('SAY_WHEN_DEVICE_TOKEN must be set to at least 16 characters (see .env.example)'); // also rejects the placeholder
  const awsProfile = env.AWS_PROFILE || undefined; // empty counts as unset
  if (mode === 'live' && !awsProfile) throw new Error('SAY_WHEN_MODE=live needs AWS_PROFILE, an IAM Identity Center (SSO) profile'); // never access keys
  return { // the settings
    mode, // mock or live
    deviceToken, // the bearer token
    awsProfile, // SSO profile name
    awsRegion: env.AWS_REGION || 'eu-central-1', // Frankfurt (plan §8.1)
    modelId: env.SAY_WHEN_MODEL_ID || 'eu.amazon.nova-2-lite-v1:0', // Nova 2 Lite, EU geo inference profile (plan §8.1)
    voice: env.SAY_WHEN_VOICE || 'Brian', // a British English neural voice listed for eu-central-1
  }; // end of the settings
} // end of loadConfig
