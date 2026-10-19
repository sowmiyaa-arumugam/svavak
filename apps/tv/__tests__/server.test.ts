// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// POST /v1/utterances from the TV (plan §4.2): request shape, idempotent retry, and the audio URL.

import { postUtterance, serverFrom } from '../src/server'; // tested

const SERVER = { url: 'http://10.0.2.2:8787', token: 'test-token' }; // the emulator's host
const REPLY = { questionId: 'q1', text: 'Tea, please', clicks: 2, durationMs: 3100 }; // a reply that stood

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
    expect(JSON.parse(init.body as string)).toEqual({ question_id: 'q1', text: 'Tea, please', clicks: 2, duration_ms: 3100 }); // wire format
    expect(init.signal).toBeDefined(); // the 4 s timeout
  }); // end of the case

  it('returns null when the server made no audio (mock mode)', async () => { // no speech
    const fetchFn = jest.fn(async () => response(201, { id: 'u1', audio_url: null })); // mock mode
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
