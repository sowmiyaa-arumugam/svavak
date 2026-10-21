// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// POST /v1/utterances and POST /v1/alerts from the TV (plan §4.2): request shape, idempotent retry, and the audio URL.

import { postHelp, postUtterance, serverFrom } from '../src/server'; // tested

const SERVER = { url: 'http://10.0.2.2:8787', token: 'test-token' }; // the emulator's host
const REPLY = { questionId: 'q1', questionText: null, text: 'Tea, please', clicks: 2, durationMs: 3100 }; // a reply that stood

/** A minimal fetch response. */
function response(status: number, body: unknown = {}): Response { // what fetch resolves with
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response; // only what postUtterance reads
} // end of response

describe('serverFrom', () => { // the app config's extra.server
  it('needs both a URL and a non-empty token', () => { // otherwise the app stays offline
    expect(serverFrom(SERVER)).toEqual(SERVER); // both set
    expect(serverFrom({ url: SERVER.url, token: '' })).toBeNull(); // built without a token
    expect(serverFrom(undefined)).toBeNull(); // no entry at all
  }); // end of the case
}); // end of serverFrom

describe('postUtterance', () => { // the commit call
  it('posts the reply with the token and the idempotency key, and returns the absolute audio URL', async () => { // happy path
    const fetchFn = jest.fn(async () => response(201, { id: 'u1', audio_url: '/v1/utterances/u1/audio' })); // the server
    expect(await postUtterance(SERVER, REPLY, 'key-1', fetchFn as unknown as typeof fetch)).toBe('http://10.0.2.2:8787/v1/utterances/u1/audio'); // absolute
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]; // the request
    expect(url).toBe('http://10.0.2.2:8787/v1/utterances'); // the route
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', 'Idempotency-Key': 'key-1' } }); // headers
    expect(JSON.parse(init.body as string)).toEqual({ question_id: 'q1', question_text: null, text: 'Tea, please', clicks: 2, duration_ms: 3100 }); // wire format
    expect(init.signal).toBeDefined(); // the 4 s timeout
  }); // end of the case

  it("sends a fixture question's text with a reply to it", async () => { // the server has no record of a fixture question
    const fetchFn = jest.fn(async () => response(201, { id: 'u2', audio_url: null })); // the server
    await postUtterance(SERVER, { ...REPLY, questionId: null, questionText: 'Tea or coffee?' }, 'key-6', fetchFn as unknown as typeof fetch); // posted
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]; // the request
    expect(JSON.parse(init.body as string)).toMatchObject({ question_id: null, question_text: 'Tea or coffee?' }); // the text instead of an id
  }); // end of the case

  it('returns null when the server made no audio', async () => { // no speech
    const fetchFn = jest.fn(async () => response(201, { id: 'u1', audio_url: null })); // no audio
    expect(await postUtterance(SERVER, REPLY, 'key-1', fetchFn as unknown as typeof fetch)).toBeNull(); // nothing to play
  }); // end of the case

  it('retries once with the same key after a network error or a 5xx, but not after a 4xx', async () => { // retry policy
    const flaky = jest.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(response(200, { audio_url: null })); // fails, then works
    await postUtterance(SERVER, REPLY, 'key-2', flaky as unknown as typeof fetch); // succeeds on the retry
    const keys = flaky.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['Idempotency-Key']); // keys sent
    expect(keys).toEqual(['key-2', 'key-2']); // the same key twice
    const busy = jest.fn().mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(201, { audio_url: null })); // 503, then works
    await postUtterance(SERVER, REPLY, 'key-3', busy as unknown as typeof fetch); // succeeds on the retry
    expect(busy).toHaveBeenCalledTimes(2); // retried
    const refused = jest.fn(async () => response(400)); // a bad request
    await expect(postUtterance(SERVER, REPLY, 'key-4', refused as unknown as typeof fetch)).rejects.toThrow('400'); // no retry
    expect(refused).toHaveBeenCalledTimes(1); // once
    const down = jest.fn().mockRejectedValue(new TypeError('Network request failed')); // offline
    await expect(postUtterance(SERVER, REPLY, 'key-5', down as unknown as typeof fetch)).rejects.toThrow('Network request failed'); // gives up
    expect(down).toHaveBeenCalledTimes(2); // after one retry
  }); // end of the case
}); // end of postUtterance

describe('postHelp', () => { // the help request
  it('posts to /v1/alerts with the token and the idempotency key, and no body', async () => { // happy path
    const fetchFn = jest.fn(async () => response(201, { id: 'h1', created_at: '2026-10-21T10:00:00.000Z' })); // the server
    await expect(postHelp(SERVER, 'key-1', fetchFn as unknown as typeof fetch)).resolves.toBeUndefined(); // confirmed
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]; // the request
    expect(url).toBe('http://10.0.2.2:8787/v1/alerts'); // the route
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer test-token', 'Idempotency-Key': 'key-1' } }); // headers
    expect(init.body).toBeUndefined(); // a help request has no text
    expect(init.signal).toBeDefined(); // the 4 s timeout
  }); // end of the case

  it('retries once with the same key after a network error or a 5xx, and throws when refused or unreachable', async () => { // the same policy as replies
    const flaky = jest.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(response(200)); // fails, then the replay
    await postHelp(SERVER, 'key-2', flaky as unknown as typeof fetch); // confirmed on the retry
    expect(flaky.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['Idempotency-Key'])).toEqual(['key-2', 'key-2']); // one request to the server
    const refused = jest.fn(async () => response(401)); // a wrong token
    await expect(postHelp(SERVER, 'key-3', refused as unknown as typeof fetch)).rejects.toThrow('401'); // no retry
    expect(refused).toHaveBeenCalledTimes(1); // once
    const down = jest.fn().mockRejectedValue(new TypeError('Network request failed')); // offline: practice mode
    await expect(postHelp(SERVER, 'key-4', down as unknown as typeof fetch)).rejects.toThrow('Network request failed'); // the screen says it could not
    expect(down).toHaveBeenCalledTimes(2); // after one retry
  }); // end of the case
}); // end of postHelp
