// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Smoke test for a running server: posts a question and checks that it reaches a WebSocket client.
// Usage, from the repository root, with the server running: node tools/smoke-stream.mjs ["question text"]
// Needs only Node 24: fetch and WebSocket are built in. Reads SVAVAK_DEVICE_TOKEN from the git-ignored .env.

import { existsSync } from 'node:fs'; // does .env exist?

const BASE = 'http://127.0.0.1:8787'; // the server's fixed loopback address
const TIMEOUT_MS = 5000; // the whole check must finish within this
const text = process.argv[2] ?? 'Would you like tea or coffee?'; // the question; the demo question by default

if (existsSync('.env')) process.loadEnvFile('.env'); // the local settings, as the server reads them
const token = process.env.SVAVAK_DEVICE_TOKEN; // the device token
if (!token) fail('SVAVAK_DEVICE_TOKEN is not set (copy .env.example to .env and set it)'); // nothing to authenticate with
const headers = { Authorization: `Bearer ${token}` }; // on every call

const timer = setTimeout(() => fail(`no question.created within ${TIMEOUT_MS} ms`), TIMEOUT_MS); // overall deadline
const events = []; // everything the stream delivered
const socket = new WebSocket(`${BASE.replace('http', 'ws')}/v1/stream`, { headers }); // Node's WebSocket accepts headers here
socket.onerror = () => fail('could not open the stream (is the server running, and is the token right?)'); // refused or down
socket.onmessage = (message) => events.push(JSON.parse(message.data)); // collect events
socket.onopen = async () => { // connected: now ask
  const res = await fetch(`${BASE}/v1/questions`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, asked_by: 'Alex' }) }); // ask
  if (res.status !== 201) fail(`POST /v1/questions answered ${res.status}: ${await res.text()}`); // not created
  const question = await res.json(); // the created question
  console.log(`posted question ${question.id}: "${question.text}"`); // what was asked
  for (;;) { // wait for its events on the stream
    const created = events.find((e) => e.type === 'question.created' && e.question.id === question.id); // pushed at once
    const candidates = events.find((e) => e.type === 'question.candidates' && e.question_id === question.id); // pushed when ready
    if (created && candidates) { // both arrived
      console.log(`question.created: defaults ${created.question.candidates.map((c) => c.text).join(' | ')}`); // the defaults
      console.log(`question.candidates: ${candidates.candidates.map((c) => c.text).join(' | ')}`); // the model's (mock) candidates
      console.log('smoke ok: the question reached the WebSocket client'); // success
      clearTimeout(timer); // no deadline any more
      socket.close(); // leave
      return; // done
    } // end of the success check
    await new Promise((resolve) => setTimeout(resolve, 20)); // check again soon
  } // end of the wait
}; // end of onopen

function fail(reason) { // report and exit non-zero
  console.error(`smoke failed: ${reason}`); // why
  process.exit(1); // a failing exit code
} // end of fail
