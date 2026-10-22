// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MockLlm: deterministic candidates from the question text and profile facts, in the live model's tool-output shape, without AWS.

import { choiceOptions, questionKind, type Draft } from '../domain/candidates.ts'; // candidate shape, which questions Yes or No can answer, and a choice's options
import { promptFacts, type ProfileFact } from '../domain/facts.ts'; // profile facts
import { REPLY_COUNT } from '../domain/model.ts'; // eight per question
import type { LlmPort, SuggestRequest } from '../ports/index.ts'; // the port

type Row = [text: string, intent: Draft['intent'], score: number]; // a compact candidate

/** Replies that use a fact: [question pattern, pattern for a "likes" fact, reply]. The first match wins. */
const FACT_REPLIES: readonly [question: RegExp, fact: RegExp, reply: string][] = [ // one small table, in one place
  [/\bwatch\b/i, /\bcricket\b/i, 'The cricket, please'], // "What shall we watch tonight?" and "Sam follows cricket"
  [/\btea\b/i, /\bprefers tea\b/i, 'Tea, please'], // "Would you like coffee or tea?" and "Sam prefers tea to coffee"
]; // end of FACT_REPLIES

/** Eight candidates for the question; a fitting "likes" fact puts its reply first. The same input always gets the same list. */
export function mockReplies(question: string, facts: readonly ProfileFact[] = []): Draft[] { // question and facts to drafts
  const rules = ruleReplies(question); // the rule-based list
  const likes = facts.filter((f) => f.category === 'likes').map((f) => f.text); // what Sam likes
  const hit = FACT_REPLIES.find(([q, f]) => q.test(question) && likes.some((text) => f.test(text))); // the first entry that fits
  if (!hit) return rules; // no fact applies: the rules alone
  const rest = rules.filter((d) => d.text.toLowerCase() !== hit[2].toLowerCase()); // without the same reply
  return [{ text: hit[2], intent: 'choice', score: 0.4 }, ...rest.slice(0, REPLY_COUNT - 1)]; // above every rule score, eight in all
} // end of mockReplies

/** Eight candidates for the question, chosen by simple rules; the same question always gets the same list. */
function ruleReplies(question: string): Draft[] { // question text to drafts
  const kind = questionKind(question); // as asked: without its "?", every yes/no question would be open
  const q = question.trim().replace(/[?.!\s]+$/, ''); // without the final punctuation
  const options = choiceOptions(question); // named as the server's basic answers name them: "Soup or a sandwich for lunch?" gives "soup" and "a sandwich"
  if (options.length === 2) { // a choice between two things; with a side such as "or are you full?" left out, the rules below apply
    const [a, b] = options.map(cap) as [string, string]; // "Soup", "A sandwich"
    return rows([[`${a}, please`, 'choice', 0.3], [`${b}, please`, 'choice', 0.28], ['Neither, thanks', 'no', 0.1], ['Not right now', 'later', 0.08], ['Both, please', 'choice', 0.07], ["I'm not sure", 'clarify', 0.07], ['Ask me later', 'later', 0.05], ['Tell me more', 'clarify', 0.05]]); // choice
  } // end of the choice
  if (kind === 'yesno') return rows([['Yes, please', 'yes', 0.3], ['No, thanks', 'no', 0.25], ['Not right now', 'later', 0.12], ['Maybe later', 'later', 0.1], ["I'm not sure", 'clarify', 0.08], ['Tell me more', 'clarify', 0.06], ['Thank you', 'social', 0.05], ['Ask me later', 'later', 0.04]]); // yes or no, before the topic rules: "a walk after lunch?" still wants Yes or No
  if (/\bhow (are|do) you\b|\bfeel/i.test(q)) return rows([['Good, thanks', 'social', 0.28], ['A bit tired', 'need', 0.16], ['Not great', 'need', 0.12], ['Happy', 'social', 0.1], ['In some pain', 'need', 0.1], ["I'd rather not say", 'clarify', 0.08], ['Bored', 'need', 0.06], ['And you?', 'social', 0.04]]); // feelings
  if (/\b(eat|lunch|dinner|breakfast|hungry|snack)\b/i.test(q)) return rows([['Something light', 'choice', 0.22], ['Soup, please', 'choice', 0.16], ['A sandwich', 'choice', 0.14], ['Not hungry yet', 'later', 0.12], ['Surprise me', 'choice', 0.1], ['Pasta, please', 'choice', 0.1], ['Same as yesterday', 'choice', 0.08], ['Ask me later', 'later', 0.08]]); // food
  return rows([["I'm not sure", 'clarify', 0.2], ['Tell me more', 'clarify', 0.16], ['Let me think', 'clarify', 0.14], ['You decide', 'choice', 0.12], ['Ask me later', 'later', 0.1], ['Thank you', 'social', 0.1], ['Maybe', 'clarify', 0.1], ['Not now', 'later', 0.08]]); // an open question: no Yes or No
} // end of ruleReplies

/** The mock adapter: answers at once, in the same envelope as the Bedrock tool call. */
export class MockLlm implements LlmPort { // the mock reply model
  async suggest(request: SuggestRequest, _signal: AbortSignal): Promise<unknown> { // the budget never matters here
    return { candidates: mockReplies(request.question, promptFacts(request.facts)) }; // the live tool input shape, same fact limits as live
  } // end of suggest
} // end of MockLlm

function rows(list: Row[]): Draft[] { // compact rows to drafts
  return list.map(([text, intent, score]) => ({ text, intent, score })); // one draft per row
} // end of rows

function cap(s: string): string { // first letter in upper case
  return s.charAt(0).toUpperCase() + s.slice(1); // "tea" to "Tea"
} // end of cap
