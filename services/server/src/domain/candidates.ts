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

/**
 * Shown the instant a yes/no question arrives (FR-02: Yes, No and Not now at once), and used to fill the model's list
 * to 8. A choice or open question gets its own four instead (CHOICE_OR_OPEN, through defaultsFor).
 */
export const DEFAULT_REPLIES: readonly Draft[] = [ // design values, best guess first
  { text: 'Yes, please', intent: 'yes', score: 0.3 }, // yes
  { text: 'No, thanks', intent: 'no', score: 0.25 }, // no
  { text: 'Not now', intent: 'later', score: 0.12 }, // later
  { text: 'Not sure', intent: 'clarify', score: 0.1 }, // plan §4.6: always one "not sure"
  { text: 'Ask me later', intent: 'later', score: 0.08 }, // and one "ask me later"
  { text: 'Tell me more', intent: 'clarify', score: 0.06 }, // ask for detail
  { text: 'Thank you', intent: 'social', score: 0.05 }, // politeness
  { text: 'Maybe', intent: 'clarify', score: 0.04 }, // undecided
]; // end of DEFAULT_REPLIES

/** The defaults of a choice or open question, best guess first: no Yes or No, and still a "later" reply. */
const CHOICE_OR_OPEN: readonly Draft[] = [ // design values, scored so this order holds; shown with You decide first, ahead of the fallbacks (toCandidates)
  { text: 'Not sure', intent: 'clarify', score: 0.12 }, // undecided
  { text: 'You decide', intent: 'choice', score: 0.1 }, // hands the choice back
  { text: 'Tell me more', intent: 'clarify', score: 0.08 }, // ask for detail
  { text: 'Not now', intent: 'later', score: 0.06 }, // later
]; // end of CHOICE_OR_OPEN
const UNSURE_OR_LATER = DEFAULT_REPLIES.filter((d) => d.text === 'Not now' || d.text === 'Not sure'); // added to ask_question's options
const FALLBACKS: readonly Intent[] = ['later', 'clarify']; // "Not now", "Not sure", "I don't know yet": never ahead of a substantive reply (toCandidates)
export const OPTION_SCORE = 0.3; // each of ask_question's options is as likely as "Yes, please", the best default

