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
  const server = createServer({ token: TOKEN, agentToken: 'a'.repeat(32), mcpAllowedHosts: ['localhost', '127.0.0.1'], mcpAllowedOrigins: ['http://localhost:5173'], mode: 'mock', useCases: createUseCases(deps), trace, wss, notifier, log, pingMs: options.pingMs ?? 60_000, mcpIdleMs: 60_000, studioOrigin: 'http://localhost:5173', tvOrigin: 'http://10.0.2.2:8787' }); // interfaces
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
  it('pushes question.created with the defaults that fit, then question.candidates from the model', async () => { // S1
    const { http, ws } = await start(); // server
    const tv = await connect(ws); // a connected TV
    const res = await ask(http); // the caregiver asks
    expect(res.status).toBe(201); // created
    const question = (await res.json()) as Question; // the response
    expect(question).toMatchObject({ text: 'Would you like tea or coffee?', asked_by: 'Alex', status: 'pending', answered_utterance_id: null }); // stored as asked
    const created = await until(() => tv.events.find((e) => e.type === 'question.created')); // first event
    expect(created).toEqual({ type: 'question.created', question }); // the same question, with the defaults
    expect(question.candidates.map((c) => c.text)).toEqual(['You decide', 'Not sure', 'Tell me more', 'Not now']); // the four defaults of a choice question: no Yes or No, fallbacks last
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

  it('replays the open question, with the model candidates, to a TV that connects later, and nothing once it is answered', async () => { // replay on reconnect
    const { http, ws, logs } = await start({ pingMs: 50 }); // pings mark time on the stream
    const first = await connect(ws); // a TV that sees the question asked
    const question = (await (await ask(http)).json()) as Question; // the caregiver asks
    const update = await until(() => first.events.find((e) => e.type === 'question.candidates')); // the model's candidates went out
    if (update.type !== 'question.candidates') throw new Error('unreachable'); // narrow the type
    const late = await connect(ws); // a TV that connects afterwards
    expect(await until(() => late.events[0])).toEqual({ type: 'question.created', question: { ...question, candidates: update.candidates } }); // its first event
    expect(logs).toContainEqual({ msg: 'question.replayed', question_id: question.id }); // logged, without the text
    expect((await say(http, 'k1', { ...reply, question_id: question.id })).status).toBe(201); // answered
    const after = await connect(ws); // a TV that connects after the answer
    await until(() => after.events.find((e) => e.type === 'ping')); // a replay would have come before the first ping
    expect(after.events.filter((e) => e.type !== 'ping')).toEqual([]); // no question event
  }); // end of the case
}); // end of the stream

