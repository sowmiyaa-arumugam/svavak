// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Composition root: picks the adapters for SAY_WHEN_MODE and wires them to the use-cases and interfaces.

import { randomUUID } from 'node:crypto'; // random ids
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'; // live model
import { PollyClient } from '@aws-sdk/client-polly'; // live speech
import { WebSocketServer } from 'ws'; // the stream
import { BedrockLlm } from './adapters/bedrockLlm.ts'; // live LLM adapter
import { MemoryStore } from './adapters/memoryStore.ts'; // store adapter
import { MockLlm } from './adapters/mockLlm.ts'; // mock LLM adapter
import { MockTts } from './adapters/mockTts.ts'; // mock speech adapter
import { PollyTts } from './adapters/pollyTts.ts'; // live speech adapter
import { SseTraceSink } from './adapters/traceSink.ts'; // trace adapter
import { WsNotifier } from './adapters/wsNotifier.ts'; // notifier adapter
import { createUseCases, type Deps } from './application/useCases.ts'; // use-cases
import type { Config } from './config.ts'; // settings
import { DailyCap } from './domain/dailyCap.ts'; // cost guard
import { DEMO_FACTS, DEMO_HOUSEHOLD } from './domain/facts.ts'; // the demo persona's facts
import { createServer } from './interfaces/http.ts'; // REST, WebSocket, SSE
import type { Log } from './ports/index.ts'; // logging

export const BUDGET_MS = 3500; // plan §4.3: the model's candidates must arrive within 3.5 s
export const LLM_CALLS_PER_DAY = 1000; // plan §4.3 daily cap
export const POLLY_CHARS_PER_DAY = 100_000; // plan §4.3 daily cap
const PING_MS = 25_000; // keep-alive event on the stream

/** JSON log lines on stdout (plan §4.3: structured logs, no message text). */
export const jsonLog: Log = (msg, fields = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...fields })); // one line each

/** The server and its dependencies for a configuration. Live mode makes no AWS call until a request needs one. */
export function compose(config: Config, log: Log = jsonLog) { // wire everything
  const clock = () => Date.now(); // ClockPort
  const newId = () => randomUUID(); // IdPort
  const live = config.mode === 'live'; // which adapters
  const aws = { region: config.awsRegion, profile: config.awsProfile }; // the SDK's default chain resolves the SSO profile; no keys here
  const wss = new WebSocketServer({ noServer: true }); // upgrades are authenticated in http.ts first
  const trace = new SseTraceSink(clock, newId); // spans
  const notifier = new WsNotifier(wss); // pushes
  const deps: Deps = { // the use-cases' ports
    mode: config.mode, // mock or live
    store: new MemoryStore({ [DEMO_HOUSEHOLD]: DEMO_FACTS }), // in memory, seeded with the demo facts
    notifier, // the stream
    trace, // spans
    log, // logs
    clock, // time
    newId, // ids
    llm: { live: live ? new BedrockLlm(new BedrockRuntimeClient(aws), config.modelId) : null, mock: new MockLlm(), cap: new DailyCap(LLM_CALLS_PER_DAY, clock), budgetMs: BUDGET_MS }, // replies
    tts: { live: live ? new PollyTts(new PollyClient(aws), config.voice) : null, mock: new MockTts(), cap: new DailyCap(POLLY_CHARS_PER_DAY, clock) }, // speech
  }; // end of deps
  const server = createServer({ token: config.deviceToken, agentToken: config.agentToken, mcpAllowedHosts: config.mcpAllowedHosts, mcpAllowedOrigins: config.mcpAllowedOrigins, mode: config.mode, useCases: createUseCases(deps), trace, wss, notifier, log, pingMs: PING_MS }); // interfaces
  return { server, deps }; // the caller listens
} // end of compose
