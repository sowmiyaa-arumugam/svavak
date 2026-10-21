// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MCP conformance (plan §7.3, gate K4): the official SDK client over Streamable HTTP against a real listening server,
// plus raw HTTP for what a well-behaved client never sends (foreign Origin or Host, wrong tokens, bad protocol header).

import { randomUUID } from 'node:crypto'; // ids
import { request as httpRequest, type Server } from 'node:http'; // raw requests with any Host or Origin header
import type { AddressInfo } from 'node:net'; // listening address
import { Client } from '@modelcontextprotocol/sdk/client/index.js'; // the official client
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; // its Streamable HTTP transport
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'; // 2025-11-25
import { afterEach, describe, expect, it } from 'vitest'; // test API
import WebSocket, { WebSocketServer } from 'ws'; // a TV on the stream
import { MemoryStore } from '../src/adapters/memoryStore.ts'; // store, without demo facts
import { MockLlm } from '../src/adapters/mockLlm.ts'; // mock model
import { MockTts } from '../src/adapters/mockTts.ts'; // mock speech
import { SseTraceSink } from '../src/adapters/traceSink.ts'; // trace
import { WsNotifier } from '../src/adapters/wsNotifier.ts'; // notifier
import { createUseCases, type Deps } from '../src/application/useCases.ts'; // use-cases
import { DailyCap } from '../src/domain/dailyCap.ts'; // caps
import type { StreamEvent } from '../src/domain/model.ts'; // stream events
import { createServer } from '../src/interfaces/http.ts'; // the server under test

const DEVICE = 'd'.repeat(32); // synthetic TV token
const AGENT = 'a'.repeat(32); // synthetic agent token
const STUDIO = 'http://localhost:5173'; // the allowed browser origin
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/; // a random (version 4) UUID
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'raw', version: '1.0.0' } } }; // a raw initialize request
const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list' }; // a raw tools/list request
const MCP_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }; // what the transport requires on POST

let running: { server: Server; wss: WebSocketServer; clients: Client[] } | null = null; // closed after each test

/** Starts a mock-mode server on a free loopback port, with no profile facts; MCP sessions end after `mcpIdleMs` without requests. */
async function start(mcpIdleMs = 60_000) { // the system under test
  const clock = () => Date.now(); // real time
  const newId = () => randomUUID(); // real ids
  const wss = new WebSocketServer({ noServer: true }); // stream
  const trace = new SseTraceSink(clock, newId); // spans
  const notifier = new WsNotifier(wss); // pushes
  const log = () => {}; // quiet
  const deps: Deps = { mode: 'mock', store: new MemoryStore(), notifier, trace, log, clock, newId, llm: { live: null, mock: new MockLlm(), cap: new DailyCap(1000, clock), budgetMs: 3500 }, tts: { live: null, mock: new MockTts(), cap: new DailyCap(100_000, clock) } }; // mock wiring
  const server = createServer({ token: DEVICE, agentToken: AGENT, mcpAllowedHosts: ['localhost', '127.0.0.1'], mcpAllowedOrigins: [STUDIO], mode: 'mock', useCases: createUseCases(deps), trace, wss, notifier, log, pingMs: 60_000, mcpIdleMs, studioOrigin: STUDIO, tvOrigin: 'http://10.0.2.2:8787' }); // interfaces
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); // any free port
  running = { server, wss, clients: [] }; // for clean-up
  const port = (server.address() as AddressInfo).port; // the chosen port
  return { port, base: `http://127.0.0.1:${port}`, mcp: `http://127.0.0.1:${port}/mcp`, trace }; // addresses
} // end of start

afterEach(async () => { // close clients, sockets and the server
  if (!running) return; // nothing started
  await Promise.all(running.clients.map((c) => c.close())); // MCP clients and their SSE streams
  running.wss.clients.forEach((c) => c.terminate()); // WebSocket clients
  running.server.closeAllConnections(); // keep-alive connections
  await new Promise((resolve) => running!.server.close(resolve)); // and the server
  running = null; // done
}); // end of clean-up

