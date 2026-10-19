// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// API and WebSocket contract (plan Table 13): auth, problem+json, the S1 events on the stream, utterances and trace.

import { randomUUID } from 'node:crypto'; // ids
import type { AddressInfo } from 'node:net'; // listening address
import type { Server } from 'node:http'; // the server type
import { afterEach, describe, expect, it } from 'vitest'; // test API
import WebSocket, { WebSocketServer } from 'ws'; // client and server
import { MemoryStore } from '../src/adapters/memoryStore.ts'; // store
import { MockLlm } from '../src/adapters/mockLlm.ts'; // mock model
import { MockTts } from '../src/adapters/mockTts.ts'; // mock speech
import { SseTraceSink } from '../src/adapters/traceSink.ts'; // trace
import { WsNotifier } from '../src/adapters/wsNotifier.ts'; // notifier
import { createUseCases, type Deps } from '../src/application/useCases.ts'; // use-cases
import { DailyCap } from '../src/domain/dailyCap.ts'; // caps
import type { Candidate, Question, Span, StreamEvent } from '../src/domain/model.ts'; // shapes
import { createServer } from '../src/interfaces/http.ts'; // tested
import type { TtsPort } from '../src/ports/index.ts'; // speech port

const TOKEN = 't'.repeat(32); // synthetic device token
const AUTH = { Authorization: `Bearer ${TOKEN}` }; // the header the TV sends
const JSON_AUTH = { ...AUTH, 'Content-Type': 'application/json' }; // for POSTs
let running: { server: Server; wss: WebSocketServer } | null = null; // closed after each test

