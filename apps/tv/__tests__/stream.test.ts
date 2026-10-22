// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The stream client: event parsing, back-off and reconnects, with a fake socket and fake timers.

import { backoffMs, parseEvent, StreamClient, type SocketLike, type StreamEvent } from '../src/stream'; // tested

const candidate = (text: string, prior: number) => ({ text, intent: 'yes', score: prior, prior, source: 'default' }); // a wire candidate
const EIGHT = Array.from({ length: 8 }, (_, i) => candidate(`Reply ${i}`, (8 - i) / 36)); // eight, best first
const QUESTION = { id: 'q1', text: 'Tea?', asked_by: 'Alex', status: 'pending', created_at: '2026-10-19T10:00:00.000Z', answered_utterance_id: null, candidates: EIGHT }; // a wire question
const SCREEN = { id: 'q1', speaker: 'Alex', text: 'Tea?', replies: EIGHT.map((c) => c.text), scores: EIGHT.map((c) => c.prior), slots: 8 }; // as the screen needs it

describe('parseEvent', () => { // server JSON to screen events
  it('turns question.created into a question with its replies and priors', () => { // new question
    expect(parseEvent(JSON.stringify({ type: 'question.created', question: QUESTION }))).toEqual({ type: 'question.created', question: SCREEN }); // mapped
  }); // end of the case

  it("gives a question asked without options eight slots, for the model's replies to fill, and one asked with options its own size", () => { // no jump in the grid
    const four = [candidate('You decide', 0.278), candidate('Not sure', 0.333), candidate('Tell me more', 0.222), candidate('Not now', 0.167)]; // the defaults of an open question, as the server sends them: the fallbacks after You decide
    const open = parseEvent(JSON.stringify({ type: 'question.created', question: { ...QUESTION, text: 'What shall we watch?', candidates: four } })); // asked without options
    expect(open?.type === 'question.created' && open.question.slots).toBe(8); // four defaults, four empty slots
    const options = [{ ...candidate('Tea', 0.37), source: 'option' }, { ...candidate('Coffee', 0.37), source: 'option' }, candidate('Not now', 0.14), candidate('Not sure', 0.12)]; // ask_question's options and two defaults
    const asked = parseEvent(JSON.stringify({ type: 'question.created', question: { ...QUESTION, candidates: options } })); // asked with options
    expect(asked?.type === 'question.created' && asked.question.slots).toBe(4); // final already: no empty slot
  }); // end of the case

  it("carries the path of the question's spoken announcement when it has one, and nothing when it has none (B9)", () => { // what the TV plays
    const announced = parseEvent(JSON.stringify({ type: 'question.created', question: { ...QUESTION, announcement_url: '/v1/questions/q1/announcement' } })); // with an announcement
    expect(announced).toEqual({ type: 'question.created', question: { ...SCREEN, announcement: '/v1/questions/q1/announcement' } }); // its path, for the player
    const silent = parseEvent(JSON.stringify({ type: 'question.created', question: { ...QUESTION, announcement_url: null } })); // the voice failed, or the cap was used up
    expect(silent).toEqual({ type: 'question.created', question: SCREEN }); // nothing to play
    expect(silent?.type === 'question.created' && 'announcement' in silent.question).toBe(false); // not even an empty field
  }); // end of the case

  it('turns question.candidates into replies and priors for a question id', () => { // model replies
    expect(parseEvent(JSON.stringify({ type: 'question.candidates', question_id: 'q1', candidates: EIGHT }))).toEqual({ type: 'question.candidates', questionId: 'q1', replies: SCREEN.replies, scores: SCREEN.scores }); // mapped
  }); // end of the case

  it('takes fewer than eight replies, as for a question asked with options', () => { // Tea, Coffee, Not now, Not sure
    const four = EIGHT.slice(0, 4); // four candidates
    expect(parseEvent(JSON.stringify({ type: 'question.candidates', question_id: 'q1', candidates: four }))).toEqual({ type: 'question.candidates', questionId: 'q1', replies: four.map((c) => c.text), scores: four.map((c) => c.prior) }); // mapped
  }); // end of the case

  it('drops pings, unknown types, malformed JSON and lists that are empty or do not fit the grid', () => { // ignored input
    expect(parseEvent('{"type":"ping","at":"2026-10-19T10:00:00.000Z"}')).toBeNull(); // keep-alive
    expect(parseEvent('{"type":"question.cancelled","question_id":"q1"}')).toBeNull(); // not handled yet
    expect(parseEvent('not json')).toBeNull(); // malformed
    expect(parseEvent(JSON.stringify({ type: 'question.created', question: { ...QUESTION, candidates: [] } }))).toBeNull(); // none
    expect(parseEvent(JSON.stringify({ type: 'question.created', question: { ...QUESTION, candidates: [...EIGHT, candidate('Nine', 0.01)] } }))).toBeNull(); // nine
    expect(parseEvent(JSON.stringify({ type: 'question.created', question: { ...QUESTION, asked_by: 7 } }))).toBeNull(); // wrong type
    expect(parseEvent(JSON.stringify({ type: 'question.candidates', candidates: EIGHT }))).toBeNull(); // no question id
    expect(parseEvent(JSON.stringify({ type: 'question.candidates', question_id: 'q1', candidates: [...EIGHT.slice(1), { text: 'x' }] }))).toBeNull(); // no prior
  }); // end of the case
}); // end of parseEvent

