// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Ports of plan §4.3 (Table 12), cut to the S1 flow. Interfaces only; adapters implement them.

import type { ProfileFact } from '../domain/facts.ts'; // profile facts
import type { HelpRequest, Question, Span, StreamEvent, Utterance } from '../domain/model.ts'; // the domain model

/** What the reply model sees (plan §4.6 inputs). */
export interface SuggestRequest { // input to LlmPort.suggest
  question: string; // the question text
  askedBy: string; // who asked
  recentTurns: { question: string | null; reply: string }[]; // up to six earlier turns, question then reply, oldest first
  localTime: string; // the server's local time of day, HH:MM
  facts: ProfileFact[]; // the household's facts as stored; each adapter applies promptFacts
} // end of SuggestRequest

/** Reply candidates from a language model. Returns the raw tool input; the domain validates it. */
export interface LlmPort { // BedrockLlm or MockLlm
  suggest(request: SuggestRequest, signal: AbortSignal): Promise<unknown>; // aborted when the 3.5 s budget runs out
} // end of LlmPort

/** Speech synthesis. Returns audio bytes (MP3 from Polly, WAV from the mock), or null. */
export interface TtsPort { // PollyTts or MockTts
  synthesize(text: string): Promise<Uint8Array | null>; // the words to speak
} // end of TtsPort

/** Persistence (MemoryStore now; SQLite is cut for now). */
export interface StorePort { // repository port
  saveQuestion(question: Question): void; // insert or replace (records are immutable; changes save a new copy)
  getQuestion(id: string): Question | undefined; // by id
  newestPending(): Question | undefined; // the most recently created question still pending
  addUtterance(utterance: Utterance, idempotencyKey: string, audio: Uint8Array | null): void; // a commit and its audio
  getUtterance(id: string): Utterance | undefined; // by id
  utteranceByKey(idempotencyKey: string): Utterance | undefined; // an earlier commit with the same key
  getAudio(utteranceId: string): Uint8Array | undefined; // the audio of an utterance, if it has one
  addAnnouncement(questionId: string, audio: Uint8Array): void; // a question's spoken announcement
  getAnnouncement(questionId: string): Uint8Array | undefined; // the announcement of a question, if it has one
  recentTurns(limit: number): { question: string | null; reply: string }[]; // the last `limit` utterances with their questions, oldest first
  recentUtterances(limit: number, since: string | null): Utterance[]; // the last `limit` utterances created after `since` (any ISO 8601 time), oldest first
  addHelp(help: HelpRequest, idempotencyKey: string): void; // a help request, under its key
  helpByKey(idempotencyKey: string): HelpRequest | undefined; // an earlier help request with the same key
  recentHelp(limit: number, since: string | null): HelpRequest[]; // the last `limit` help requests created after `since`, oldest first
  profileFacts(household: string): ProfileFact[]; // the household's facts as stored; [] for an unknown household
  addProfileFact(household: string, fact: ProfileFact & { id: string }): void; // appended to the household's facts
} // end of StorePort

/** Pushes events to connected TVs (WsNotifier). */
export interface NotifierPort { // fan-out
  publish(event: StreamEvent): number; // to every connected client; returns how many it went to
} // end of NotifierPort

/** Receives one span per hop (SseTraceSink). */
export interface TracePort { // the studio's trace
  span(span: Omit<Span, 'id' | 'at'>): void; // id and time are added by the sink
} // end of TracePort

/** Structured log line (JSON on stdout); never pass message text. */
export type Log = (msg: string, fields?: Record<string, unknown>) => void; // event name and fields