/** An official SDK client with a session on `url`, authenticated with `token`. */
async function connect(url: string, token = AGENT): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> { // initialise
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }); // static bearer token
  const client = new Client({ name: 'conformance', version: '1.0.0' }); // the client
  await client.connect(transport); // initialize, then notifications/initialized
  running!.clients.push(client); // closed after the test
  return { client, transport }; // ready
} // end of connect

/** Calls a tool and returns its JSON output, or the whole result when it is a tool error. */
async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> { // tools/call
  const result = await client.callTool({ name, arguments: args }); // the call
  const text = (result.content as { type: string; text: string }[])[0]!.text; // one text block
  return result.isError ? { isError: true, text } : (JSON.parse(text) as Record<string, unknown>); // parsed
} // end of call

/** One raw HTTP request; Node's fetch would not let a test set Host. */
function raw(port: number, method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> { // any headers
  return new Promise((resolve, reject) => { // resolves with the response
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => { // send
      let text = ''; // the body
      res.setEncoding('utf8'); // as text
      res.on('data', (chunk: string) => { text += chunk; }); // collect it
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text })); // done
    }); // end of the request
    req.on('error', reject); // network failure
    req.end(body === undefined ? undefined : JSON.stringify(body)); // send the body, if any
  }); // end of the promise
} // end of raw

