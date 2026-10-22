// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The MCP server on /mcp: Streamable HTTP sessions and the caregiver tools.

import { randomUUID } from 'node:crypto'; // session ids
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; // tool registration and protocol handling
import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js'; // DNS-rebinding protection
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'; // the transport, one per session
import { isInitializeRequest, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // message shapes
import express, { type RequestHandler, type Response } from 'express'; // middleware types and the JSON parser
import { z } from 'zod'; // tool input schemas, validated by the SDK
import { FactLimitError, NotFoundError, type UseCases } from '../application/useCases.ts'; // use-cases
import { FACT_CATEGORIES, FACT_MAX_CHARS, FACTS_MAX, NO_ANGLE_BRACKETS } from '../domain/facts.ts'; // fact limits
import { ASKED_BY_MAX_CHARS, OPTION_MAX_CHARS, OPTIONS_MAX, QUESTION_MAX_CHARS, URGENCIES } from '../domain/model.ts'; // question limits
import type { Log, TracePort } from '../ports/index.ts'; // ports

/** What /mcp needs. */
export interface McpOptions { // wired by http.ts
  useCases: UseCases; // the application layer
  trace: TracePort; // one span per tool call
  mode: 'mock' | 'live'; // for the spans
  log: Log; // JSON log lines
  allowedHosts: string[]; // Host names accepted
  allowedOrigins: string[]; // browser origins accepted; a request without Origin is allowed
  authorize: RequestHandler; // the agent-token check
  idleMs: number; // a session ends after this long without requests
} // end of McpOptions

const NEVER = 'Never ask for or store passwords, health records or financial data.'; // the agents' safety rule
const TOOLS = new Set(['ask_question', 'get_answer', 'get_recent_messages', 'add_profile_fact']); // the names a span may carry; anything else is "unknown"

/** The /mcp middleware chain: Host, Origin, token, JSON body, then the session's transport. */
export function mcpHandlers(o: McpOptions): RequestHandler[] { // for app.all('/mcp', ...)
  const sessions = new Map<string, StreamableHTTPServerTransport>(); // open sessions by id
  const idle = new Map<string, ReturnType<typeof setTimeout>>(); // each open session's idle timer

  const touch = (sid: string, transport: StreamableHTTPServerTransport) => { // a request on the session: its idle wait starts again
    clearTimeout(idle.get(sid)); // the previous wait
    const timer = setTimeout(() => void transport.close(), o.idleMs); // ends the session as a DELETE would; onclose forgets it
    timer.unref(); // never keeps the process alive
    idle.set(sid, timer); // the current wait
  }; // end of touch

  const origin: RequestHandler = (req, res, next) => { // a page on another origin must not drive /mcp
    const value = req.get('origin'); // browsers send it; other clients usually do not
    if (value === undefined || o.allowedOrigins.includes(value)) return next(); // allowed
    rpcError(res, 403, -32000, 'Forbidden: Origin not allowed'); // refused
  }; // end of origin

  const handle: RequestHandler = async (req, res) => { // route to the session, or start one
    const started = performance.now(); // for a tool call's span
    const tool = req.body?.method === 'tools/call' ? String(req.body.params?.name) : null; // the tool called, if this is a call
    if (tool !== null) res.on('close', () => o.trace.span({ hop: 'mcp', operation: TOOLS.has(tool) ? tool : 'unknown', duration_ms: Math.round(performance.now() - started), mode: o.mode })); // every call, refused ones too; never arguments, nor a name the caller made up
    const id = req.get('mcp-session-id'); // the session, after initialize
    const known = id === undefined ? undefined : sessions.get(id); // its transport
    if (known) { touch(id!, known); return known.handleRequest(req, res, req.body); } // POST, GET (SSE) or DELETE on the session, which stays open for another idleMs
    if (id !== undefined) return rpcError(res, 404, -32001, 'Session not found'); // ended or never issued
    if (req.method !== 'POST' || !isInitializeRequest(req.body)) return rpcError(res, 400, -32000, 'Bad Request: No valid session ID provided'); // only initialize starts one
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({ // a new session
      sessionIdGenerator: () => randomUUID(), // cryptographically random, visible ASCII
      onsessioninitialized: (sid) => { sessions.set(sid, transport); touch(sid, transport); o.log('mcp.session.opened', { sessions: sessions.size }); }, // routable from now on, until idle
    }); // end of the transport
    transport.onclose = () => { // DELETE, the idle timer, or the server closing it; set before connect, which wraps it
      if (transport.sessionId) { sessions.delete(transport.sessionId); clearTimeout(idle.get(transport.sessionId)); idle.delete(transport.sessionId); } // later requests with its id get 404
      o.log('mcp.session.closed', { sessions: sessions.size }); // no ids or content
    }; // end of onclose
    await toolServer(o).connect(transport); // one McpServer per session: the SDK binds a server to one transport
    await transport.handleRequest(req, res, req.body); // the initialize itself; the SDK negotiates the protocol version
  }; // end of handle

  return [hostHeaderValidation(o.allowedHosts), origin, o.authorize, express.json({ limit: '32kb' }), handle]; // in this order
} // end of mcpHandlers

/** An McpServer with the four caregiver tools (P0, plus add_profile_fact). */
function toolServer(o: McpOptions): McpServer { // one per session
  const server = new McpServer({ name: 'svavak', title: 'SvaVāk', version: '0.1.0' }); // an ASCII identifier, the product's name as people read it, and the server package's version

  /** Runs a tool: its JSON output, or a tool error for a refused request. The span comes from handle(). */
  async function run(name: string, tool: () => object | Promise<object>): Promise<CallToolResult> { // shared by every tool
    try { // the use-case
      const output = await tool(); // the result
      return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output as Record<string, unknown> }; // as JSON text, and structured
    } catch (error) { // refused, or a fault of ours
      if (error instanceof NotFoundError || error instanceof FactLimitError) return { content: [{ type: 'text', text: error.message }], isError: true }; // the agent can act on it
      o.log('mcp.error', { tool: name, error: String(error) }); // ours: logged
      return { content: [{ type: 'text', text: 'internal error' }], isError: true }; // no details leak
    } // end of the run
  } // end of run

  server.registerTool('ask_question', { // put a question on the TV
    title: 'Ask a question on the TV', // display name
    description: `Shows a short question on the TV of the person who answers with a single switch. Give up to ${OPTIONS_MAX} short options when the answer is a choice; "Not now" and "Not sure" are added. A new question replaces any unanswered one. ${NEVER} Then call get_answer with the question_id.`, // for the agent
    inputSchema: { // the tool's arguments
      question: z.string().trim().min(1).max(QUESTION_MAX_CHARS).describe(`The question, at most ${QUESTION_MAX_CHARS} characters`), // the text
      options: z.array(z.string().trim().min(1).max(OPTION_MAX_CHARS)).min(1).max(OPTIONS_MAX).optional().describe(`Up to ${OPTIONS_MAX} answers to choose from, each at most ${OPTION_MAX_CHARS} characters`), // optional choices
      urgency: z.enum(URGENCIES).default('normal').describe('normal or high'), // how urgent
      asked_by: z.string().trim().min(1).max(ASKED_BY_MAX_CHARS).describe('Who is asking, shown as "<asked_by> asks"'), // the asker
    }, // end of the inputs
    annotations: { readOnlyHint: false, idempotentHint: false }, // not read-only, not idempotent
  }, (args) => run('ask_question', async () => { // the call
    const { question, delivered } = await o.useCases.askQuestion(args.question, args.asked_by, { options: args.options, urgency: args.urgency }); // the existing ask path, with its announcement
    return { question_id: question.id, delivered }; // delivered: a TV was connected
  })); // end of ask_question

  server.registerTool('get_answer', { // the answer to a question
    title: 'Get the answer', // display name
    description: 'Waits for or fetches the answer to a question from ask_question. Waits up to wait_seconds (0 to 25) and returns as soon as it is answered. status is pending, answered or expired (a newer question replaced it). Report answer_text word for word as the person\'s own answer.', // for the agent
    inputSchema: { // the tool's arguments
      question_id: z.string().min(1).max(64).describe('The question_id from ask_question'), // which question
      wait_seconds: z.number().int().min(0).max(25).default(0).describe('How long to wait for the answer, 0 to 25 whole seconds'), // the long-poll; whole seconds, so the timer always gets whole milliseconds
    }, // end of the inputs
    annotations: { readOnlyHint: true }, // read-only
  }, (args, extra) => run('get_answer', () => o.useCases.getAnswer(args.question_id, args.wait_seconds * 1000, extra.signal))); // ends early when the call is cancelled

  server.registerTool('get_recent_messages', { // what was said lately
    title: 'Get recent messages', // display name
    description: 'Lists what the person said recently, oldest first: text, time, kind (reply or spontaneous) and the question it answered, if any. A message of kind help, with no text, is the time the person asked for help on the TV. Optionally only messages after since, and at most limit (1 to 20) of them.', // for the agent
    inputSchema: { // the tool's arguments
      since: z.iso.datetime({ offset: true }).optional().describe('Only messages after this time (ISO 8601)'), // optional filter
      limit: z.number().int().min(1).max(20).default(20).describe('At most this many of the latest messages, 1 to 20'), // optional cap
    }, // end of the inputs
    annotations: { readOnlyHint: true }, // read-only
  }, (args) => run('get_recent_messages', () => ({ messages: o.useCases.recentMessages(args.since ?? null, args.limit) }))); // the list

  server.registerTool('add_profile_fact', { // context for the reply suggestions
    title: 'Add a profile fact', // display name
    description: `Remembers a fact about the person that helps suggest replies, such as "Sam prefers tea to coffee". At most ${FACT_MAX_CHARS} characters, without < or >; at most ${FACTS_MAX} facts. ${NEVER}`, // for the agent
    inputSchema: { // the tool's arguments, with the promptFacts limits
      fact: z.string().trim().min(1).max(FACT_MAX_CHARS).regex(NO_ANGLE_BRACKETS, 'must not contain < or >').describe(`The fact, at most ${FACT_MAX_CHARS} characters`), // the text
      category: z.enum(FACT_CATEGORIES).describe('likes, dislikes, people, routines or other'), // what kind
    }, // end of the inputs
  }, (args) => run('add_profile_fact', () => ({ fact_id: o.useCases.addProfileFact({ text: args.fact, category: args.category }) }))); // no hints

  return server; // ready to connect
} // end of toolServer

/** A JSON-RPC error without an id, as the SDK sends for transport-level refusals. */
function rpcError(res: Response, status: number, code: number, message: string): void { // HTTP status plus JSON-RPC body
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null }); // the SDK's shape
} // end of rpcError
