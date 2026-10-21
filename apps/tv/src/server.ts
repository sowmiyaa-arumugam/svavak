// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The SvaVāk server, as the TV sees it (plan §4.2): where it is, and POST /v1/utterances with a timeout and one retry.

import Constants from 'expo-constants'; // the app config embedded at build time
import type { Reply } from './conversation'; // what gets posted

/** Server address and device token. */
export interface ServerConfig { // from app.config.js
  url: string; // http://10.0.2.2:8787 on the emulator
  token: string; // SVAVAK_DEVICE_TOKEN from the repository's .env
} // end of ServerConfig

/** This build's server, or null when it was built without a token: then the app runs on its fixtures only. */
export const SERVER: ServerConfig | null = serverFrom(Constants.expoConfig?.extra?.server); // read once

/** Validates the `extra.server` entry of the app config. */
export function serverFrom(entry: { url?: unknown; token?: unknown } | undefined): ServerConfig | null { // untyped config to settings
  return typeof entry?.url === 'string' && typeof entry.token === 'string' && entry.token !== '' ? { url: entry.url, token: entry.token } : null; // both set
} // end of serverFrom

const TIMEOUT_MS = 4000; // plan §4.2: REST calls time out after 4 s

/**
 * Posts a reply and returns the absolute URL of its speech, or null when the server made none. The
 * idempotency key makes the one retry, after a network error, a timeout or a 5xx, safe. Throws when both attempts fail.
 */
export async function postUtterance(server: ServerConfig, reply: Reply, key: string = newKey(), fetchFn: typeof fetch = fetch): Promise<string | null> { // POST /v1/utterances
  const body = JSON.stringify({ question_id: reply.questionId, question_text: reply.questionText, text: reply.text, clicks: reply.clicks, duration_ms: reply.durationMs }); // the wire format
  const headers = { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }; // same key on the retry
  const send = async () => { // one attempt, aborted after 4 s
    const controller = new AbortController(); // React Native's fetch honours it
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); // the timeout
    try { return await fetchFn(`${server.url}/v1/utterances`, { method: 'POST', headers, body, signal: controller.signal }); } // the request
    finally { clearTimeout(timer); } // settled: no timer left behind
  }; // end of send
  let res = await send().catch(() => null); // network error or timeout: null
  if (res === null || res.status >= 500) res = await send(); // one retry
  if (!res.ok) throw new Error(`POST /v1/utterances answered ${res.status}`); // refused
  const { audio_url } = (await res.json()) as { audio_url: string | null }; // where the speech is
  return audio_url === null ? null : `${server.url}${audio_url}`; // absolute, for the audio player
} // end of postUtterance

function newKey(): string { // unique enough for idempotency; not a secret
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; // time plus randomness
} // end of newKey
