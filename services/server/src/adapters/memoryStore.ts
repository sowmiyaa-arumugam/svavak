// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MemoryStore: the store port in process memory. SQLite is cut for now; nothing survives a restart.

import type { ProfileFact } from '../domain/facts.ts'; // profile facts
import type { HelpRequest, Question, Utterance } from '../domain/model.ts'; // the model
import type { StorePort } from '../ports/index.ts'; // the port

/** Questions, utterances, help requests, idempotency keys, audio and profile facts, in maps. */
export class MemoryStore implements StorePort { // in-memory repository
  private readonly questions = new Map<string, Question>(); // by id, in insertion (time) order
  private readonly utterances = new Map<string, Utterance>(); // by id, in insertion (time) order
  private readonly keys = new Map<string, string>(); // idempotency key to utterance id
  private readonly audio = new Map<string, Uint8Array>(); // utterance id to audio bytes
  private readonly announcements = new Map<string, Uint8Array>(); // question id to its announcement's audio bytes
  private readonly helps = new Map<string, HelpRequest>(); // help requests by idempotency key, in insertion (time) order
  private readonly facts: Map<string, readonly ProfileFact[]>; // household to its facts

  constructor(facts: Record<string, readonly ProfileFact[]> = {}) { // the facts per household (no remove yet)
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

  getUtterance(id: string): Utterance | undefined { // by id
    return this.utterances.get(id); // or undefined
  } // end of getUtterance

  utteranceByKey(idempotencyKey: string): Utterance | undefined { // an earlier commit with this key
    const id = this.keys.get(idempotencyKey); // its utterance id
    return id === undefined ? undefined : this.utterances.get(id); // the record
  } // end of utteranceByKey

  getAudio(utteranceId: string): Uint8Array | undefined { // the audio
    return this.audio.get(utteranceId); // or undefined
  } // end of getAudio

  addAnnouncement(questionId: string, audio: Uint8Array): void { // a question's announcement
    this.announcements.set(questionId, audio); // kept with the question's id
  } // end of addAnnouncement

  getAnnouncement(questionId: string): Uint8Array | undefined { // the announcement's audio
    return this.announcements.get(questionId); // or undefined
  } // end of getAnnouncement

  recentTurns(limit: number): { question: string | null; reply: string }[] { // the conversation so far
    return [...this.utterances.values()].slice(-limit).map((u) => ({ question: u.question_text, reply: u.text })); // the last `limit` utterances, oldest first
  } // end of recentTurns

  recentUtterances(limit: number, since: string | null): Utterance[] { // what was said lately
    const after = since === null ? -Infinity : Date.parse(since); // compared as times, so any offset works
    return [...this.utterances.values()].filter((u) => Date.parse(u.created_at) > after).slice(-limit); // the last `limit` after it, oldest first
  } // end of recentUtterances

  addHelp(help: HelpRequest, idempotencyKey: string): void { // a help request
    this.helps.set(idempotencyKey, help); // so a retry finds it
  } // end of addHelp

  helpByKey(idempotencyKey: string): HelpRequest | undefined { // an earlier help request with this key
    return this.helps.get(idempotencyKey); // or undefined
  } // end of helpByKey

  recentHelp(limit: number, since: string | null): HelpRequest[] { // help requests lately
    const after = since === null ? -Infinity : Date.parse(since); // compared as times, as in recentUtterances
    return [...this.helps.values()].filter((h) => Date.parse(h.created_at) > after).slice(-limit); // the last `limit` after it, oldest first
  } // end of recentHelp

  profileFacts(household: string): ProfileFact[] { // the facts as stored
    return [...(this.facts.get(household) ?? [])]; // a copy; none for an unknown household
  } // end of profileFacts

  addProfileFact(household: string, fact: ProfileFact & { id: string }): void { // one more fact
    this.facts.set(household, [...(this.facts.get(household) ?? []), fact]); // appended; the stored lists are never mutated
  } // end of addProfileFact
} // end of MemoryStore
