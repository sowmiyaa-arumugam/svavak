// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Ports of plan §4.3 (Table 12), cut to the S1 flow. Interfaces only; adapters implement them.

import type { Question, Span, StreamEvent, Utterance } from '../domain/model.ts'; // the domain model

/** What the reply model sees (plan §4.6 inputs, without profile facts, which S1 does not store yet). */
export interface SuggestRequest { // input to LlmPort.suggest
  question: string; // the question text
  askedBy: string; // who asked
  recentTurns: { speaker: string; text: string }[]; // up to six earlier turns, oldest first
  localTime: string; // the server's local time of day, HH:MM
} // end of SuggestRequest

/** Reply candidates from a language model. Returns the raw tool input; the domain validates it. */
export interface LlmPort { // BedrockLlm or MockLlm
  suggest(request: SuggestRequest, signal: AbortSignal): Promise<unknown>; // aborted when the 3.5 s budget runs out
} // end of LlmPort

/** Speech synthesis. Returns MP3 bytes, or null when the adapter makes no audio (mock mode). */
export interface TtsPort { // PollyTts or MockTts
  synthesize(text: string): Promise<Uint8Array | null>; // the words to speak
} // end of TtsPort

/** Persistence (MemoryStore now; SQLite is cut for now). */
export interface StorePort { // repository port
  saveQuestion(question: Question): void; // insert or replace (records are immutable; changes save a new copy)
  getQuestion(id: string): Question | undefined; // by id
  addUtterance(utterance: Utterance, idempotencyKey: string, audio: Uint8Array | null): void; // a commit and its audio
  utteranceByKey(idempotencyKey: string): Utterance | undefined; // an earlier commit with the same key
  getAudio(utteranceId: string): Uint8Array | undefined; // the MP3 of an utterance, if it has one
  recentTurns(limit: number): { speaker: string; text: string; at: string }[]; // questions and utterances, oldest first
} // end of StorePort

/** Pushes events to connected TVs (WsNotifier). */
export interface NotifierPort { // fan-out
  publish(event: StreamEvent): void; // to every connected client
} // end of NotifierPort

/** Receives one span per hop (SseTraceSink). */
export interface TracePort { // the studio's trace
  span(span: Omit<Span, 'id' | 'at'>): void; // id and time are added by the sink
} // end of TracePort

/** Structured log line (JSON on stdout); never pass message text. */
export type Log = (msg: string, fields?: Record<string, unknown>) => void; // event name and fields