describe('POST /v1/utterances and GET /v1/utterances/{id}/audio', () => { // commit and speech
  it('commits once per idempotency key; a replay returns the same utterance with 200', async () => { // idempotency
    const { http } = await start(); // mock speech
    const first = await say(http, 'key-1', reply); // commit
    expect(first.status).toBe(201); // created
    const body = (await first.json()) as Record<string, unknown>; // the utterance
    expect(body).toMatchObject({ ...reply, kind: 'spontaneous', audio_url: `/v1/utterances/${String(body.id)}/audio` }); // mock mode: the tone
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

  it('stores the question_text of a fixture question, ignores it for a server question and refuses one over 200 characters', async () => { // reply context
    const { http } = await start(); // server
    const fixture = (await (await say(http, 'k1', { ...reply, question_text: '  Shall we watch the cricket?  ' })).json()) as Record<string, unknown>; // a reply to a fixture question
    expect(fixture).toMatchObject({ question_id: null, question_text: 'Shall we watch the cricket?' }); // stored, trimmed
    expect(((await (await say(http, 'k1', reply)).json()) as Record<string, unknown>).question_text).toBe('Shall we watch the cricket?'); // the stored utterance again
    expect(((await (await say(http, 'k2', reply)).json()) as Record<string, unknown>).question_text).toBeNull(); // absent means null
    const question = (await (await ask(http)).json()) as Question; // a server question
    const answer = (await (await say(http, 'k3', { ...reply, question_id: question.id, question_text: 'Something else?' })).json()) as Record<string, unknown>; // a reply to it
    expect(answer.question_text).toBe('Would you like tea or coffee?'); // the stored question's text wins
    await expectProblem(await say(http, 'k4', { ...reply, question_text: 'x'.repeat(201) }), 400); // over 200 characters
    await expectProblem(await say(http, 'k5', { ...reply, question_text: '   ' }), 400); // blank after trimming
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

  it('serves the mock tone as audio/wav in mock mode', async () => { // the TV's playback path without AWS
    const { http } = await start(); // mock speech
    const body = (await (await say(http, 'k1', reply)).json()) as { id: string; audio_url: string | null }; // commit
    expect(body.audio_url).toBe(`/v1/utterances/${body.id}/audio`); // not null in mock mode
    const audio = await fetch(`${http}${body.audio_url}`, { headers: AUTH }); // fetch it
    expect([audio.status, audio.headers.get('content-type')]).toEqual([200, 'audio/wav']); // WAV
    expect(Buffer.from(await audio.arrayBuffer()).toString('latin1', 0, 4)).toBe('RIFF'); // a RIFF file
  }); // end of the case
}); // end of utterances

describe('the studio in a browser (plan §4.7)', () => { // Origin checks, CORS and the WebSocket token in a subprotocol
  const STUDIO = 'http://localhost:5173'; // the studio's origin
  const FOREIGN = 'http://evil.example'; // any other site
  const TV = 'http://10.0.2.2:8787'; // the emulator TV's origin, as React Native derives it from the URL

  /** Opens the stream as a browser would (no headers but Origin, the token in the subprotocol list) and says how it went. */
  function browser(url: string, protocols: string[], origin = STUDIO): Promise<{ status: number; protocol?: string }> { // 101, or the refusal's status
    return new Promise((resolve) => { // resolves once
      const socket = new WebSocket(`${url}/v1/stream`, protocols, { origin }); // what a browser sends
      socket.once('open', () => { resolve({ status: 101, protocol: socket.protocol }); socket.close(); }); // accepted: which subprotocol the server chose
      socket.once('unexpected-response', (_req, res) => { resolve({ status: res.statusCode ?? 0 }); res.resume(); }); // refused
    }); // end of the promise
  } // end of browser

  it('lets the studio read the trace with CORS, and refuses any other Origin on it with 403', async () => { // GET /v1/trace
    const { http } = await start(); // server
    const ok = await fetch(`${http}/v1/trace`, { headers: { ...AUTH, Origin: STUDIO } }); // the studio's fetch
    expect([ok.status, ok.headers.get('access-control-allow-origin')]).toEqual([200, STUDIO]); // readable by the studio
    await ok.body!.cancel(); // unsubscribe
    const none = await fetch(`${http}/v1/trace`, { headers: AUTH }); // a tool, which sends no Origin
    expect([none.status, none.headers.get('access-control-allow-origin')]).toEqual([200, null]); // allowed, no CORS
    await none.body!.cancel(); // unsubscribe
    await expectProblem(await fetch(`${http}/v1/trace`, { headers: { ...AUTH, Origin: FOREIGN } }), 403); // another site's page, even with the token
    await expectProblem(await fetch(`${http}/v1/trace`, { headers: { Origin: FOREIGN } }), 403); // or without it
  }); // end of the case

  it("answers the studio's preflights without a token, and gives other origins no CORS headers", async () => { // OPTIONS
    const { http } = await start(); // server
    for (const [path, method] of [['/v1/trace', 'GET'], ['/v1/utterances', 'POST']]) { // the studio's two cross-origin requests with headers
      const res = await fetch(`${http}${path}`, { method: 'OPTIONS', headers: { Origin: STUDIO, 'Access-Control-Request-Method': method!, 'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key' } }); // the browser's preflight
      expect(res.status).toBe(204); // answered, no body
      expect(res.headers.get('access-control-allow-origin')).toBe(STUDIO); // the studio only
      expect(res.headers.get('access-control-allow-methods')).toContain(method); // the method it will send
      expect(res.headers.get('access-control-allow-headers')!.toLowerCase().split(/,\s*/)).toEqual(expect.arrayContaining(['authorization', 'content-type', 'idempotency-key'])); // the headers it will send
    } // end of the preflights
    const foreign = await fetch(`${http}/v1/utterances`, { method: 'OPTIONS', headers: { Origin: FOREIGN, 'Access-Control-Request-Method': 'POST' } }); // another site's preflight
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull(); // no CORS: the browser blocks the request
  }); // end of the case

  it("still needs the token on the studio's real requests: only its preflights go without one", async () => { // CORS is not authentication
    const { http, ws } = await start(); // server
    await expectProblem(await fetch(`${http}/v1/trace`, { headers: { Origin: STUDIO } }), 401); // the trace
    await expectProblem(await fetch(`${http}/v1/utterances`, { method: 'POST', headers: { Origin: STUDIO, 'Content-Type': 'application/json', 'Idempotency-Key': 'k' }, body: JSON.stringify(reply) }), 401); // a reply
    expect(await refusedWith(`${ws}/v1/stream`, { Origin: STUDIO })).toBe(401); // the stream
    await expectProblem(await fetch(`${http}/v1/trace`, { headers: { ...AUTH, Origin: 'null' } }), 403); // a sandboxed or file page sends the Origin "null"
  }); // end of the case

  it("takes the studio's reply with CORS, as the household's TV", async () => { // POST /v1/utterances from the virtual TV
    const { http } = await start(); // server
    const res = await fetch(`${http}/v1/utterances`, { method: 'POST', headers: { ...JSON_AUTH, Origin: STUDIO, 'Idempotency-Key': 'studio-1' }, body: JSON.stringify(reply) }); // the virtual TV's post
    expect([res.status, res.headers.get('access-control-allow-origin')]).toEqual([201, STUDIO]); // committed, and readable by the studio
  }); // end of the case

  it('takes the device token from the subprotocol pair "bearer, <token>" and answers with "bearer" only', async () => { // browsers cannot set headers on a WebSocket
    const { ws } = await start(); // server
    expect(await browser(ws, ['bearer', TOKEN])).toEqual({ status: 101, protocol: 'bearer' }); // accepted; the token is never echoed
    expect(await browser(ws, ['bearer', 'wrong-token-0123456789'])).toEqual({ status: 401 }); // a wrong token
    expect(await browser(ws, ['bearer', 'a'.repeat(32)])).toEqual({ status: 403 }); // the agent token, as on the REST routes
    expect(await browser(ws, ['bearer'])).toEqual({ status: 401 }); // no token
    expect(await browser(ws, [TOKEN, 'bearer'])).toEqual({ status: 401 }); // only the pair in this order counts
    expect(await browser(ws, ['bearer', TOKEN, 'extra'])).toEqual({ status: 401 }); // and nothing after it
    const both = await new Promise<number>((resolve) => { // a wrong header with a right pair: the header wins, as for a TV
      const socket = new WebSocket(`${ws}/v1/stream`, ['bearer', TOKEN], { headers: { Authorization: 'Bearer wrong' } }); // both
      socket.once('open', () => { resolve(101); socket.close(); }); // accepted (wrong)
      socket.once('unexpected-response', (_req, res) => { resolve(res.statusCode ?? 0); res.resume(); }); // refused
    }); // end of the promise
    expect(both).toBe(401); // the subprotocol is only a fallback
  }); // end of the case

  it("refuses a stream from any Origin but the studio's or the emulator TV's with 403", async () => { // GET /v1/stream
    const { http, ws } = await start(); // server
    expect(await browser(ws, ['bearer', TOKEN], FOREIGN)).toEqual({ status: 403 }); // another site's page, even with the token
    expect(await refusedWith(`${ws}/v1/stream`, { ...AUTH, Origin: FOREIGN })).toBe(403); // a header token does not help either
    expect(await refusedWith(`${ws}/v1/stream`, { ...AUTH, Origin: 'http://evil.example:8787', Host: 'evil.example:8787' })).toBe(403); // a DNS-rebound page, whose Origin matches its Host
    const tool = await connect(ws); // a tool: the token in a header, no Origin
    expect(tool.socket.readyState).toBe(WebSocket.OPEN); // accepted
    tool.socket.close(); // done
    const tv = new WebSocket(`${ws}/v1/stream`, { headers: AUTH, origin: TV }); // the TV: React Native's Android WebSocket sends the URL's own origin
    await new Promise((resolve, reject) => { tv.once('open', resolve); tv.once('unexpected-response', (_req, res) => reject(new Error(`refused with ${res.statusCode}`))); }); // accepted
    tv.close(); // done
    await expectProblem(await fetch(`${http}/v1/trace`, { headers: { ...AUTH, Origin: http } }), 403); // the server's own address is no exception
  }); // end of the case
}); // end of the studio

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
