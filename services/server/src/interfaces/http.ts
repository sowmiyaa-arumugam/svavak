// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Interfaces of plan §4.3 for flow S1: REST (Express 5), the WebSocket stream (ws) and the trace stream (SSE).

import { createHash, timingSafeEqual } from 'node:crypto'; // token comparison
import { createServer as createHttpServer, STATUS_CODES, type Server } from 'node:http'; // the HTTP server
import express, { type NextFunction, type Request, type Response } from 'express'; // REST
import type { WebSocketServer } from 'ws'; // the WebSocket server (noServer mode)
import { z } from 'zod'; // request validation at the edge
import type { SseTraceSink } from '../adapters/traceSink.ts'; // the trace buffer
import { NotFoundError, type UseCases } from '../application/useCases.ts'; // use-cases
import { ASKED_BY_MAX_CHARS, QUESTION_MAX_CHARS, UTTERANCE_MAX_CHARS, type Span } from '../domain/model.ts'; // limits
import type { Log, NotifierPort } from '../ports/index.ts'; // ports

/** What the interfaces need. */
export interface HttpOptions { // wired by compose.ts or a test
  token: string; // the static device token
  mode: 'mock' | 'live'; // for the request spans
  useCases: UseCases; // the application layer
  trace: SseTraceSink; // spans, for GET /v1/trace
  wss: WebSocketServer; // GET /v1/stream connections
  notifier: NotifierPort; // for the keep-alive pings
  log: Log; // JSON log lines
  pingMs: number; // ping interval on the stream
} // end of HttpOptions

/** POST /v1/questions: the temporary dev endpoint until the MCP server's ask_question exists. */
const questionBody = z.object({ // request body
  text: z.string().trim().min(1).max(QUESTION_MAX_CHARS), // the question
  asked_by: z.string().trim().min(1).max(ASKED_BY_MAX_CHARS), // who asks
}); // end of the body

/** POST /v1/utterances: a committed reply with its selection statistics. */
const utteranceBody = z.object({ // request body
  question_id: z.string().min(1).max(64).nullable(), // the server question it answers, or null
  text: z.string().trim().min(1).max(UTTERANCE_MAX_CHARS), // the words
  clicks: z.number().int().min(0).max(1000), // presses
  duration_ms: z.number().int().min(0).max(86_400_000), // at most a day
}); // end of the body

