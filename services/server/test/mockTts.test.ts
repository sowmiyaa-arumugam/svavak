// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MockTts: a short WAV tone made in code, so the TV's playback path runs without AWS.

import { expect, it } from 'vitest'; // test API
import { MockTts } from '../src/adapters/mockTts.ts'; // tested

it('returns a 250 ms, 880 Hz, 16 kHz mono 16-bit PCM WAV tone that fades in and out', async () => { // the tone
  const wav = await new MockTts().synthesize('Tea, please'); // any text
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength); // little-endian reads
  const tag = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4)); // a four-letter chunk id
  expect(wav.length).toBe(8044); // a 44-byte header and 4000 16-bit samples
  expect([tag(0), view.getUint32(4, true), tag(8)]).toEqual(['RIFF', 8036, 'WAVE']); // the RIFF chunk and its size
  expect([tag(12), view.getUint32(16, true), view.getUint16(20, true), view.getUint16(22, true)]).toEqual(['fmt ', 16, 1, 1]); // PCM (format 1), mono
  expect([view.getUint32(24, true), view.getUint32(28, true), view.getUint16(32, true), view.getUint16(34, true)]).toEqual([16000, 32000, 2, 16]); // rate, byte rate, block align, bits
  expect([tag(36), view.getUint32(40, true)]).toEqual(['data', 8000]); // the data chunk and its size
  const samples = Array.from({ length: 4000 }, (_, i) => Math.abs(view.getInt16(44 + i * 2, true))); // sample magnitudes
  const peak = Math.max(...samples); // the loudest sample
  expect(peak).toBeGreaterThan(0); // not silence
  expect([samples[0], samples[3999]]).toEqual([0, 0]); // starts and ends at zero, so it does not click
  expect(Math.max(...samples.slice(0, 16))).toBeLessThan(peak * 0.15); // the first millisecond is faint: a fade in
  expect(Math.max(...samples.slice(-16))).toBeLessThan(peak * 0.15); // the last millisecond is faint: a fade out
  expect(await new MockTts().synthesize('Something else')).toEqual(wav); // the same tone for every text
}); // end of the case