const LEADING_NAME = /^\s*\p{L}[\p{L}'’-]*\s*,\s*/u; // "Sam, " before the question itself
const OR_NOT = /(?:^|\s)or\s+not[\s?.!]*$/i; // "... or not?" at the end; "Now, or not?" leaves "or not?" once the name is gone
const OR = /(?:^|\s)or\s/i; // " or " anywhere, or at the start once a leading word and comma are gone ("Tea, or coffee?")
const WH_WORD = /^(?:what|which|who|whom|whose|where|when|why|how)\b/i; // whole first word, so "Whatever" is not one

/**
 * The kind of answer a question wants, ignoring a leading name ("Sam, ..."): "... or not?" is yes/no, " or " makes a
 * choice, a question starting with a wh-word is open, a text with no "?" anywhere ("Tell me about your day.") is open
 * too, and everything else ("Tea?" too) is yes/no.
 */
export function questionKind(question: string): 'yesno' | 'choice' | 'open' { // the kind of answer it wants
  const q = question.replace(LEADING_NAME, ''); // without the name
  if (OR_NOT.test(q)) return 'yesno'; // "Would you like tea or not?"
  if (OR.test(q)) return 'choice'; // "Tea or coffee?", even after a wh-word
  if (WH_WORD.test(q)) return 'open'; // "What ...?"
  return q.includes('?') ? 'yesno' : 'open'; // "Tea?", or a sentence such as "Tell me about your day."
} // end of questionKind

/** The defaults that fit the question: all eight for a yes/no question, the four of CHOICE_OR_OPEN for any other. */
export function defaultsFor(question: string): readonly Draft[] { // Yes, No and Not now only where they make sense
  return questionKind(question) === 'yesno' ? DEFAULT_REPLIES : CHOICE_OR_OPEN; // by kind
} // end of defaultsFor

/** Plan §4.6 rule "no profanity": the one list of words a candidate may not contain. */
export const BANNED_TERMS: readonly string[] = ['bastard', 'bitch', 'bollocks', 'crap', 'damn', 'fuck', 'fucking', 'piss', 'shit', 'wanker']; // whole words, any case

/** The engine's scan defaults for priors; the TV adds the controls' shares itself. */
const PRIOR_CONFIG = { priorFloor: 0.02, temperature: 1, controlShare: 0 }; // s_floor, tau, no controls here

const outputSchema = z.object({ candidates: z.array(z.unknown()) }); // the tool call's top level (plan §4.6)
const draftSchema = z.object({ text: z.string(), intent: z.enum(INTENTS), score: z.number().min(0).max(1) }); // one candidate

/**
 * Plan §4.6 post-processing of the model's raw output: schema validation (an invalid candidate is dropped, not the
 * whole list), whitespace trimming, no closing full stop, a 60-character cap and case-insensitive de-duplication that
 * keeps the best score.
 * Returns the surviving drafts, best score first; an empty list when nothing is usable.
 */
export function cleanDrafts(raw: unknown): Draft[] { // raw tool input to clean drafts
  const output = outputSchema.safeParse(raw); // the envelope must be right
  if (!output.success) return []; // nothing usable
  const valid: Draft[] = []; // candidates that pass the schema, trimmed
  for (const item of output.data.candidates) { // each proposed candidate
    const parsed = draftSchema.safeParse(item); // its shape
    if (!parsed.success) continue; // dropped: wrong shape, unknown intent or score out of range
    const text = parsed.data.text.replace(/\s+/g, ' ').trim().replace(/[\s.…]+$/, ''); // one space between words, none at the ends, and no closing full stops or ellipsis ("Not sure." to "Not sure"); "?" and "!" stay
    if (text !== '' && text.length <= CANDIDATE_MAX_CHARS) valid.push({ ...parsed.data, text }); // within the cap
  } // end of the candidates
  valid.sort((a, b) => b.score - a.score); // best first (stable), so de-duplication keeps the best of each
  const seen = new Set<string>(); // lower-cased texts already kept
  return valid.filter((d) => !seen.has(d.text.toLowerCase()) && seen.add(d.text.toLowerCase())); // first of each text
} // end of cleanDrafts

/**
 * Plan §4.6: drops every draft that contains a listed term as a whole word, in any case, or one of its simple variants
 * (-s, -es, -ed, -ing, -er, the last three also after a doubled last letter). Returns the rest, in order, and how many went.
 */
export function dropBanned(drafts: readonly Draft[], terms: readonly string[] = BANNED_TERMS): { kept: Draft[]; dropped: number } { // the profanity filter
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // regex metacharacters as plain text
  const patterns = terms.map((t) => new RegExp('\\b' + esc(t) + '(?:s|es|' + esc(t.slice(-1)) + '?(?:ed|ing|er))?\\b', 'i')); // one whole-word pattern per term and its variants ("crapped" too)
  const kept = drafts.filter((d) => !patterns.some((p) => p.test(d.text))); // drafts without any listed term
  return { kept, dropped: drafts.length - kept.length }; // a count, never the text
} // end of dropBanned

/**
 * Plan §4.3 step 4: the drafts (up to 8) filled up with the given defaults they do not already contain; without a later
 * reply the weakest gives way to one (plan §4.6); then all of them (at most eight) ordered best guess first, except that
 * every fallback (a later or clarify reply) comes after every substantive one, with priors from the scores. The drafts
 * are the model's, or ask_question's options.
 */
export function toCandidates(model: readonly Draft[], defaults: readonly Draft[] = DEFAULT_REPLIES, source: 'llm' | 'option' = 'llm'): Candidate[] { // drafts to candidates
  const picked: Omit<Candidate, 'prior'>[] = model.slice(0, REPLY_COUNT).map((d) => ({ ...d, source })); // the best eight drafts
  const said = picked.map((c) => c.text.toLowerCase()); // texts already present
  for (const d of defaults) { // fill up from the defaults, in their order
    if (picked.length === REPLY_COUNT) break; // full
    if (!said.some((t) => t.includes(d.text.toLowerCase()))) picked.push({ ...d, source: 'default' }); // not already said, even inside a longer reply ("I'm not sure" has "Not sure")
  } // end of the fill
  if (!picked.some((c) => c.intent === 'later')) { // Sam can always say "later"
    const later = defaults.find((d) => d.intent === 'later' && !picked.some((c) => c.text.toLowerCase() === d.text.toLowerCase())); // "Not now", else "Ask me later"
    const weakest = picked.reduce((w, c, i) => (c.score <= picked[w]!.score ? i : w), 0); // the lowest score; of equals, the one listed last
    if (later) picked[weakest] = { ...later, source: 'default' }; // gives way
  } // end of the later rule
  picked.sort((a, b) => Number(FALLBACKS.includes(a.intent)) - Number(FALLBACKS.includes(b.intent)) || b.score - a.score); // the TV scans them in this order: substantive replies first, then the fallbacks, each best guess first
  const p = priors(picked.map((c, i) => ({ id: String(i), score: c.score })), PRIOR_CONFIG); // max(s, floor)^(1/tau), normalised
  return picked.map((c, i) => ({ ...c, prior: p[i]! })); // one prior per candidate
} // end of toCandidates

/** The default candidates that fit the question, pushed with every new question asked without options. */
export function defaultCandidates(question: string): Candidate[] { // no model output yet
  return toCandidates([], defaultsFor(question)); // all the fitting defaults
} // end of defaultCandidates

/** ask_question's options, in their order and without repeats, then Not now and Not sure: no model call. */
export function optionCandidates(options: readonly string[]): Candidate[] { // options to candidates
  const drafts = cleanDrafts({ candidates: options.map((text) => ({ text, intent: 'choice', score: OPTION_SCORE })) }); // trimmed, de-duplicated, order kept
  return toCandidates(drafts, UNSURE_OR_LATER, 'option'); // at most 6 options, so at most eight candidates
} // end of optionCandidates
