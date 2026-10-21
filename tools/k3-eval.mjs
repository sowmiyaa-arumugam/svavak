// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Gate K3 and the evaluation set's live run (plan §4.6, §10): asks the 30 evaluation questions on a running server,
// one at a time, and takes from the server's trace the time from each ask to its question.candidates. Writes
// test-results/k3/eval.md (each question's top four replies, the automatic checks, the time) and eval.json.
// Usage, from the repository root, with the server running (SVAVAK_MODE=live for the gate): node tools/k3-eval.mjs
// Reads SVAVAK_DEVICE_TOKEN from the git-ignored .env and never prints it. Exits 1 when the gate fails.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'; // .env and the results
import { EVAL_SET, evalChecks } from '../services/server/test/evalSet.ts'; // the questions and the checks (Node strips the types)

const BASE = 'http://127.0.0.1:8787'; // the server's fixed loopback address
const WAIT_MS = 6000; // per question: the 3.5 s budget plus room
const GATE_MS = 2000; // K3: candidates p50 at most 2.0 s
const OUT = 'test-results/k3'; // git-ignored

if (existsSync('.env')) process.loadEnvFile('.env'); // the local settings, as the server reads them
const token = process.env.SVAVAK_DEVICE_TOKEN; // the device token
if (!token) fail('SVAVAK_DEVICE_TOKEN is not set (copy .env.example to .env and set it)'); // nothing to authenticate with
const headers = { Authorization: `Bearer ${token}` }; // on every call

const events = []; // the stream's events
const socket = new WebSocket(`${BASE.replace('http', 'ws')}/v1/stream`, { headers }); // as a TV
socket.onmessage = (message) => events.push(JSON.parse(message.data)); // collect
await new Promise((resolve) => { socket.onopen = resolve; socket.onerror = () => fail('could not open the stream (is the server running, and is the token right?)'); }); // connected

const spans = []; // the trace's spans, in order
const trace = await fetch(`${BASE}/v1/trace`, { headers }); // SSE
if (!trace.ok) fail(`GET /v1/trace answered ${trace.status}`); // refused
readSpans(trace.body); // in the background

const rows = []; // one per question
for (const [i, q] of EVAL_SET.entries()) { // one at a time, as a caregiver would ask
  const from = spans.length; // the previous question's spans are all in by now: its server→llm span is its last
  const asked = Date.now(); // spans that ended before this, the trace's replay of its buffer included, are not this question's
  const res = await fetch(`${BASE}/v1/questions`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: q.text, asked_by: 'Alex' }) }); // ask
  if (res.status !== 201) fail(`POST /v1/questions answered ${res.status}`); // not created
  const { id } = await res.json(); // its id
  const mine = () => spans.slice(from).filter((s) => Date.parse(s.at) >= asked); // this question's spans: after the previous question's in the stream, and (same machine, same clock) not from before the ask
  const llm = await until(() => mine().find((s) => s.hop === 'server→llm'), WAIT_MS); // the model call's span ends SuggestReplies
  const pushed = mine().find((s) => s.hop === 'server→tv' && s.operation === 'question.candidates'); // the push, timed since the ask
  const update = events.find((e) => e.type === 'question.candidates' && e.question_id === id); // what the TV got
  const candidates = update?.candidates ?? []; // none when the defaults stayed
  const top4 = candidates.slice(0, 4); // the first four cards
  rows.push({ n: i + 1, question: q.text, ms: pushed?.duration_ms ?? null, outcome: llm?.operation ?? 'no span', mode: llm?.mode ?? '?', dropped: llm?.dropped ?? 0, fromModel: candidates.filter((c) => c.source === 'llm').length, top4: top4.map((c) => `${c.text} (${c.intent})`), checks: update ? evalChecks(q.text, candidates) : ['no question.candidates: the defaults stayed'], fact: q.fact ? top4.some((c) => q.fact.test(c.text)) : null }); // the row
  console.log(`${i + 1}/${EVAL_SET.length} ${pushed ? `${pushed.duration_ms} ms` : 'no candidates'} ${llm?.operation ?? ''}`); // progress, without text
} // end of the questions
socket.close(); // leave