/** A TV on the stream that collects its events. */
async function tv(port: number): Promise<StreamEvent[]> { // a connected TV
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/stream`, { headers: { Authorization: `Bearer ${DEVICE}` } }); // the TV token
  const events: StreamEvent[] = []; // received events
  socket.on('message', (data) => events.push(JSON.parse(String(data)))); // one JSON event per message
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }); // connected
  return events; // filled as events arrive
} // end of tv

/** Polls `check` until it returns a value, or fails after `ms`. */
async function until<T>(check: () => T | undefined, ms = 2000): Promise<T> { // wait for an async effect
  const end = Date.now() + ms; // deadline
  for (;;) { // poll
    const value = check(); // try
    if (value !== undefined) return value; // done
    if (Date.now() > end) throw new Error('timed out waiting'); // too slow
    await new Promise((r) => setTimeout(r, 10)); // try again soon
  } // end of polling
} // end of until

/** POST /v1/utterances as the TV (or with another token): a committed reply. */
const commit = (base: string, token: string, questionId: string | null, text: string) => fetch(`${base}/v1/utterances`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ question_id: questionId, text, clicks: 1, duration_ms: 2400 }) }); // the TV's commit

/** The status a failing SDK connect was refused with. */
async function refusal(url: string, token: string): Promise<number | undefined> { // StreamableHTTPError.code
  const client = new Client({ name: 'conformance', version: '1.0.0' }); // a fresh client: a failed connect closes its transport
  const error = await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })).catch((e: unknown) => e); // refused
  return error instanceof StreamableHTTPError ? error.code : undefined; // the HTTP status
} // end of refusal

describe('sessions and protocol (Streamable HTTP, spec 2025-11-25)', () => { // Table 15
  it('initialises a session with a random UUID and negotiates protocol 2025-11-25', async () => { // initialise
    const { mcp } = await start(); // server
    const a = await connect(mcp); // one session
    const b = await connect(mcp); // another
    expect(a.transport.sessionId).toMatch(UUID); // a secure random, visible-ASCII id
    expect(b.transport.sessionId).not.toBe(a.transport.sessionId); // one per session
    expect(a.transport.protocolVersion).toBe('2025-11-25'); // the latest version
    expect(a.client.getServerVersion()).toEqual({ name: 'svavak', title: 'SvaVāk', version: '0.1.0' }); // who answered: an ASCII identifier, and the product's name for people
  }); // end of the case

  it('ends a session on DELETE; its id then gets 404', async () => { // session lifecycle
    const { port, mcp } = await start(); // server
    const { transport } = await connect(mcp); // a session
    const id = transport.sessionId!; // remembered
    await transport.terminateSession(); // DELETE /mcp
    const headers = { ...MCP_HEADERS, Authorization: `Bearer ${AGENT}`, 'Mcp-Session-Id': id, 'MCP-Protocol-Version': '2025-11-25' }; // the old session
    expect((await raw(port, 'POST', '/mcp', headers, LIST)).status).toBe(404); // gone
    expect((await raw(port, 'DELETE', '/mcp', headers)).status).toBe(404); // and cannot be ended twice
  }); // end of the case

  it('ends a session after mcpIdleMs without requests; each request restarts the wait', async () => { // idle sessions (30 minutes in compose.ts)
    const { port, mcp } = await start(400); // sessions idle out after 400 ms
    const { client, transport } = await connect(mcp); // a session
    const headers = { ...MCP_HEADERS, Authorization: `Bearer ${AGENT}`, 'Mcp-Session-Id': transport.sessionId!, 'MCP-Protocol-Version': '2025-11-25' }; // the session, raw
    for (let i = 0; i < 3; i++) { // 750 ms in all, longer than the idle time
      await new Promise((r) => setTimeout(r, 250)); // less than the idle time
      await client.listTools(); // a request: the wait starts again
    } // end of the requests
    expect((await raw(port, 'POST', '/mcp', headers, LIST)).status).toBe(200); // still open
    await new Promise((r) => setTimeout(r, 650)); // idle for longer than 400 ms
    expect((await raw(port, 'POST', '/mcp', headers, LIST)).status).toBe(404); // ended
  }); // end of the case

  it('refuses an unknown session id (404), and a request without one that is not initialize (400)', async () => { // no session
    const { port } = await start(); // server
    const auth = { ...MCP_HEADERS, Authorization: `Bearer ${AGENT}` }; // authenticated
    expect((await raw(port, 'POST', '/mcp', { ...auth, 'Mcp-Session-Id': randomUUID() }, LIST)).status).toBe(404); // never issued
    expect((await raw(port, 'POST', '/mcp', auth, LIST)).status).toBe(400); // no session
  }); // end of the case

  it('answers an unsupported MCP-Protocol-Version header with 400', async () => { // header tests
    const { port, mcp } = await start(); // server
    const { transport } = await connect(mcp); // a session
    const headers = { ...MCP_HEADERS, Authorization: `Bearer ${AGENT}`, 'Mcp-Session-Id': transport.sessionId! }; // the session
    const res = await raw(port, 'POST', '/mcp', { ...headers, 'MCP-Protocol-Version': '1999-01-01' }, LIST); // unsupported
    expect(res.status).toBe(400); // refused
    expect(res.text).toContain('Unsupported protocol version'); // and why
    expect((await raw(port, 'POST', '/mcp', { ...headers, 'MCP-Protocol-Version': '2025-11-25' }, LIST)).status).toBe(200); // the negotiated one works
  }); // end of the case
}); // end of sessions and protocol

describe('access (plan §6.1: tampering, DNS rebinding)', () => { // tokens, Origin and Host
  it('accepts only the agent token on /mcp: none is 401, the TV token 403', async () => { // authentication
    const { port, mcp } = await start(); // server
    expect(await refusal(mcp, 'wrong'.repeat(4))).toBe(401); // a wrong token
    expect(await refusal(mcp, DEVICE)).toBe(403); // the TV token
    const none = await raw(port, 'POST', '/mcp', MCP_HEADERS, INIT); // no token
    expect([none.status, none.headers['www-authenticate']]).toEqual([401, 'Bearer']); // says how to authenticate
  }); // end of the case

  it('refuses the agent token on the TV routes with 403, so an agent cannot post answers', async () => { // tampering
    const { port, base } = await start(); // server
    expect((await commit(base, AGENT, null, 'Yes')).status).toBe(403); // POST /v1/utterances
    expect((await commit(base, DEVICE, null, 'Yes')).status).toBe(201); // the TV token still works
    const upgrade = await raw(port, 'GET', '/v1/stream', { Authorization: `Bearer ${AGENT}`, Connection: 'Upgrade', Upgrade: 'websocket' }); // the stream: refused before the WebSocket handshake headers matter
    expect(upgrade.status).toBe(403); // refused too
  }); // end of the case

  it('refuses a foreign Origin with 403, and allows the studio and no Origin at all', async () => { // DNS rebinding
    const { port } = await start(); // server
    const auth = { ...MCP_HEADERS, Authorization: `Bearer ${AGENT}` }; // authenticated
    expect((await raw(port, 'POST', '/mcp', { ...auth, Origin: 'http://evil.example' }, INIT)).status).toBe(403); // a foreign page
    expect((await raw(port, 'POST', '/mcp', { ...auth, Origin: 'http://localhost:5174' }, INIT)).status).toBe(403); // another port is another origin
    expect((await raw(port, 'POST', '/mcp', { ...auth, Origin: STUDIO }, INIT)).status).toBe(200); // the studio
    expect((await raw(port, 'POST', '/mcp', auth, INIT)).status).toBe(200); // a non-browser client
  }); // end of the case

  it('refuses a Host outside the allow-list with 403, checking /mcp only', async () => { // DNS rebinding
    const { port } = await start(); // server
    const auth = { ...MCP_HEADERS, Authorization: `Bearer ${AGENT}` }; // authenticated
    expect((await raw(port, 'POST', '/mcp', { ...auth, Host: `evil.example:${port}` }, INIT)).status).toBe(403); // a rebound name
    expect((await raw(port, 'POST', '/mcp', { ...auth, Host: `localhost:${port}` }, INIT)).status).toBe(200); // an allowed name, any port
    const tvHeaders = { Host: `10.0.2.2:${port}`, Authorization: `Bearer ${DEVICE}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }; // the emulator's name for the host
    expect((await raw(port, 'POST', '/v1/utterances', tvHeaders, { question_id: null, text: 'Hello', clicks: 1, duration_ms: 900 })).status).toBe(201); // still reaches the TV routes
  }); // end of the case
}); // end of access

