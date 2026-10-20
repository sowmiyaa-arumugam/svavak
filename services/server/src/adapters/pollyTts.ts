// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// PollyTts (plan §4.3 speech pipeline): MP3 from Amazon Polly (neural, or standard where a region has no neural voices), cached in memory by a hash of voice and text.

import { createHash } from 'node:crypto'; // SHA-256 cache keys
import { SynthesizeSpeechCommand, type PollyClient, type VoiceId } from '@aws-sdk/client-polly'; // Polly
import type { TtsPort } from '../ports/index.ts'; // the port

/** The live speech adapter. */
export class PollyTts implements TtsPort { // live speech adapter
  private readonly client: PollyClient; // configured with Polly's region and the SSO profile in compose.ts
  private readonly voice: string; // a voice available in that region for the engine, from SAY_WHEN_VOICE
  private readonly engine: 'neural' | 'standard'; // SAY_WHEN_POLLY_ENGINE
  private readonly cache = new Map<string, Uint8Array>(); // SHA-256 of voice and text to MP3

  constructor(client: PollyClient, voice: string, engine: 'neural' | 'standard') { // a client, a voice and an engine
    this.client = client; // keep the client
    this.voice = voice; // keep the voice
    this.engine = engine; // keep the engine
  } // end of constructor

  /** MP3 bytes for the text; a repeated phrase comes from the cache without calling Polly. */
  async synthesize(text: string): Promise<Uint8Array> { // one phrase
    const key = createHash('sha256').update(`${this.voice}\n${text}`).digest('hex'); // the cache key
    const cached = this.cache.get(key); // said before?
    if (cached) return cached; // no Polly call
    const response = await this.client.send(new SynthesizeSpeechCommand({ // the Polly request
      Engine: this.engine, // named, so neither engine depends on Polly's default (standard)
      OutputFormat: 'mp3', // audio/mpeg, which Expo's audio module plays
      Text: text, // plain text, no SSML
      VoiceId: this.voice as VoiceId, // checked by Polly; a wrong name fails the call and the reply goes without audio
    })); // sample rate left at the engine's default (24 kHz neural, 22.05 kHz standard)
    if (!response.AudioStream) throw new Error('Polly returned no audio stream'); // treated as a synthesis failure
    const audio = await response.AudioStream.transformToByteArray(); // the whole MP3
    this.cache.set(key, audio); // for the next time
    return audio; // the bytes
  } // end of synthesize
} // end of PollyTts
