// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Domain model of plan §4.3 (Table 14), cut to the S1 flow: questions, their reply candidates and utterances.

/** Reply intents of plan §4.6. */
export const INTENTS = ['yes', 'no', 'choice', 'later', 'clarify', 'social', 'need'] as const; // the model must pick one
export type Intent = (typeof INTENTS)[number]; // one of the above

export const REPLY_COUNT = 8; // at most this many candidates per question: the TV's 2 x 4 grid (plan §4.3, "8 candidates with priors")
export const CANDIDATE_MAX_CHARS = 60; // plan §4.6: each candidate at most 60 characters
export const QUESTION_MAX_CHARS = 200; // plan Table 16: ask_question text at most 200 characters
export const ASKED_BY_MAX_CHARS = 40; // plan Table 16: asked_by at most 40 characters
export const OPTIONS_MAX = 6; // plan Table 16: ask_question takes at most 6 options
export const OPTION_MAX_CHARS = 40; // plan Table 16: each option at most 40 characters
export const URGENCIES = ['normal', 'high'] as const; // plan Table 16: ask_question's urgency
export const UTTERANCE_MAX_CHARS = 200; // a committed reply; candidates are shorter, the cap leaves room for spelled text later

/** One reply option shown on the TV. */
export interface Candidate { // plan Table 14, without the question id (candidates live inside their question)
  text: string; // what Sam would say
  intent: Intent; // what kind of reply it is
  score: number; // the model's (or the default's) score in [0, 1]
  prior: number; // the engine prior computed from the scores; a question's priors sum to 1
  source: 'llm' | 'default' | 'option'; // where it came from: the model, the defaults, or ask_question's options
} // end of Candidate

/** A question put to Sam. */
export interface Question { // plan Table 14, without household (one household for now) and options (they become the candidates)
  id: string; // random identifier
  text: string; // the question
  asked_by: string; // who asked, shown as "<asked_by> asks"
  urgency: (typeof URGENCIES)[number]; // as ask_question set it; normal from the dev endpoint
  status: 'pending' | 'answered' | 'expired'; // answered once an utterance names it; expired when a newer question is asked first
  created_at: string; // ISO 8601 UTC
  answered_utterance_id: string | null; // the utterance that answered it
  candidates: Candidate[]; // the replies on the TV (at most eight), best guess first but the fallbacks last and the basic answers in the first four (toCandidates)
} // end of Question

/** Something Sam said. */
export interface Utterance { // plan Table 14, without household and undo (P1)
  id: string; // random identifier
  text: string; // the words
  kind: 'reply' | 'spontaneous'; // a reply names its question; anything else is spontaneous
  question_id: string | null; // the question it answers, if any
  question_text: string | null; // that question as text: the server question's, or the fixture question's the TV sent
  clicks: number; // switch presses that made the selection
  duration_ms: number; // from the question appearing to the commit
  created_at: string; // ISO 8601 UTC
} // end of Utterance

/** Events on GET /v1/stream (plan Table 13), cut to what S1 needs. */
export type StreamEvent = // one JSON message on the WebSocket
  | { type: 'question.created'; question: Question } // a new question with the defaults that fit it, or with its options
  | { type: 'question.candidates'; question_id: string; candidates: Candidate[] } // the model's candidates when ready, or the options' list at once
  | { type: 'ping'; at: string }; // keep-alive

/** One hop of the loop, for the studio's trace (plan Table 14). No message text, ever. */
export interface Span { // a TraceSpan
  id: string; // random identifier
  at: string; // ISO 8601 UTC, when the span ended
  hop: string; // which edge, e.g. "client→server" or "server→llm"
  operation: string; // what ran, e.g. "POST /v1/questions" or "suggest"
  duration_ms: number; // how long it took
  mode: 'mock' | 'live'; // which adapter served it
  dropped?: number; // candidates dropped by the banned-term filter; a count, never the text
} // end of Span
