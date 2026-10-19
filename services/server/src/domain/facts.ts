// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Profile facts (plan FR-03, §4.6 inputs, §6.1): what the reply model may know about the person, kept as data.

import { z } from 'zod'; // validation of stored facts before they reach a prompt

export const FACT_CATEGORIES = ['likes', 'dislikes', 'people', 'routines', 'other'] as const; // plan Table 16, add_profile_fact
export type FactCategory = (typeof FACT_CATEGORIES)[number]; // one of the above
export const FACT_MAX_CHARS = 120; // plan §6.1: a length limit per fact
export const FACTS_MAX = 20; // plan §6.1: at most this many facts in one prompt
export const NO_ANGLE_BRACKETS = /^[^<>]*$/; // no "<" or ">", so no fact can close the prompt's <facts> block

/** One thing known about the person. */
export interface ProfileFact { // a fact as stored
  text: string; // the fact, e.g. "Sam follows cricket"
  category: FactCategory; // what kind of fact
} // end of ProfileFact

export const DEMO_HOUSEHOLD = 'demo'; // one device token, so one household until households exist

/** The demo persona's synthetic facts; no health facts. */
export const DEMO_FACTS: readonly ProfileFact[] = [ // seeded by compose.ts
  { text: 'Sam follows cricket', category: 'likes' }, // a pastime
  { text: 'Sam prefers tea to coffee', category: 'likes' }, // a drink
  { text: "Alex is Sam's son", category: 'people' }, // who Alex is
  { text: "Sam has lunch at one o'clock", category: 'routines' }, // a daily routine
]; // end of DEMO_FACTS

const factSchema = z.object({ text: z.string().min(1).max(FACT_MAX_CHARS).regex(NO_ANGLE_BRACKETS), category: z.enum(FACT_CATEGORIES) }); // one fact

/** The facts that may enter a prompt: each valid one (a failing fact is dropped, not the list), the first FACTS_MAX in stored order. */
export function promptFacts(facts: readonly unknown[]): ProfileFact[] { // stored facts to prompt facts
  const valid: ProfileFact[] = []; // facts that pass the schema
  for (const fact of facts) { // each stored fact
    const parsed = factSchema.safeParse(fact); // its shape, category and length
    if (parsed.success) valid.push(parsed.data); // kept; unknown fields are stripped
  } // end of the facts
  return valid.slice(0, FACTS_MAX); // the first ones only
} // end of promptFacts
