// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Composition root: picks the adapters for SVAVAK_MODE and wires them to the use-cases and interfaces.

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
import { STUDIO_ORIGIN, TV_ORIGIN, type Config } from './config.ts'; // settings, and the studio's and the TV's origins
import { DailyCap } from './domain/dailyCap.ts'; // cost guard
import { DEMO_FACTS, DEMO_HOUSEHOLD } from './domain/facts.ts'; // the demo persona's facts
import { createServer } from './interfaces/http.ts'; // REST, WebSocket, SSE
import type { Log } from './ports/index.ts'; // logging

export const BUDGET_MS = 3500; // the model's candidates must arrive within 3.5 s
export const LLM_CALLS_PER_DAY = 1000; // daily cap
export const POLLY_CHARS_PER_DAY = 100_000; // daily cap
export const ANNOUNCER_VOICE = 'Amy'; // B9: questions are read aloud in Polly's standard voice Amy (en-GB), never in Sam's own voice
export const ANNOUNCE_MS = 2000; // B9: a question waits at most this long for its announcement, then goes out without one
const PING_MS = 25_000; // keep-alive event on the stream
const MCP_IDLE_MS = 30 * 60_000; // an MCP session ends after 30 minutes without requests

/** JSON log lines on stdout: structured logs, no message text. */
export const jsonLog: Log = (msg, fields = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...fields })); // one line each

/** The server and its dependencies for a configuration. Live mode makes no AWS call until a request needs one. */
export function compose(config: Config, log: Log = jsonLog) { // wire everything
  const clock = () => Date.now(); // ClockPort
  const newId = () => randomUUID(); // IdPort
  const live = config.mode === 'live'; // which adapters
  const profile = config.awsProfile; // the SDK's default chain resolves the SSO profile (aws login or IAM Identity Center); no keys here
  const wss = new WebSocketServer({ noServer: true }); // upgrades are authenticated in http.ts first
  const trace = new SseTraceSink(clock, newId); // spans
  const notifier = new WsNotifier(wss); // pushes
  const polly = live ? new PollyClient({ region: config.pollyRegion, profile }) : null; // Polly in its own region, for both voices
  const deps: Deps = { // the use-cases' ports
    mode: config.mode, // mock or live
    store: new MemoryStore({ [DEMO_HOUSEHOLD]: DEMO_FACTS }), // in memory, seeded with the demo facts
    notifier, // the stream
    trace, // spans
    log, // logs
    clock, // time
    newId, // ids
    llm: { live: live ? new BedrockLlm(new BedrockRuntimeClient({ region: config.awsRegion, profile }), config.modelId, log) : null, mock: new MockLlm(), cap: new DailyCap(LLM_CALLS_PER_DAY, clock), budgetMs: BUDGET_MS }, // replies
    tts: { live: polly ? new PollyTts(polly, config.voice, config.pollyEngine) : null, announcer: polly ? new PollyTts(polly, ANNOUNCER_VOICE, 'standard') : null, mock: new MockTts(), cap: new DailyCap(POLLY_CHARS_PER_DAY, clock), announceMs: ANNOUNCE_MS }, // Sam's voice and the announcer's, one daily cap for both
  }; // end of deps
  const server = createServer({ token: config.deviceToken, agentToken: config.agentToken, mcpAllowedHosts: config.mcpAllowedHosts, mcpAllowedOrigins: config.mcpAllowedOrigins, mode: config.mode, useCases: createUseCases(deps), trace, wss, notifier, log, pingMs: PING_MS, mcpIdleMs: MCP_IDLE_MS, studioOrigin: STUDIO_ORIGIN, tvOrigin: TV_ORIGIN }); // interfaces
  return { server, deps }; // the caller listens
} // end of compose