describe('backoffMs', () => { // 0.5 to 8 s, jittered
  it('starts between 0.5 and 1 s, doubles its ceiling, and never exceeds 8 s', () => { // bounds
    expect([backoffMs(0, 0), backoffMs(0, 0.999)]).toEqual([500, expect.closeTo(999.5, 6)]); // first retry
    expect([1, 2, 3].map((a) => backoffMs(a, 0))).toEqual([1000, 2000, 4000]); // ceilings 2, 4, 8 s
    expect(backoffMs(3, 1)).toBe(8000); // the cap
    expect(backoffMs(20, 0.999)).toBeLessThan(8000); // still capped much later
  }); // end of the case
}); // end of backoffMs

/** A socket the test drives by calling its handlers. */
class FakeSocket implements SocketLike { // records how it was opened and closed
  onopen: (() => void) | null = null; // set by the client
  onmessage: ((message: { data: unknown }) => void) | null = null; // set by the client
  onclose: (() => void) | null = null; // set by the client
  closed = false; // close() called?
  readonly url: string; // where it dialled
  readonly headers: Record<string, string>; // with which headers

  constructor(url: string, headers: Record<string, string>) { // as the factory receives them
    this.url = url; // keep the URL
    this.headers = headers; // keep the headers
  } // end of constructor

  close(): void { // the client hangs up
    this.closed = true; // remember it
  } // end of close
} // end of FakeSocket

describe('StreamClient', () => { // connection handling
  let sockets: FakeSocket[]; // every socket opened
  let events: StreamEvent[]; // every event handed over
  let client: StreamClient; // under test

  beforeEach(() => { // a fresh client with jitter fixed at 0
    jest.useFakeTimers(); // control the back-off
    sockets = []; // none yet
    events = []; // none yet
    const connect = (url: string, headers: Record<string, string>) => { const s = new FakeSocket(url, headers); sockets.push(s); return s; }; // fake factory
    client = new StreamClient('http://10.0.2.2:8787', 'test-token', (e) => events.push(e), connect, () => 0); // shortest delays
  }); // end of set-up

  afterEach(() => { // tidy up
    client.stop(); // no timers left
    jest.useRealTimers(); // back to real timers
  }); // end of tidy-up

  it('dials the stream with the device token in a header and hands over parsed events only', () => { // happy path
    client.start(); // connect
    expect(sockets.map((s) => [s.url, s.headers])).toEqual([['ws://10.0.2.2:8787/v1/stream', { Authorization: 'Bearer test-token' }]]); // never in the URL
    sockets[0]!.onopen!(); // connected
    sockets[0]!.onmessage!({ data: JSON.stringify({ type: 'question.created', question: QUESTION }) }); // a question
    sockets[0]!.onmessage!({ data: '{"type":"ping","at":"2026-10-19T10:00:00.000Z"}' }); // a ping
    expect(events).toEqual([{ type: 'connected' }, { type: 'question.created', question: SCREEN }]); // the connection, then only the question
  }); // end of the case

  it('reports connected when a socket opens, and disconnected when it closes or an attempt fails', () => { // connection state
    client.start(); // first attempt
    sockets[0]!.onopen!(); // connected
    expect(events).toEqual([{ type: 'connected' }]); // reported
    sockets[0]!.onclose!(); // dropped
    expect(events).toEqual([{ type: 'connected' }, { type: 'disconnected' }]); // reported
    jest.advanceTimersByTime(500); // the first retry
    sockets[1]!.onclose!(); // refused: a failed attempt
    expect(events).toEqual([{ type: 'connected' }, { type: 'disconnected' }, { type: 'disconnected' }]); // reported again
    jest.advanceTimersByTime(1000); // the second retry
    sockets[2]!.onopen!(); // connected again
    expect(events.map((e) => e.type)).toEqual(['connected', 'disconnected', 'disconnected', 'connected']); // reported
  }); // end of the case

  it('reports nothing after stop(), even from a socket that opens or closes late', () => { // unmount
    client.start(); // connect
    client.stop(); // the screen goes away before the socket opens
    sockets[0]!.onopen!(); // it opens all the same
    sockets[0]!.onclose!(); // and closes
    expect(events).toEqual([]); // nothing reported
  }); // end of the case

  it('retries with growing delays while the server is unreachable, and starts over after a good connection', () => { // back-off
    client.start(); // first attempt
    sockets[0]!.onclose!(); // refused
    jest.advanceTimersByTime(499); // just under 0.5 s
    expect(sockets).toHaveLength(1); // still waiting
    jest.advanceTimersByTime(1); // 0.5 s
    expect(sockets).toHaveLength(2); // second attempt
    sockets[1]!.onclose!(); // refused again
    jest.advanceTimersByTime(999); // just under 1 s
    expect(sockets).toHaveLength(2); // still waiting
    jest.advanceTimersByTime(1); // 1 s
    expect(sockets).toHaveLength(3); // third attempt
    sockets[2]!.onopen!(); // connected
    sockets[2]!.onclose!(); // then dropped
    jest.advanceTimersByTime(500); // 0.5 s again
    expect(sockets).toHaveLength(4); // reconnected at the shortest delay
  }); // end of the case

  it('hangs up and stops retrying on stop()', () => { // unmount
    client.start(); // connect
    client.stop(); // the screen goes away
    expect(sockets[0]!.closed).toBe(true); // hung up
    sockets[0]!.onclose!(); // the close event arrives
    jest.advanceTimersByTime(10_000); // a long time
    expect(sockets).toHaveLength(1); // no new attempt
  }); // end of the case
}); // end of StreamClient