/** Starts a mock-mode server on a free loopback port. */
async function start(options: { tts?: TtsPort; pingMs?: number } = {}) { // the system under test
  const clock = () => Date.now(); // real time
  const newId = () => randomUUID(); // real ids
  const wss = new WebSocketServer({ noServer: true }); // stream
  const trace = new SseTraceSink(clock, newId); // spans
  const notifier = new WsNotifier(wss); // pushes
  const logs: Record<string, unknown>[] = []; // log lines
  const log = (msg: string, fields?: Record<string, unknown>) => { logs.push({ msg, ...fields }); }; // records them
  const deps: Deps = { mode: 'mock', store: new MemoryStore(), notifier, trace, log, clock, newId, llm: { live: null, mock: new MockLlm(), cap: new DailyCap(1000, clock), budgetMs: 3500 }, tts: { live: null, mock: options.tts ?? new MockTts(), cap: new DailyCap(100_000, clock) } }; // mock wiring
  const server = createServer({ token: TOKEN, mode: 'mock', useCases: createUseCases(deps), trace, wss, notifier, log, pingMs: options.pingMs ?? 60_000 }); // interfaces
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); // any free port
  running = { server, wss }; // for clean-up
  const port = (server.address() as AddressInfo).port; // the chosen port
  return { http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}`, logs }; // base URLs
} // end of start

afterEach(async () => { // close sockets and the server
  if (!running) return; // nothing started
  running.wss.clients.forEach((c) => c.terminate()); // WebSocket clients
  running.server.closeAllConnections(); // SSE and keep-alive connections
  await new Promise((resolve) => running!.server.close(resolve)); // and the server
  running = null; // done
}); // end of clean-up

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

/** Opens an authenticated stream connection and collects its events. */
async function connect(url: string): Promise<{ socket: WebSocket; events: StreamEvent[] }> { // a TV
  const socket = new WebSocket(`${url}/v1/stream`, { headers: AUTH }); // with the device token
  const events: StreamEvent[] = []; // received events
  socket.on('message', (data) => events.push(JSON.parse(String(data)))); // one JSON event per message
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }); // connected
  return { socket, events }; // ready
} // end of connect

/** The HTTP status a WebSocket upgrade was refused with. */
function refusedWith(url: string, headers: Record<string, string>): Promise<number> { // a refused upgrade
  return new Promise((resolve) => { // resolves with the status
    const socket = new WebSocket(url, { headers }); // attempt
    socket.once('unexpected-response', (_req, res) => { resolve(res.statusCode ?? 0); res.resume(); }); // refused; the server closes the connection
  }); // end of the promise
} // end of refusedWith

async function expectProblem(res: Response, status: number): Promise<Record<string, unknown>> { // problem+json check
  expect(res.status).toBe(status); // status code
  expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/); // RFC 9457 media type
  const body = (await res.json()) as Record<string, unknown>; // the details
  expect(body).toMatchObject({ type: 'about:blank', status }); // required fields
  return body; // for further checks
} // end of expectProblem

const ask = (http: string, body: unknown = { text: 'Would you like tea or coffee?', asked_by: 'Alex' }) => fetch(`${http}/v1/questions`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify(body) }); // POST /v1/questions
const say = (http: string, key: string | null, body: unknown) => fetch(`${http}/v1/utterances`, { method: 'POST', headers: { ...JSON_AUTH, ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) }); // POST /v1/utterances
const reply = { question_id: null, text: 'Tea, please', clicks: 2, duration_ms: 3100 }; // a committed reply

describe('authentication', () => { // the static device token
  it('serves /healthz without a token', async () => { // liveness
    const { http } = await start(); // server
    const res = await fetch(`${http}/healthz`); // no header
    expect([res.status, await res.json()]).toEqual([200, { status: 'ok' }]); // alive
  }); // end of the case

  it('refuses every other route without the right token, as problem+json', async () => { // 401
    const { http } = await start(); // server
    const routes: [string, string][] = [['POST', '/v1/questions'], ['POST', '/v1/utterances'], ['GET', '/v1/utterances/x/audio'], ['GET', '/v1/trace'], ['GET', '/v1/nothing']]; // every route
    for (const [method, path] of routes) { // each route
      for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: TOKEN }]) { // none, wrong, no scheme
        const res = await fetch(`${http}${path}`, { method, headers }); // request
        await expectProblem(res, 401); // refused
        expect(res.headers.get('www-authenticate')).toBe('Bearer'); // says how to authenticate
      } // end of the headers
    } // end of the routes
  }); // end of the case

  it('refuses a stream upgrade without the token (401) or on another path (404)', async () => { // WebSocket auth
    const { ws } = await start(); // server
    expect(await refusedWith(`${ws}/v1/stream`, {})).toBe(401); // no token
    expect(await refusedWith(`${ws}/v1/stream`, { Authorization: 'Bearer wrong' })).toBe(401); // wrong token
    expect(await refusedWith(`${ws}/v1/other`, AUTH)).toBe(404); // no such stream
  }); // end of the case
}); // end of authentication

describe('POST /v1/questions and GET /v1/stream', () => { // flow S1 on the stream
  it('pushes question.created with the eight defaults, then question.candidates from the model', async () => { // S1
    const { http, ws } = await start(); // server
    const tv = await connect(ws); // a connected TV
    const res = await ask(http); // the caregiver asks
    expect(res.status).toBe(201); // created
    const question = (await res.json()) as Question; // the response
    expect(question).toMatchObject({ text: 'Would you like tea or coffee?', asked_by: 'Alex', status: 'pending', answered_utterance_id: null }); // stored as asked
    const created = await until(() => tv.events.find((e) => e.type === 'question.created')); // first event
    expect(created).toEqual({ type: 'question.created', question }); // the same question, with the defaults
    expect(question.candidates.map((c) => c.source)).toEqual(Array(8).fill('default')); // eight defaults
    const update = await until(() => tv.events.find((e) => e.type === 'question.candidates')); // second event
    if (update.type !== 'question.candidates') throw new Error('unreachable'); // narrow the type
    expect(update.question_id).toBe(question.id); // for this question
    expect(update.candidates.slice(0, 2).map((c: Candidate) => c.text)).toEqual(['Tea, please', 'Coffee, please']); // best guess first
    expect(update.candidates.reduce((s: number, c: Candidate) => s + c.prior, 0)).toBeCloseTo(1, 9); // priors
    expect(tv.events.map((e) => e.type)).toEqual(['question.created', 'question.candidates']); // in this order
  }); // end of the case

  it('refuses invalid, malformed and oversized bodies as problem+json', async () => { // validation at the edge
    const { http } = await start(); // server
    const missing = await expectProblem(await ask(http, { text: 'Tea?' }), 400); // no asked_by
    expect(missing.detail).toContain('asked_by'); // names the field
    await expectProblem(await ask(http, { text: 'x'.repeat(201), asked_by: 'Alex' }), 400); // over 200 characters
    await expectProblem(await ask(http, { text: '   ', asked_by: 'Alex' }), 400); // blank after trimming
    await expectProblem(await fetch(`${http}/v1/questions`, { method: 'POST', headers: JSON_AUTH, body: '{"text":' }), 400); // malformed JSON
    await expectProblem(await ask(http, { text: 'Tea?', asked_by: 'Alex', pad: 'x'.repeat(33 * 1024) }), 413); // over 32 KB
  }); // end of the case

  it('sends ping events on the stream', async () => { // keep-alive
    const { ws } = await start({ pingMs: 20 }); // fast pings
    const tv = await connect(ws); // connected
    const ping = await until(() => tv.events.find((e) => e.type === 'ping')); // a ping arrives
    expect(ping).toEqual({ type: 'ping', at: expect.any(String) }); // with a time
  }); // end of the case

  it('logs stream connections', async () => { // visibility for the emulator test
    const { ws, logs } = await start(); // server
    const tv = await connect(ws); // connect
    expect(logs).toContainEqual({ msg: 'stream.connected', clients: 1 }); // logged
    tv.socket.close(); // disconnect
    await until(() => logs.find((l) => l.msg === 'stream.closed')); // logged too
  }); // end of the case
}); // end of the stream

describe('POST /v1/utterances and GET /v1/utterances/{id}/audio', () => { // commit and speech
  it('commits once per idempotency key; a replay returns the same utterance with 200', async () => { // idempotency
    const { http } = await start(); // mock speech
    const first = await say(http, 'key-1', reply); // commit
    expect(first.status).toBe(201); // created
    const body = (await first.json()) as Record<string, unknown>; // the utterance
    expect(body).toMatchObject({ ...reply, kind: 'spontaneous', audio_url: null }); // mock mode: no audio
    const again = await say(http, 'key-1', reply); // retry
    expect([again.status, ((await again.json()) as Record<string, unknown>).id]).toEqual([200, body.id]); // the same one
  }); // end of the case

  it('answers a server question and refuses unknown questions, missing keys and bad bodies', async () => { // errors
    const { http } = await start(); // server
    const question = (await (await ask(http)).json()) as Question; // a question
    expect((await say(http, 'k1', { ...reply, question_id: question.id })).status).toBe(201); // a reply to it
    await expectProblem(await say(http, 'k2', { ...reply, question_id: 'unknown' }), 404); // no such question
    await expectProblem(await say(http, null, reply), 400); // no Idempotency-Key
    await expectProblem(await say(http, 'k3', { ...reply, clicks: -1 }), 400); // negative clicks
    await expectProblem(await say(http, 'k4', { text: 'Hi' }), 400); // missing fields
  }); // end of the case

  it('serves the MP3 when the voice made one, and 404 when not', async () => { // audio
    const { http } = await start({ tts: { synthesize: async () => new Uint8Array([0xff, 0xfb, 0x90]) } }); // a voice
    const body = (await (await say(http, 'k1', reply)).json()) as { id: string; audio_url: string }; // commit
    expect(body.audio_url).toBe(`/v1/utterances/${body.id}/audio`); // where to fetch it
    const audio = await fetch(`${http}${body.audio_url}`, { headers: AUTH }); // fetch it
    expect([audio.status, audio.headers.get('content-type')]).toEqual([200, 'audio/mpeg']); // MP3
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xfb, 0x90])); // the bytes
    await expectProblem(await fetch(`${http}/v1/utterances/unknown/audio`, { headers: AUTH }), 404); // nothing there
  }); // end of the case
}); // end of utterances

describe('GET /v1/trace and unknown routes', () => { // the rest of Table 13
  it('streams spans (hop, operation, duration, mode) as SSE, without message text', async () => { // trace
    const { http } = await start(); // server
    const res = await fetch(`${http}/v1/trace`, { headers: AUTH }); // subscribe
    expect(res.headers.get('content-type')).toBe('text/event-stream'); // SSE
    await ask(http); // generate spans
    const reader = res.body!.getReader(); // read the stream
    let text = ''; // what arrived so far
    while (!text.includes('POST /v1/questions') || !text.includes('server→llm')) text += new TextDecoder().decode((await reader.read()).value); // until both spans arrived
    await reader.cancel(); // unsubscribe
    const spans = text.split('\n\n').filter((e) => e.startsWith('data: ')).map((e) => JSON.parse(e.slice(6)) as Span); // parse events
    expect(spans).toContainEqual({ id: expect.any(String), at: expect.any(String), hop: 'client→server', operation: 'POST /v1/questions', duration_ms: expect.any(Number), mode: 'mock' }); // the request span
    expect(text).not.toContain('tea or coffee'); // never the question text
  }); // end of the case

  it('answers an unknown route with 404 problem+json', async () => { // not found
    const { http } = await start(); // server
    await expectProblem(await fetch(`${http}/v1/nothing`, { headers: AUTH }), 404); // no such route
  }); // end of the case
}); // end of the rest
