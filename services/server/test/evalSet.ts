// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Evaluation set of plan §4.6: 30 synthetic household questions and the automatic checks on their candidates. The
// server tests run the checks against the mock model (evalSet.test.ts); tools/k3-eval.mjs runs them against the live one.

import { dropBanned, questionKind } from '../src/domain/candidates.ts'; // the banned-term filter and the question kinds
import { CANDIDATE_MAX_CHARS, INTENTS, REPLY_COUNT, type Candidate } from '../src/domain/model.ts'; // the §4.6 limits

/** One question; `fact` matches a reply that uses one of the seeded demo facts (domain/facts.ts), where one should show. */
export interface EvalQuestion { // one entry
  text: string; // the question, as a caregiver would ask it
  fact?: RegExp; // a top-four reply should match it
} // end of EvalQuestion

/** Twelve yes/no, eight choice and ten open questions; three of them should bring up a seeded fact. */
export const EVAL_SET: readonly EvalQuestion[] = [ // synthetic, household topics only
  { text: 'Would you like a cup of coffee?', fact: /\btea\b/i }, // yes/no; "Sam prefers tea to coffee"
  { text: 'Shall I open the window?' }, // yes/no
  { text: 'Are you warm enough?' }, // yes/no
  { text: 'Do you want the radio on?' }, // yes/no
  { text: 'Would you like a blanket?' }, // yes/no
  { text: 'Is the television too loud?' }, // yes/no
  { text: 'Shall we go for a walk after lunch?' }, // yes/no
  { text: 'Did you sleep well?' }, // yes/no
  { text: 'Can I turn the lights down a bit?' }, // yes/no
  { text: 'Sam, would you like some more water?' }, // yes/no, after a name
  { text: 'Tea?' }, // yes/no, one word
  { text: 'Shall I read you the paper, or not?' }, // yes/no, "or not"
  { text: 'Would you like tea or coffee?' }, // choice
  { text: 'Shall we watch a film or the news?' }, // choice
  { text: 'Soup or a sandwich for lunch?' }, // choice
  { text: 'Would you like the blue jumper or the green one?' }, // choice
  { text: 'Shall we sit in the garden or stay inside?' }, // choice
  { text: 'Toast or cereal this morning?' }, // choice
  { text: 'Would you like some music on or some quiet?' }, // choice
  { text: 'Sam, shall we have fish or chicken tonight?' }, // choice, after a name
  { text: 'What would you like to watch tonight?', fact: /cricket/i }, // open; "Sam follows cricket"
  { text: 'When would you like your lunch?', fact: /\bone\b|\b1\b|1\s?pm|13:00/i }, // open; "Sam has lunch at one o'clock"
  { text: 'What would you like for dinner?' }, // open
  { text: 'How are you feeling this morning?' }, // open
  { text: 'Who would you like to see this weekend?' }, // open
  { text: 'Where shall we go this afternoon?' }, // open
  { text: 'Which programme shall I record for you?' }, // open
  { text: 'What music would you like on?' }, // open
  { text: 'How was your day?' }, // open
  { text: 'What would you like to drink with your dinner?' }, // open
]; // end of EVAL_SET

/**
 * The automatic checks of plan §4.6 on a question's candidates as the TV gets them: schema (one to eight, each with
 * text, a known intent, a score and a prior), length (at most 60 characters), intent coverage (a later reply always,
 * and yes and no replies for a yes/no question) and banned terms. Returns the failures; none means it passes.
 */
export function evalChecks(question: string, candidates: readonly Candidate[]): string[] { // one question's candidates
  const failures: string[] = []; // what went wrong, readable
  if (candidates.length < 1 || candidates.length > REPLY_COUNT) failures.push(`schema: ${candidates.length} candidates`); // the grid's limits
  for (const c of candidates) { // each candidate
    const valid = typeof c.text === 'string' && INTENTS.includes(c.intent) && c.score >= 0 && c.score <= 1 && Number.isFinite(c.prior); // the event's shape
    if (!valid) failures.push(`schema: ${JSON.stringify(c)}`); // malformed
    else if (c.text.length > CANDIDATE_MAX_CHARS) failures.push(`length: "${c.text}"`); // too long
  } // end of the candidates
  const intents = new Set<string>(candidates.map((c) => c.intent)); // the intents offered
  const needed = questionKind(question) === 'yesno' ? ['yes', 'no', 'later'] : ['later']; // FR-03: yes, no and later where the question allows
  for (const intent of needed) if (!intents.has(intent)) failures.push(`intent: no ${intent} reply`); // missing
  const { dropped } = dropBanned(candidates); // anything the filter would remove
  if (dropped > 0) failures.push(`banned: ${dropped} candidates`); // must be none
  return failures; // empty when every check passes
} // end of evalChecks
