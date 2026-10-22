// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The SvaVāk server, as the TV sees it: where it is, and POST /v1/utterances and POST /v1/alerts, each with
// a timeout and one retry.

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

const TIMEOUT_MS = 4000; // REST calls time out after 4 s

/**
 * Posts a reply and returns the absolute URL of its speech, or null when the server made none. The
 * idempotency key makes the one retry, after a network error, a timeout or a 5xx, safe. Throws when both attempts fail.
 */
export async function postUtterance(server: ServerConfig, reply: Reply, key: string = newKey(), fetchFn: typeof fetch = fetch): Promise<string | null> { // POST /v1/utterances
  const body = JSON.stringify({ question_id: reply.questionId, question_text: reply.questionText, text: reply.text, clicks: reply.clicks, duration_ms: reply.durationMs }); // the wire format
  const res = await post(server, '/v1/utterances', { 'Content-Type': 'application/json' }, body, key, fetchFn); // the commit
  const { audio_url } = (await res.json()) as { audio_url: string | null }; // where the speech is
  return audio_url === null ? null : `${server.url}${audio_url}`; // absolute, for the audio player
} // end of postUtterance

/** Sends one help request to POST /v1/alerts, which the server keeps and traces. Resolves once the server confirms it; throws as postUtterance does. */
export async function postHelp(server: ServerConfig, key: string = newKey(), fetchFn: typeof fetch = fetch): Promise<void> { // POST /v1/alerts
  await post(server, '/v1/alerts', {}, undefined, key, fetchFn); // no body: a help request has no text
} // end of postHelp

/** POSTs with the device token and an idempotency key, retrying once after a network error, a timeout or a 5xx. */
async function post(server: ServerConfig, path: string, extra: Record<string, string>, body: string | undefined, key: string, fetchFn: typeof fetch): Promise<Response> { // the shared request
  const headers = { Authorization: `Bearer ${server.token}`, ...extra, 'Idempotency-Key': key }; // same key on the retry
  const send = async () => { // one attempt, aborted after 4 s
    const controller = new AbortController(); // React Native's fetch honours it
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); // the timeout
    try { return await fetchFn(`${server.url}${path}`, { method: 'POST', headers, body, signal: controller.signal }); } // the request
    finally { clearTimeout(timer); } // settled: no timer left behind
  }; // end of send
  let res = await send().catch(() => null); // network error or timeout: null
  if (res === null || res.status >= 500) res = await send(); // one retry
  if (!res.ok) throw new Error(`POST ${path} answered ${res.status}`); // refused
  return res; // the server's answer
} // end of post

function newKey(): string { // unique enough for idempotency; not a secret
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; // time plus randomness
} // end of newKey
