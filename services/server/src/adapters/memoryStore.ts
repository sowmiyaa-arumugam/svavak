// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MemoryStore (plan §4.3): the store port in process memory. SQLite is cut for now; nothing survives a restart.

import type { ProfileFact } from '../domain/facts.ts'; // profile facts
import type { Question, Utterance } from '../domain/model.ts'; // the model
import type { StorePort } from '../ports/index.ts'; // the port

/** Questions, utterances, idempotency keys, audio and profile facts, in maps. */
export class MemoryStore implements StorePort { // in-memory repository
  private readonly questions = new Map<string, Question>(); // by id, in insertion (time) order
  private readonly utterances = new Map<string, Utterance>(); // by id, in insertion (time) order
  private readonly keys = new Map<string, string>(); // idempotency key to utterance id
  private readonly audio = new Map<string, Uint8Array>(); // utterance id to audio bytes
  private readonly facts: Map<string, readonly ProfileFact[]>; // household to its facts

  constructor(facts: Record<string, readonly ProfileFact[]> = {}) { // the facts per household (no add or remove yet)
    this.facts = new Map(Object.entries(facts)); // keep them
  } // end of constructor

  saveQuestion(question: Question): void { // insert or replace
    this.questions.set(question.id, question); // a replace keeps the original insertion position
  } // end of saveQuestion

  getQuestion(id: string): Question | undefined { // by id
    return this.questions.get(id); // or undefined
  } // end of getQuestion

  newestPending(): Question | undefined { // the open question, if any
    return [...this.questions.values()].findLast((q) => q.status === 'pending'); // insertion order is creation order; a replace keeps its place
  } // end of newestPending

  addUtterance(utterance: Utterance, idempotencyKey: string, audio: Uint8Array | null): void { // a commit
    this.utterances.set(utterance.id, utterance); // the record
    this.keys.set(idempotencyKey, utterance.id); // so a retry finds it
    if (audio) this.audio.set(utterance.id, audio); // its speech, if any
  } // end of addUtterance

  utteranceByKey(idempotencyKey: string): Utterance | undefined { // an earlier commit with this key
    const id = this.keys.get(idempotencyKey); // its utterance id
    return id === undefined ? undefined : this.utterances.get(id); // the record
  } // end of utteranceByKey

  getAudio(utteranceId: string): Uint8Array | undefined { // the audio
    return this.audio.get(utteranceId); // or undefined
  } // end of getAudio

  recentTurns(limit: number): { question: string | null; reply: string }[] { // the conversation so far
    return [...this.utterances.values()].slice(-limit).map((u) => ({ question: u.question_text, reply: u.text })); // the last `limit` utterances, oldest first
  } // end of recentTurns

  profileFacts(household: string): ProfileFact[] { // the facts as stored
    return [...(this.facts.get(household) ?? [])]; // a copy; none for an unknown household
  } // end of profileFacts
} // end of MemoryStore
