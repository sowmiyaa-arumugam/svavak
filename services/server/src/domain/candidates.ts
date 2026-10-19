// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Reply candidates (plan §4.3 reply pipeline, §4.6 post-processing): defaults, validation, merge and priors.

import { priors } from 'switchclock'; // the engine's prior formula, so server and TV agree on it
import { z } from 'zod'; // schema validation of the model's output
import { CANDIDATE_MAX_CHARS, INTENTS, REPLY_COUNT, type Candidate, type Intent } from './model.ts'; // the model

/** A candidate before merging: what the model (or a default) proposes. */
export interface Draft { // one proposed reply
  text: string; // the words
  intent: Intent; // kind of reply
  score: number; // in [0, 1]
} // end of Draft

/** Shown the instant a question arrives (FR-02: Yes, No and Not now at once), and used to fill the model's list to 8. */
export const DEFAULT_REPLIES: readonly Draft[] = [ // design values, best guess first
  { text: 'Yes, please', intent: 'yes', score: 0.3 }, // yes
  { text: 'No, thanks', intent: 'no', score: 0.25 }, // no
  { text: 'Not now', intent: 'later', score: 0.12 }, // later
  { text: "I'm not sure", intent: 'clarify', score: 0.1 }, // plan §4.6: always one "not sure"
  { text: 'Ask me later', intent: 'later', score: 0.08 }, // and one "ask me later"
  { text: 'Tell me more', intent: 'clarify', score: 0.06 }, // ask for detail
  { text: 'Thank you', intent: 'social', score: 0.05 }, // politeness
  { text: 'Maybe', intent: 'clarify', score: 0.04 }, // undecided
]; // end of DEFAULT_REPLIES

/** The engine's scan defaults for priors; the TV adds the controls' shares itself. */
const PRIOR_CONFIG = { priorFloor: 0.02, temperature: 1, controlShare: 0 }; // s_floor, tau, no controls here

const outputSchema = z.object({ candidates: z.array(z.unknown()) }); // the tool call's top level (plan §4.6)
const draftSchema = z.object({ text: z.string(), intent: z.enum(INTENTS), score: z.number().min(0).max(1) }); // one candidate

/**
 * Plan §4.6 post-processing of the model's raw output: schema validation (an invalid candidate is dropped, not the
 * whole list), whitespace trimming, a 60-character cap and case-insensitive de-duplication that keeps the best score.
 * Returns the surviving drafts, best score first; an empty list when nothing is usable.
 */
export function cleanDrafts(raw: unknown): Draft[] { // raw tool input to clean drafts
  const output = outputSchema.safeParse(raw); // the envelope must be right
  if (!output.success) return []; // nothing usable
  const valid: Draft[] = []; // candidates that pass the schema, trimmed
  for (const item of output.data.candidates) { // each proposed candidate
    const parsed = draftSchema.safeParse(item); // its shape
    if (!parsed.success) continue; // dropped: wrong shape, unknown intent or score out of range
    const text = parsed.data.text.replace(/\s+/g, ' ').trim(); // one space between words, none at the ends
    if (text !== '' && text.length <= CANDIDATE_MAX_CHARS) valid.push({ ...parsed.data, text }); // within the cap
  } // end of the candidates
  valid.sort((a, b) => b.score - a.score); // best first (stable), so de-duplication keeps the best of each
  const seen = new Set<string>(); // lower-cased texts already kept
  return valid.filter((d) => !seen.has(d.text.toLowerCase()) && seen.add(d.text.toLowerCase())); // first of each text
} // end of cleanDrafts

/**
 * Plan §4.3 step 4: the model's drafts (up to 8) filled up with defaults they do not already contain, then all eight
 * ordered best guess first, with priors from the scores.
 */
export function toCandidates(model: readonly Draft[]): Candidate[] { // drafts to the eight candidates
  const picked: Omit<Candidate, 'prior'>[] = model.slice(0, REPLY_COUNT).map((d) => ({ ...d, source: 'llm' })); // the model's best eight
  const seen = new Set(picked.map((c) => c.text.toLowerCase())); // texts already present
  for (const d of DEFAULT_REPLIES) { // fill up from the defaults, in their order
    if (picked.length === REPLY_COUNT) break; // full
    if (!seen.has(d.text.toLowerCase())) picked.push({ ...d, source: 'default' }); // not a duplicate
  } // end of the fill
  picked.sort((a, b) => b.score - a.score); // best guess first, as the TV scans them
  const p = priors(picked.map((c, i) => ({ id: String(i), score: c.score })), PRIOR_CONFIG); // max(s, floor)^(1/tau), normalised
  return picked.map((c, i) => ({ ...c, prior: p[i]! })); // one prior per candidate
} // end of toCandidates

/** The eight default candidates, pushed with every new question. */
export function defaultCandidates(): Candidate[] { // no model output yet
  return toCandidates([]); // all defaults
} // end of defaultCandidates
