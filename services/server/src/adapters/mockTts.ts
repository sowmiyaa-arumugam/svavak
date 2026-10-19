// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MockTts (plan §4.3): a short WAV tone made in code for every reply, so the TV's playback path runs without AWS.

import type { TtsPort } from '../ports/index.ts'; // the port

const RATE = 16_000; // samples per second
const SAMPLES = 4000; // 250 ms
const FADE = 160; // 10 ms of linear fade at each end, so the tone does not click
const HZ = 880; // the pitch (A5)
const AMPLITUDE = 8000; // about a quarter of 16-bit full scale, so it is not loud

/** A RIFF/WAVE file: PCM (format 1), mono, 16-bit, 16 kHz, an 880 Hz sine of 250 ms with a fade in and out. */
function tone(): Uint8Array { // built once, below
  const bytes = new Uint8Array(44 + SAMPLES * 2); // the 44-byte header, then the samples
  const view = new DataView(bytes.buffer); // little-endian writes
  const tag = (at: number, id: string) => { for (let i = 0; i < 4; i++) view.setUint8(at + i, id.charCodeAt(i)); }; // a four-letter chunk id
  tag(0, 'RIFF'); // the RIFF chunk
  view.setUint32(4, 36 + SAMPLES * 2, true); // its size: everything after these 8 bytes
  tag(8, 'WAVE'); // the form type
  tag(12, 'fmt '); // the format chunk
  view.setUint32(16, 16, true); // its size for PCM
  view.setUint16(20, 1, true); // format 1: PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, RATE, true); // sample rate
  view.setUint32(28, RATE * 2, true); // byte rate: rate x block align
  view.setUint16(32, 2, true); // block align: one 16-bit sample per frame
  view.setUint16(34, 16, true); // bits per sample
  tag(36, 'data'); // the data chunk
  view.setUint32(40, SAMPLES * 2, true); // its size in bytes
  for (let i = 0; i < SAMPLES; i++) { // each sample
    const fade = Math.min(1, i / FADE, (SAMPLES - 1 - i) / FADE); // 0 at both ends, 1 in the middle
    view.setInt16(44 + i * 2, Math.round(AMPLITUDE * fade * Math.sin((2 * Math.PI * HZ * i) / RATE)), true); // the sine, faded
  } // end of the samples
  return bytes; // the whole file
} // end of tone

const TONE = tone(); // built once at module load

/** Returns the same tone for every text: the TV plays it as it would play speech. */
export class MockTts implements TtsPort { // the mock speech adapter
  async synthesize(_text: string): Promise<Uint8Array> { // any text
    return TONE; // the WAV bytes
  } // end of synthesize
} // end of MockTts