/** The HTTP server with all routes and the WebSocket upgrade; the caller decides where it listens. */
export function createServer(o: HttpOptions): Server { // build, do not listen
  const tokenHash = sha256(o.token); // compared in constant time
  const authorized = (header: string | undefined) => timingSafeEqual(sha256(header?.startsWith('Bearer ') ? header.slice(7) : ''), tokenHash); // bearer check
  const app = express(); // the REST app
  app.disable('x-powered-by'); // do not advertise the framework

  app.get('/healthz', (_req, res) => { res.json({ status: 'ok' }); }); // liveness, no token, no data

  app.use((req, res, next) => { // one span per request (plan §4.3 observability), except the trace stream itself
    if (req.path === '/v1/trace') return next(); // an SSE stream never finishes
    const started = performance.now(); // request start
    res.on('finish', () => o.trace.span({ hop: 'client→server', operation: `${req.method} ${req.route?.path ?? '(unmatched)'}`, duration_ms: Math.round(performance.now() - started), mode: o.mode })); // route pattern, never ids or text
    next(); // carry on
  }); // end of the span middleware

  app.use((req, res, next) => { // the device token on every call below
    if (authorized(req.get('authorization'))) return next(); // allowed
    res.set('WWW-Authenticate', 'Bearer'); // RFC 6750
    problem(res, 401, 'missing or wrong device token'); // refused
  }); // end of authentication

  app.use(express.json({ limit: '32kb' })); // plan §6.2: 32 KB JSON limit; parsed only after authentication

  app.post('/v1/questions', (req, res) => { // ask a question (dev endpoint)
    const body = questionBody.safeParse(req.body); // validate
    if (!body.success) return problem(res, 400, issues(body.error)); // refuse
    const { question } = o.useCases.askQuestion(body.data.text, body.data.asked_by); // pushes it with the defaults
    res.status(201).json(question); // the model's candidates follow on the stream
  }); // end of POST /v1/questions

  app.post('/v1/utterances', async (req, res) => { // commit a reply
    const key = req.get('idempotency-key'); // retries reuse it
    if (!key || key.length > 128) return problem(res, 400, 'Idempotency-Key header required (1 to 128 characters)'); // refuse
    const body = utteranceBody.safeParse(req.body); // validate
    if (!body.success) return problem(res, 400, issues(body.error)); // refuse
    const { utterance, created, hasAudio } = await o.useCases.commitUtterance(key, body.data); // store, answer, speak
    res.status(created ? 201 : 200).json({ ...utterance, audio_url: hasAudio ? `/v1/utterances/${utterance.id}/audio` : null }); // a replay is 200
  }); // end of POST /v1/utterances

  app.get('/v1/utterances/:id/audio', (req, res) => { // the speech
    const audio = o.useCases.utteranceAudio(req.params.id); // MP3 bytes, if any
    if (!audio) return problem(res, 404, 'no audio for this utterance'); // mock mode, failed synthesis or unknown id
    res.type('audio/mpeg').send(Buffer.from(audio)); // the MP3
  }); // end of GET /v1/utterances/{id}/audio

  app.get('/v1/trace', (_req, res) => { // live spans (plan Table 13)
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); // SSE
    res.flushHeaders(); // send the headers now: Node holds them back until the first write, and there may be no span yet
    const send = (span: Span) => { res.write(`data: ${JSON.stringify(span)}\n\n`); }; // one event per span
    o.trace.recent().forEach(send); // the buffered spans first
    res.on('close', o.trace.subscribe(send)); // then live ones, until the client goes
  }); // end of GET /v1/trace

  app.use((_req, res) => { problem(res, 404); }); // no such route

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { // errors, as problem+json
    if (error instanceof NotFoundError) return problem(res, 404, error.message); // an unknown question id
    const status = (error as { status?: unknown } | null)?.status; // set by the JSON parser: 400 malformed, 413 too large
    if (typeof status === 'number' && status >= 400 && status < 500) return problem(res, status); // the client's fault
    o.log('http.error', { error: String(error) }); // ours
    problem(res, 500); // no details leak
  }); // end of the error handler

  const server = createHttpServer(app); // HTTP on top of the app
  server.on('upgrade', (req, socket, head) => { // GET /v1/stream (WebSocket)
    const path = new URL(req.url ?? '/', 'http://localhost').pathname; // the path, without a query
    if (path !== '/v1/stream') return refuse(socket, 404); // the only WebSocket route
    if (!authorized(req.headers.authorization)) return refuse(socket, 401); // the device token here too
    o.wss.handleUpgrade(req, socket, head, (ws) => { // accepted
      o.log('stream.connected', { clients: o.wss.clients.size }); // a TV connected
      ws.on('close', () => o.log('stream.closed', { clients: o.wss.clients.size })); // and left
    }); // end of the upgrade
  }); // end of the upgrade handler

  const ping = setInterval(() => o.notifier.publish({ type: 'ping', at: new Date().toISOString() }), o.pingMs); // keep-alive
  ping.unref(); // never keeps the process alive by itself
  server.on('close', () => clearInterval(ping)); // stop with the server
  return server; // not listening yet
} // end of createServer

/** RFC 9457 problem details. */
function problemBody(status: number, detail?: string): Record<string, unknown> { // the JSON
  return { type: 'about:blank', title: STATUS_CODES[status], status, ...(detail === undefined ? {} : { detail }) }; // title is the status text
} // end of problemBody

function problem(res: Response, status: number, detail?: string): void { // send problem+json
  res.status(status).type('application/problem+json').json(problemBody(status, detail)); // content type kept by res.json
} // end of problem

function refuse(socket: { end(data: string): void }, status: number): void { // reject a WebSocket upgrade
  const body = JSON.stringify(problemBody(status)); // problem+json here too
  socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nContent-Type: application/problem+json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`); // and close
} // end of refuse

function issues(error: z.ZodError): string { // validation errors as one line, without the submitted values
  return error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '); // "text: Too big: ..."
} // end of issues

function sha256(value: string): Buffer { // fixed-length digest, so timingSafeEqual can compare any two tokens
  return createHash('sha256').update(value).digest(); // 32 bytes
} // end of sha256