const times = rows.map((r) => r.ms ?? Infinity).sort((a, b) => a - b); // a question without candidates counts as slowest
const rank = (p) => times[Math.ceil((p / 100) * times.length) - 1]; // nearest-rank percentile
const p50 = rank(50); // median
const p95 = rank(95); // 95th percentile
const pass = p50 <= GATE_MS; // the gate
const modes = [...new Set(rows.map((r) => r.mode))].join(', '); // live, mock, or both (past the daily cap)
const checked = rows.filter((r) => r.checks.length === 0).length; // questions whose checks all pass
const facts = rows.filter((r) => r.fact !== null); // the fact questions
const at = new Date().toISOString(); // when
mkdirSync(OUT, { recursive: true }); // the folder
writeFileSync(`${OUT}/eval.json`, JSON.stringify({ at, p50, p95, rows }, null, 2)); // everything, for later
writeFileSync(`${OUT}/eval.md`, [ // for the reader
  '# K3 evaluation run', '', // title
  `- When: ${at}`, // time
  `- Model mode (server→llm spans): ${modes}`, // live or mock
  `- Ask to question.candidates on the server (trace): p50 ${ms(p50)}, p95 ${ms(p95)}, nearest rank over ${rows.length}; a question without candidates counts as slowest`, // the gate's numbers
  `- Gate K3 (p50 at most ${GATE_MS} ms): ${pass ? 'PASS' : 'FAIL'}`, // the verdict
  `- Automatic checks (schema, length, intent coverage, banned terms): ${checked} of ${rows.length} pass`, // plan §4.6
  `- Seeded fact in the top four: ${facts.filter((r) => r.fact).length} of ${facts.length}`, // FR-03
  '- Target: an acceptable reply in the top four for 25 of 30. Fill in the last column.', '', // the human judgement
  '| # | Question | Top four replies (intent) | ms | From model | Checks | Fact | Acceptable? |', // header
  '| --- | --- | --- | --- | --- | --- | --- | --- |', // separator
  ...rows.map((r) => `| ${r.n} | ${cell(r.question)} | ${r.top4.map(cell).join('<br>') || '(defaults)'} | ${r.ms ?? '-'} | ${r.fromModel} | ${r.checks.length ? cell(r.checks.join('; ')) : 'ok'} | ${r.fact === null ? '' : r.fact ? 'yes' : 'no'} | |`), // one row each
  '', // final newline
].join('\n')); // the table
console.log(`p50 ${ms(p50)}, p95 ${ms(p95)}: K3 ${pass ? 'PASS' : 'FAIL'}; checks ${checked}/${rows.length}; wrote ${OUT}/eval.md`); // the summary
process.exit(pass ? 0 : 1); // the trace stream stays open otherwise

/** Parses the SSE body into `spans`. */
async function readSpans(body) { // runs until the process exits
  const decoder = new TextDecoder(); // bytes to text
  let buffer = ''; // an unfinished frame
  for await (const chunk of body) { // as it arrives
    buffer += decoder.decode(chunk, { stream: true }); // append
    const frames = buffer.split('\n\n'); // complete frames, then the rest
    buffer = frames.pop(); // keep the unfinished one
    for (const frame of frames) if (frame.startsWith('data: ')) spans.push(JSON.parse(frame.slice(6))); // one span each
  } // end of the stream
} // end of readSpans

/** Polls `check` until it returns a value, or gives undefined after `waitMs`. */
async function until(check, waitMs) { // wait for an async effect
  const end = Date.now() + waitMs; // deadline
  for (;;) { // poll
    const value = check(); // try
    if (value !== undefined || Date.now() > end) return value; // done, or too late
    await new Promise((resolve) => setTimeout(resolve, 10)); // try again soon
  } // end of polling
} // end of until

function ms(value) { // a time for the summary
  return Number.isFinite(value) ? `${value} ms` : 'none (no candidates)'; // or why not
} // end of ms

function cell(text) { // a Markdown table cell
  return text.replace(/\|/g, '\\|'); // a pipe would end the cell
} // end of cell

function fail(reason) { // report and exit non-zero
  console.error(`k3-eval failed: ${reason}`); // why
  process.exit(1); // a failing exit code
} // end of fail
