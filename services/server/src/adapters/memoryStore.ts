// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MemoryStore (plan §4.3): the store port in process memory. SQLite is cut for now; nothing survives a restart.

import type { Question, Utterance } from '../domain/model.ts'; // the model
import type { StorePort } from '../ports/index.ts'; // the port

/** Questions, utterances, idempotency keys and audio, in maps. */
export class MemoryStore implements StorePort { // in-memory repository
  private readonly questions = new Map<string, Question>(); // by id, in insertion (time) order
  private readonly utterances = new Map<string, Utterance>(); // by id, in insertion (time) order
  private readonly keys = new Map<string, string>(); // idempotency key to utterance id
  private readonly audio = new Map<string, Uint8Array>(); // utterance id to MP3

  saveQuestion(question: Question): void { // insert or replace
    this.questions.set(question.id, question); // a replace keeps the original insertion position
  } // end of saveQuestion

  getQuestion(id: string): Question | undefined { // by id
    return this.questions.get(id); // or undefined
  } // end of getQuestion

  addUtterance(utterance: Utterance, idempotencyKey: string, audio: Uint8Array | null): void { // a commit
    this.utterances.set(utterance.id, utterance); // the record
    this.keys.set(idempotencyKey, utterance.id); // so a retry finds it
    if (audio) this.audio.set(utterance.id, audio); // its speech, if any
  } // end of addUtterance

  utteranceByKey(idempotencyKey: string): Utterance | undefined { // an earlier commit with this key
    const id = this.keys.get(idempotencyKey); // its utterance id
    return id === undefined ? undefined : this.utterances.get(id); // the record
  } // end of utteranceByKey

  getAudio(utteranceId: string): Uint8Array | undefined { // the MP3
    return this.audio.get(utteranceId); // or undefined
  } // end of getAudio

  recentTurns(limit: number): { speaker: string; text: string; at: string }[] { // the conversation so far
    const asked = [...this.questions.values()].map((q) => ({ speaker: q.asked_by, text: q.text, at: q.created_at })); // questions
    const said = [...this.utterances.values()].map((u) => ({ speaker: 'User', text: u.text, at: u.created_at })); // replies
    return [...asked, ...said].sort((a, b) => a.at.localeCompare(b.at)).slice(-limit); // oldest first, the last `limit`
  } // end of recentTurns
} // end of MemoryStore
