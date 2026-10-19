// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MockLlm (plan §4.3): deterministic candidates from the question text, in the §4.6 tool-output shape, without AWS.

import type { Draft } from '../domain/candidates.ts'; // candidate shape
import type { LlmPort, SuggestRequest } from '../ports/index.ts'; // the port

type Row = [text: string, intent: Draft['intent'], score: number]; // a compact candidate

const ARTICLES = new Set(['a', 'an', 'the', 'some']); // kept in front of a choice ("a film")

/** Eight candidates for the question, chosen by simple rules; the same question always gets the same list. */
export function mockReplies(question: string): Draft[] { // question text to drafts
  const q = question.trim().replace(/[?.!\s]+$/, ''); // without the final punctuation
  const or = /^(.*\S)\s+or\s+(\S.*)$/i.exec(q); // "... tea or coffee"
  if (or) { // a choice between two things
    const left = or[1]!.split(/\s+/); // the words before "or"
    const before = left.length > 1 && ARTICLES.has(left.at(-2)!.toLowerCase()) ? `${left.at(-2)} ` : ''; // "a film"
    const a = cap(before + left.at(-1)!); // the first option: the last word before "or"
    const b = cap(or[2]!.split(/\s+/).slice(0, 3).join(' ')); // the second option: up to three words after it
    return rows([[`${a}, please`, 'choice', 0.3], [`${b}, please`, 'choice', 0.28], ['Neither, thanks', 'no', 0.1], ['Not right now', 'later', 0.08], ['Both, please', 'choice', 0.07], ["I'm not sure", 'clarify', 0.07], ['Ask me later', 'later', 0.05], ['Tell me more', 'clarify', 0.05]]); // choice
  } // end of the choice
  if (/\bhow (are|do) you\b|\bfeel/i.test(q)) return rows([['Good, thanks', 'social', 0.28], ['A bit tired', 'need', 0.16], ['Not great', 'need', 0.12], ['Happy', 'social', 0.1], ['In some pain', 'need', 0.1], ["I'd rather not say", 'clarify', 0.08], ['Bored', 'need', 0.06], ['And you?', 'social', 0.04]]); // feelings
  if (/\b(eat|lunch|dinner|breakfast|hungry|snack)\b/i.test(q)) return rows([['Something light', 'choice', 0.22], ['Soup, please', 'choice', 0.16], ['A sandwich', 'choice', 0.14], ['Not hungry yet', 'later', 0.12], ['Surprise me', 'choice', 0.1], ['Pasta, please', 'choice', 0.1], ['Same as yesterday', 'choice', 0.08], ['Ask me later', 'later', 0.08]]); // food
  if (/^(would|do|does|shall|should|can|could|are|is|will|did|have|may)\b/i.test(q)) return rows([['Yes, please', 'yes', 0.3], ['No, thanks', 'no', 0.25], ['Not right now', 'later', 0.12], ['Maybe later', 'later', 0.1], ["I'm not sure", 'clarify', 0.08], ['Tell me more', 'clarify', 0.06], ['Thank you', 'social', 0.05], ['Ask me later', 'later', 0.04]]); // yes or no
  return rows([["I'm not sure", 'clarify', 0.2], ['Tell me more', 'clarify', 0.16], ['Yes', 'yes', 0.14], ['No', 'no', 0.12], ['Ask me later', 'later', 0.1], ['Thank you', 'social', 0.1], ['Maybe', 'clarify', 0.1], ['Not now', 'later', 0.08]]); // anything else
} // end of mockReplies

/** The mock adapter: answers at once, in the same envelope as the Bedrock tool call. */
export class MockLlm implements LlmPort { // the mock reply model
  async suggest(request: SuggestRequest, _signal: AbortSignal): Promise<unknown> { // the budget never matters here
    return { candidates: mockReplies(request.question) }; // the §4.6 tool input shape
  } // end of suggest
} // end of MockLlm

function rows(list: Row[]): Draft[] { // compact rows to drafts
  return list.map(([text, intent, score]) => ({ text, intent, score })); // one draft per row
} // end of rows

function cap(s: string): string { // first letter in upper case
  return s.charAt(0).toUpperCase() + s.slice(1); // "tea" to "Tea"
} // end of cap
