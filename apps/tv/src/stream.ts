// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The server's question stream (plan §4.2, Table 13): GET /v1/stream over WebSocket, reconnecting with back-off.

import { REPLY_COUNT } from './conversation'; // the grid takes exactly eight replies
import type { Question } from './questions'; // the screen's question shape

/** Stream events, in the screen's terms. Pings and anything unknown are dropped. */
export type StreamEvent = // what the screen acts on
  | { type: 'question.created'; question: Question } // a new question with the default replies
  | { type: 'question.candidates'; questionId: string; replies: string[]; scores: number[] }; // the model's replies

/** The part of a WebSocket the client uses. */
export interface SocketLike { // React Native's WebSocket, or a fake in tests
  onopen: (() => void) | null; // connected
  onmessage: ((message: { data: unknown }) => void) | null; // one event
  onclose: (() => void) | null; // closed or failed (React Native calls onclose after onerror)
  close(): void; // hang up
} // end of SocketLike

/** Opens a socket with request headers; React Native's WebSocket takes them as its third argument. */
export type Connect = (url: string, headers: Record<string, string>) => SocketLike; // a socket factory

/** React Native's WebSocket constructor (Libraries/WebSocket/WebSocket.js); the DOM typing Expo's tsconfig also loads lacks the options. */
type NativeWebSocket = new (url: string, protocols: null, options: { headers: Record<string, string> }) => SocketLike; // three arguments

const connectNative: Connect = (url, headers) => new (WebSocket as unknown as NativeWebSocket)(url, null, { headers }); // the device token as a header, never in the URL

/** Plan §4.2: exponential back-off from 0.5 s to 8 s, jittered (half to all of a doubling ceiling of 1, 2, 4, 8 s). */
export function backoffMs(attempt: number, random: number): number { // attempt 0, 1, 2 ... and a random number in [0, 1)
  const ceiling = Math.min(8000, 1000 * 2 ** attempt); // 1, 2, 4, 8, 8 ... s
  return ceiling / 2 + (random * ceiling) / 2; // equal jitter: 0.5-1 s first, at most 8 s
} // end of backoffMs

/** One message to an event, or null for pings, unknown types and anything malformed. */
export function parseEvent(data: string): StreamEvent | null { // the server's JSON to the screen's terms
  let message: { type?: unknown; question?: Record<string, unknown>; question_id?: unknown; candidates?: unknown }; // loose shape, checked below
  try { message = JSON.parse(data); } catch { return null; } // not JSON
  if (message?.type === 'question.created') { // a new question
    const q = message.question; // its fields
    const c = candidatesOf(q?.candidates); // its default replies
    if (typeof q?.id !== 'string' || typeof q.text !== 'string' || typeof q.asked_by !== 'string' || !c) return null; // malformed
    return { type: 'question.created', question: { id: q.id, speaker: q.asked_by, text: q.text, ...c } }; // for the screen
  } // end of question.created
  if (message?.type === 'question.candidates') { // the model's replies
    const c = candidatesOf(message.candidates); // the replies
    if (typeof message.question_id !== 'string' || !c) return null; // malformed
    return { type: 'question.candidates', questionId: message.question_id, ...c }; // for the screen
  } // end of question.candidates
  return null; // ping, or a type this app does not know
} // end of parseEvent

function candidatesOf(list: unknown): { replies: string[]; scores: number[] } | null { // eight candidates to replies and priors
  if (!Array.isArray(list) || list.length !== REPLY_COUNT) return null; // the grid needs exactly eight
  if (!list.every((c) => typeof c?.text === 'string' && typeof c?.prior === 'number')) return null; // each with text and prior
  return { replies: list.map((c) => c.text), scores: list.map((c) => c.prior) }; // best guess first, as sent
} // end of candidatesOf

/** Keeps one connection to the stream open and hands each event to `onEvent`. */
export class StreamClient { // one per screen
  private readonly url: string; // ws://host:port/v1/stream
  private readonly headers: Record<string, string>; // the device token
  private readonly onEvent: (event: StreamEvent) => void; // the screen's handler
  private readonly connect: Connect; // socket factory
  private readonly random: () => number; // jitter source
  private socket: SocketLike | null = null; // the current connection
  private timer: ReturnType<typeof setTimeout> | undefined; // the pending reconnect
  private attempt = 0; // failed attempts since the last successful open
  private stopped = true; // no reconnects until started

  constructor(serverUrl: string, token: string, onEvent: (event: StreamEvent) => void, connect: Connect = connectNative, random: () => number = Math.random) { // where, who, what to call
    this.url = `${serverUrl.replace(/^http/, 'ws')}/v1/stream`; // http://... to ws://...
    this.headers = { Authorization: `Bearer ${token}` }; // on the upgrade request
    this.onEvent = onEvent; // keep the handler
    this.connect = connect; // keep the factory
    this.random = random; // keep the jitter source
  } // end of constructor

  /** Connects, and reconnects with back-off whenever the connection closes or fails. */
  start(): void { // the screen mounted
    this.stopped = false; // reconnects allowed
    this.open(); // first attempt now
  } // end of start

  /** Hangs up and stops reconnecting. */
  stop(): void { // the screen unmounts
    this.stopped = true; // no more reconnects
    clearTimeout(this.timer); // a pending one is cancelled
    this.socket?.close(); // hang up
    this.socket = null; // gone
  } // end of stop

  private open(): void { // one connection attempt
    const socket = this.connect(this.url, this.headers); // dial
    this.socket = socket; // the current connection
    socket.onopen = () => { this.attempt = 0; }; // connected: the next failure starts the back-off from 0.5 s again
    socket.onmessage = (message) => { // an event
      const event = typeof message.data === 'string' ? parseEvent(message.data) : null; // parse
      if (event) this.onEvent(event); // hand it over
    }; // end of onmessage
    socket.onclose = () => { // closed, refused or unreachable
      if (this.stopped || this.socket !== socket) return; // stopped on purpose, or an old socket
      this.socket = null; // no connection now
      this.timer = setTimeout(() => this.open(), backoffMs(this.attempt++, this.random())); // try again later
    }; // end of onclose
  } // end of open
} // end of StreamClient