describe('tools (plan Table 16)', () => { // tools/list and tools/call
  it('lists the four tools with input schemas and the hints of Table 16', async () => { // tools/list
    const { mcp } = await start(); // server
    const { client } = await connect(mcp); // a session
    const { tools } = await client.listTools(); // the list
    const byName = Object.fromEntries(tools.map((t) => [t.name, t])); // by name
    expect(Object.keys(byName).sort()).toEqual(['add_profile_fact', 'ask_question', 'get_answer', 'get_recent_messages']); // the P0 tools and add_profile_fact
    expect(byName.ask_question!.inputSchema).toMatchObject({ type: 'object', required: ['question', 'asked_by'], properties: { question: { type: 'string', minLength: 1, maxLength: 200 }, options: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', maxLength: 40 } }, urgency: { enum: ['normal', 'high'], default: 'normal' }, asked_by: { type: 'string', maxLength: 40 } } }); // validated inputs
    expect(byName.get_answer!.inputSchema).toMatchObject({ required: ['question_id'], properties: { wait_seconds: { type: 'integer', minimum: 0, maximum: 25 } } }); // long-poll up to 25 whole seconds
    expect(byName.get_recent_messages!.inputSchema).toMatchObject({ properties: { since: { type: 'string', format: 'date-time' }, limit: { type: 'integer', minimum: 1, maximum: 20 } } }); // optional filters
    expect(byName.add_profile_fact!.inputSchema).toMatchObject({ required: ['fact', 'category'], properties: { fact: { maxLength: 120, pattern: '^[^<>]*$' }, category: { enum: ['likes', 'dislikes', 'people', 'routines', 'other'] } } }); // fact limits
    expect([byName.ask_question!.annotations, byName.get_answer!.annotations, byName.get_recent_messages!.annotations, byName.add_profile_fact!.annotations]).toEqual([{ readOnlyHint: false, idempotentHint: false }, { readOnlyHint: true }, { readOnlyHint: true }, undefined]); // Table 16's hints
    for (const name of ['ask_question', 'add_profile_fact']) expect(byName[name]!.description).toContain('passwords, health records or financial data'); // the safety rule
  }); // end of the case

  it('calls each tool: ask, wait, answer on the TV, then read the messages and add a fact', async () => { // tools/call
    const { port, base, mcp } = await start(); // server
    const { client } = await connect(mcp); // a session
    expect(await call(client, 'ask_question', { question: 'Shall I open the window?', asked_by: 'Alex' })).toEqual({ question_id: expect.stringMatching(UUID), delivered: false }); // no TV yet
    const events = await tv(port); // a TV connects
    const asked = await call(client, 'ask_question', { question: 'Would you like tea or coffee?', options: ['Tea', 'Coffee'], urgency: 'high', asked_by: 'Alex' }); // with options
    expect(asked.delivered).toBe(true); // the TV got it
    const id = asked.question_id as string; // its id
    const created = await until(() => events.find((e) => e.type === 'question.created' && e.question.id === id)); // on the stream
    expect(created.type === 'question.created' && created.question.candidates.map((c) => c.text)).toEqual(['Tea', 'Coffee', 'Not now', 'Not sure']); // exactly the options and two defaults
    await until(() => events.find((e) => e.type === 'question.candidates' && e.question_id === id)); // and final at once
    expect(await call(client, 'get_answer', { question_id: id })).toEqual({ status: 'pending', answer_text: null, answered_at: null, clicks: null }); // no wait
    expect((await commit(base, DEVICE, id, 'Tea')).status).toBe(201); // Sam answers on the TV
    expect(await call(client, 'get_answer', { question_id: id })).toEqual({ status: 'answered', answer_text: 'Tea', answered_at: expect.any(String), clicks: 1 }); // the answer
    expect(await call(client, 'get_recent_messages', { limit: 5 })).toEqual({ messages: [{ text: 'Tea', time: expect.any(String), kind: 'reply', question_text: 'Would you like tea or coffee?' }] }); // with its question
    expect(await call(client, 'add_profile_fact', { fact: 'Sam prefers tea to coffee', category: 'likes' })).toEqual({ fact_id: expect.stringMatching(UUID) }); // stored
  }); // end of the case

  it('get_recent_messages returns the newest messages within the limit, oldest first', async () => { // more messages than the limit
    const { base, mcp } = await start(); // server
    const { client } = await connect(mcp); // a session
    for (let i = 1; i <= 7; i++) { // seven messages, one at a time so their times differ
      expect((await commit(base, DEVICE, null, `Message ${i}`)).status).toBe(201); // said on the TV
      await new Promise((r) => setTimeout(r, 5)); // a later time for the next
    } // end of the messages
    const { messages } = await call(client, 'get_recent_messages', { limit: 5 }); // five of seven
    expect((messages as { text: string }[]).map((m) => m.text)).toEqual(['Message 3', 'Message 4', 'Message 5', 'Message 6', 'Message 7']); // the newest five, oldest first
  }); // end of the case

  it('get_answer returns answered as soon as the TV commits during its wait', async () => { // long-poll
    const { base, mcp } = await start(); // server
    const { client } = await connect(mcp); // a session
    const id = (await call(client, 'ask_question', { question: 'Tea or coffee?', options: ['Tea', 'Coffee'], asked_by: 'Alex' })).question_id as string; // asked
    const started = performance.now(); // real time
    const waiting = call(client, 'get_answer', { question_id: id, wait_seconds: 10 }); // waits up to 10 s
    await new Promise((r) => setTimeout(r, 200)); // the call is waiting
    expect((await commit(base, DEVICE, id, 'Coffee')).status).toBe(201); // the TV commits
    expect(await waiting).toMatchObject({ status: 'answered', answer_text: 'Coffee' }); // the answer
    expect(performance.now() - started).toBeLessThan(3000); // long before the wait ended
  }); // end of the case

  it('get_answer returns pending after a 1 s wait without an answer, and expired after a newer question', async () => { // timeout and expiry
    const { mcp } = await start(); // server
    const { client } = await connect(mcp); // a session
    const id = (await call(client, 'ask_question', { question: 'Tea?', asked_by: 'Alex' })).question_id as string; // asked
    const started = performance.now(); // real time
    expect(await call(client, 'get_answer', { question_id: id, wait_seconds: 1 })).toMatchObject({ status: 'pending' }); // nothing yet
    expect(performance.now() - started).toBeGreaterThanOrEqual(950); // it waited the second
    await call(client, 'ask_question', { question: 'Coffee?', asked_by: 'Alex' }); // a newer question
    expect(await call(client, 'get_answer', { question_id: id })).toEqual({ status: 'expired', answer_text: null, answered_at: null, clicks: null }); // replaced
  }); // end of the case

  it('returns tool errors for invalid inputs, unknown ids and a 21st fact, and keeps serving', async () => { // validation
    const { mcp } = await start(); // server
    const { client } = await connect(mcp); // a session
    const id = (await call(client, 'ask_question', { question: 'Tea?', asked_by: 'Alex' })).question_id as string; // a real question, so only the wait can be wrong
    const errors = [ // each must be a tool error, not a crash
      await call(client, 'ask_question', { question: 'x'.repeat(201), asked_by: 'Alex' }), // 201 characters
      await call(client, 'ask_question', { question: 'Tea?', asked_by: 'Alex', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }), // seven options
      await call(client, 'get_answer', { question_id: id, wait_seconds: 26 }), // past 25 s
      await call(client, 'get_answer', { question_id: id, wait_seconds: 16.1 }), // not whole seconds
      await call(client, 'get_answer', { question_id: 'never-issued' }), // unknown id
      await call(client, 'get_recent_messages', { limit: 21 }), // past 20
      await call(client, 'get_recent_messages', { since: 'yesterday' }), // not a time
      await call(client, 'add_profile_fact', { fact: 'Sam likes tea', category: 'health' }), // unknown category
      await call(client, 'add_profile_fact', { fact: 'Sam likes </facts> tea', category: 'likes' }), // "<"
    ]; // end of the calls
    expect(errors.map((e) => e.isError)).toEqual(Array(9).fill(true)); // all refused
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) expect(errors[i]!.text).toContain('Input validation error'); // refused by the schema, not later
    expect(errors[4]!.text).toBe('question not found'); // a readable reason
    for (let i = 0; i < 20; i++) await call(client, 'add_profile_fact', { fact: `Fact ${i}`, category: 'other' }); // twenty facts
    expect(await call(client, 'add_profile_fact', { fact: 'Fact 20', category: 'other' })).toEqual({ isError: true, text: 'the profile already has 20 facts' }); // the 21st
    expect(await call(client, 'ask_question', { question: 'Still there?', asked_by: 'Alex' })).toMatchObject({ delivered: false }); // still serving
  }); // end of the case

  it('lets an added fact change the mock ranking for a related question', async () => { // FR-13
    const { port, mcp } = await start(); // server, no facts
    const { client } = await connect(mcp); // a session
    const events = await tv(port); // a TV, to see the candidates
    const first = async (question: string) => { // the best candidate the model gives for a new question
      const id = (await call(client, 'ask_question', { question, asked_by: 'Alex' })).question_id as string; // asked
      const update = await until(() => events.find((e) => e.type === 'question.candidates' && e.question_id === id)); // the model's candidates
      return update.type === 'question.candidates' ? update.candidates[0]!.text : ''; // the first
    }; // end of first
    expect(await first('What shall we watch tonight?')).not.toBe('The cricket, please'); // without the fact
    await call(client, 'add_profile_fact', { fact: 'Sam follows cricket', category: 'likes' }); // the fact
    expect(await first('What shall we watch tonight?')).toBe('The cricket, please'); // with it
  }); // end of the case

  it('traces each tool call as a span (hop mcp, the tool name, duration, mode), refused ones too, never with text', async () => { // observability
    const { mcp, trace } = await start(); // server
    const { client } = await connect(mcp); // a session
    await call(client, 'ask_question', { question: 'Tea or coffee?', asked_by: 'Alex' }); // a call
    await call(client, 'ask_question', { question: 'x'.repeat(201), asked_by: 'Alex' }); // a call refused by validation
    await call(client, 'Tea or coffee?', {}); // an unknown tool, named with text
    const spans = await until(() => { const s = trace.recent().filter((x) => x.hop === 'mcp'); return s.length === 3 ? s : undefined; }); // emitted as each response closes
    expect(spans).toEqual(['ask_question', 'ask_question', 'unknown'].map((operation) => ({ id: expect.any(String), at: expect.any(String), hop: 'mcp', operation, duration_ms: expect.any(Number), mode: 'mock' }))); // one per call
    expect(JSON.stringify(trace.recent())).not.toContain('Tea or coffee'); // no text, not even a made-up tool name
  }); // end of the case
}); // end of tools
