// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MCP smoke test for a running server and a TV: ask_question with options, get_answer while someone answers on the
// TV, then get_recent_messages. Uses the official MCP SDK client over Streamable HTTP, as an agent would.
// Usage, from the repository root, with the server running: node tools/mcp-smoke.mjs ["expected answer"]
// Press the switch on the TV (Enter on the emulator) when the expected answer (Tea by default) lights up.
// Reads SVAVAK_AGENT_TOKEN from the git-ignored .env and never prints it.

import { existsSync } from 'node:fs'; // does .env exist?
import { createRequire } from 'node:module'; // resolves the SDK from the server workspace
import { pathToFileURL } from 'node:url'; // a Windows path as an import specifier

const MCP_URL = 'http://127.0.0.1:8787/mcp'; // the server's MCP endpoint
const QUESTION = 'Would you like tea or coffee?'; // the demo question
const OPTIONS = ['Tea', 'Coffee']; // its options; the server adds Not now and Not sure
const WAIT_SECONDS = 25; // get_answer's longest wait
const ROUNDS = 8; // up to 200 s for the presses
const expected = process.argv[2] ?? 'Tea'; // the answer to choose on the TV

if (existsSync('.env')) process.loadEnvFile('.env'); // the local settings, as the server reads them
const token = process.env.SVAVAK_AGENT_TOKEN; // the agent token, never the TV's
if (!token) fail('SVAVAK_AGENT_TOKEN is not set (copy .env.example to .env and set it)'); // nothing to authenticate with

const sdk = createRequire(new URL('../services/server/package.json', import.meta.url)); // the SDK lives in the server workspace only (nmHoistingLimits: workspaces)
const load = (path) => import(pathToFileURL(sdk.resolve(`@modelcontextprotocol/sdk/${path}`)).href); // one SDK module
const { Client } = await load('client/index.js'); // the client
const { StreamableHTTPClientTransport } = await load('client/streamableHttp.js'); // its Streamable HTTP transport

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }); // the agent token in a header
const client = new Client({ name: 'mcp-smoke', version: '1.0.0' }); // who we are
await client.connect(transport).catch((error) => fail(`could not connect (is the server running, and is the token right?): ${error.message}`)); // initialize
console.log(`connected: protocol ${transport.protocolVersion}`); // the negotiated version

const { question_id, delivered } = await call('ask_question', { question: QUESTION, options: OPTIONS, asked_by: 'Alex' }); // ask
console.log(`ask_question: question_id ${question_id}, delivered ${delivered}`); // delivered: a TV was connected
console.log(`press the switch when "${expected}" lights up`); // the person's turn
let answer; // get_answer's latest result
for (let round = 1; round <= ROUNDS; round++) { // long-poll until answered, or give up
  answer = await call('get_answer', { question_id, wait_seconds: WAIT_SECONDS }); // returns as soon as it is answered
  console.log(`get_answer: ${JSON.stringify(answer)}`); // status, answer_text, answered_at, clicks
  if (answer.status !== 'pending') break; // answered or expired
} // end of the wait
const { messages } = await call('get_recent_messages', { limit: 5 }); // what was said lately
console.log(`get_recent_messages: ${JSON.stringify(messages)}`); // with their questions
await transport.terminateSession(); // DELETE /mcp ends the session
await client.close(); // and the connection
if (answer.status !== 'answered') fail(`not answered (status ${answer.status})`); // nobody pressed in time
if (answer.answer_text !== expected) fail(`answered "${answer.answer_text}", expected "${expected}"`); // another reply
if (!messages.some((m) => m.text === expected && m.question_text === QUESTION)) fail('get_recent_messages does not list the answer with its question'); // the history
console.log('mcp smoke ok: asked, answered on the TV, and listed'); // success

/** Calls a tool and returns its JSON output; a tool error ends the run. */
async function call(name, args) { // tools/call
  const result = await client.callTool({ name, arguments: args }); // the call
  const text = result.content[0].text; // the JSON output, or the error message
  if (result.isError) fail(`${name}: ${text}`); // refused
  return JSON.parse(text); // the output
} // end of call

function fail(reason) { // report and exit non-zero
  console.error(`mcp smoke failed: ${reason}`); // why
  process.exit(1); // a failing exit code
} // end of fail
