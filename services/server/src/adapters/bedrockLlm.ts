// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// BedrockLlm (plan §4.3, §4.6): Nova 2 Lite through the Converse API, with a forced tool call carrying the candidates.

import { ConverseCommand, type BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'; // Bedrock Runtime
import { CANDIDATE_MAX_CHARS, INTENTS } from '../domain/model.ts'; // the §4.6 limits
import type { LlmPort, SuggestRequest } from '../ports/index.ts'; // the port

export const TOOL_NAME = 'suggest_replies'; // the one tool; toolChoice forces it

/** Plan §4.6 rules. */
export const SYSTEM_PROMPT = [ // one rule per line
  'You suggest replies for a person who communicates by pressing a single switch. They pick one reply, which is spoken aloud.', // role
  'Write every reply in the first person, as that person. Keep replies short and natural.', // first person, short
  'Cover yes, no and later where the question allows, and include one "not sure" or "ask me later" reply.', // coverage
  'Use facts only when they are relevant, and never invent facts about people.', // no invented facts
  'Never give medical, legal or financial advice. Never use profanity.', // safety
  `Give 6 to 8 replies, each at most ${CANDIDATE_MAX_CHARS} characters, with an intent and a score from 0 to 1 for how likely the person is to choose it.`, // shape
  `Answer only by calling the ${TOOL_NAME} tool.`, // the forced tool call
].join('\n'); // one string

/**
 * The tool's input schema (plan §4.6). Nova accepts only type, properties and required at the top level; count and
 * length limits go in descriptions, because the domain re-validates the output anyway.
 */
export const TOOL_SCHEMA = { // JSON schema
  type: 'object', // the tool input
  properties: { // its one field
    candidates: { // the replies
      type: 'array', // a list
      description: '6 to 8 reply candidates, best first', // count
      items: { // one candidate
        type: 'object', // an object
        properties: { // its fields
          text: { type: 'string', description: `The reply in the first person, at most ${CANDIDATE_MAX_CHARS} characters` }, // words
          intent: { type: 'string', enum: [...INTENTS] }, // kind of reply
          score: { type: 'number', minimum: 0, maximum: 1, description: 'How likely the person is to choose this reply' }, // score
        }, // end of fields
        required: ['text', 'intent', 'score'], // all three
      }, // end of candidate
    }, // end of replies
  }, // end of properties
  required: ['candidates'], // the list is required
}; // end of TOOL_SCHEMA

/** The user message: the question, the time of day and up to six earlier turns. */
export function userPrompt(request: SuggestRequest): string { // §4.6 inputs as text
  const turns = request.recentTurns.map((t) => `- ${t.speaker}: ${t.text}`).join('\n') || '- none'; // oldest first
  return `Question from ${request.askedBy}: ${request.question}\nLocal time: ${request.localTime}\nRecent conversation, oldest first:\n${turns}`; // the prompt
} // end of userPrompt

/** The live reply model. */
export class BedrockLlm implements LlmPort { // Bedrock adapter
  private readonly client: BedrockRuntimeClient; // configured with region and SSO profile in compose.ts
  private readonly modelId: string; // the EU inference profile id (plan §8.1)

  constructor(client: BedrockRuntimeClient, modelId: string) { // a client and a model id
    this.client = client; // keep the client
    this.modelId = modelId; // keep the model id
  } // end of constructor

  /** Calls Converse and returns the tool call's input (validated by the domain), or null when there is none. */
  async suggest(request: SuggestRequest, signal: AbortSignal): Promise<unknown> { // one model call
    const response = await this.client.send(new ConverseCommand({ // the Converse request
      modelId: this.modelId, // eu.amazon.nova-2-lite-v1:0 by default
      system: [{ text: SYSTEM_PROMPT }], // the rules
      messages: [{ role: 'user', content: [{ text: userPrompt(request) }] }], // the question and context
      toolConfig: { // the forced tool call
        tools: [{ toolSpec: { name: TOOL_NAME, description: 'Return the reply candidates', inputSchema: { json: TOOL_SCHEMA } } }], // one tool
        toolChoice: { tool: { name: TOOL_NAME } }, // Nova supports forcing one tool
      }, // end of toolConfig
      inferenceConfig: { maxTokens: 1000, temperature: 0 }, // the Nova guide recommends temperature 0 (greedy) for tool use
    }), { abortSignal: signal }); // aborted when the budget runs out
    const block = response.output?.message?.content?.find((b) => b.toolUse !== undefined); // a text block may come first
    return block?.toolUse?.input ?? null; // the tool input, already parsed by the SDK
  } // end of suggest
} // end of BedrockLlm
