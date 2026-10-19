# Say When server

One Node.js service for the TV and for caregiver agents (plan §3.2, §4.3, §4.4): REST, the WebSocket question stream
and the trace stream for the TV, and an MCP endpoint for agents, over a ports-and-adapters core. It covers flow S1:
questions, their reply candidates and utterances, asked and answered through MCP.

- **Mock first.** `SAY_WHEN_MODE=mock` (the default) needs no AWS account. MockLlm makes deterministic candidates from
  the question text and the profile facts, and MockTts makes a short WAV tone, so the TV's playback path runs without
  AWS.
- **Live mode** (`SAY_WHEN_MODE=live`) uses Amazon Nova 2 Lite on Bedrock and Amazon Polly. It has been tested only
  against AWS SDK client mocks so far; see [Live mode](#live-mode) for what to set up.
- **In memory.** Nothing survives a restart; SQLite is cut for now.
- Bound to `127.0.0.1:8787`. The Android emulator reaches it as `10.0.2.2:8787`.

## Run

```bash
yarn workspace server start        # reads the repository's .env; mock mode unless SAY_WHEN_MODE=live
node tools/smoke-stream.mjs        # with the server running: posts a question and checks it reaches a WebSocket client
node tools/mcp-smoke.mjs           # with the server and the TV running: ask_question, answer Tea on the TV, get_answer
yarn workspace server test         # Vitest with coverage (gate: 80% lines), including the MCP conformance suite
yarn workspace server vitest run test/mcp.test.ts   # the MCP conformance suite alone (gate K4)
yarn workspace server typecheck    # strict tsc over the source and the tests
```

There is no build step: Node 24 runs the TypeScript source directly, as it does for `packages/switchclock`.

## Configuration

Copy `.env.example` to `.env` at the repository root. The server refuses to start without both tokens.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SAY_WHEN_MODE` | `mock` | `mock` or `live` |
| `SAY_WHEN_DEVICE_TOKEN` | none (required) | The TV's static bearer token, at least 16 characters; the TV's debug build embeds it |
| `SAY_WHEN_AGENT_TOKEN` | none (required) | Bearer token for caregiver or agent MCP clients, at least 16 characters and different from the device token |
| `SAY_WHEN_MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host names `/mcp` accepts, comma-separated (any port) |
| `SAY_WHEN_MCP_ALLOWED_ORIGINS` | `http://localhost:5173` | Browser origins `/mcp` accepts, comma-separated; requests without an `Origin` header are allowed |
| `AWS_PROFILE` | none | IAM Identity Center (SSO) profile; required in live mode |
| `AWS_REGION` | `eu-central-1` | Region for Bedrock and Polly |
| `SAY_WHEN_MODEL_ID` | `eu.amazon.nova-2-lite-v1:0` | Bedrock model or inference profile |
| `SAY_WHEN_VOICE` | `Brian` | Polly neural voice |

## API

Every route except `/healthz` and `/mcp` needs `Authorization: Bearer <SAY_WHEN_DEVICE_TOKEN>`: a missing or wrong
token gets 401, and the agent token gets 403, so an agent can never post an answer. Errors are
`application/problem+json` (RFC 9457). These routes have no Host check: the emulator reaches the server as `10.0.2.2`.

| Method and path | Purpose |
| --- | --- |
| `GET /v1/stream` (WebSocket) | Events: `question.created`, `question.candidates`, `ping` (every 25 s). On connect, a TV first gets `question.created` for the newest question, if it is unanswered and was asked in the last 2 minutes, with its current candidates; nothing otherwise |
| `POST /v1/questions` | Dev endpoint for `tools/smoke-stream.mjs`; agents use `ask_question`. Body: `text` (at most 200 characters), `asked_by` (at most 40). Returns 201 with the question |
| `POST /v1/utterances` | Commits a reply. Needs an `Idempotency-Key` header. Body: `question_id` (or null), `question_text` (optional; the TV's fixture question, at most 200 characters, or null; ignored when `question_id` names a question), `text`, `clicks`, `duration_ms`. Returns 201, or 200 with the same utterance for a repeated key |
| `GET /v1/utterances/{id}/audio` | The reply's audio: Polly's MP3 (`audio/mpeg`), or the mock's WAV tone (`audio/wav`) in mock mode. 404 when there is none |
| `GET /v1/trace` (SSE) | Spans `{id, at, hop, operation, duration_ms, mode}`, plus `dropped` (a count) on `server→llm`: the last 500 first, then live. Never message text |
| `GET /healthz` | Liveness, no token |

**Question lifecycle.** A household has one open question: asking a new one expires any earlier unanswered one
(`get_answer` then reports `expired`). A reply that arrives later for an expired question is still stored, with its
question, but the question stays expired.

**Default replies.** They fit the question. A yes/no question (one that starts with an auxiliary verb such as do, is,
can, would or shall, or its negative, and has no " or ") gets eight: Yes, No and Not now first, then Not sure, Ask me
later, Tell me more, Thank you and Maybe. A choice question (with " or ") and an open question (anything else, such as
what, where or how) get the same list without Yes and No: six, with Not now and Not sure first.

**Reply pipeline** (plan §4.3, §4.6). Asking without options stores the question and pushes `question.created` straight
away, with the default replies that fit it. It then calls the model within a 3.5 s budget, with
the six latest turns (each the question it answered, if any, then the reply), the local time and the household's
profile facts. The facts are quoted as data between `<facts>` and `</facts>`, never as instructions: at most 20, each
at most 120 characters and in one of the categories likes, dislikes, people, routines or other; any other fact is left
out. The model's output is validated against the schema per candidate, then trimmed, capped at 60 characters,
de-duplicated case-insensitively and filtered for banned terms (whole words, any case); the `server→llm` span counts
the dropped candidates as `dropped`, never their text. The rest are filled up (to at most eight) with the defaults that
fit the question and that no candidate already says (a candidate "I'm not sure" keeps out the default Not sure), and if
none has the intent `later`, the weakest gives way to Not now (or Ask me later, if Not now is already
there). Priors are computed from the scores with switchclock's `priors()`, and the result is pushed as
`question.candidates`. On a timeout, an error or unusable output, the defaults stay. Profile facts with `<` or `>`
are left out, so no fact can close the `<facts>` block.

**Asking with options.** The replies are exactly the options, in their order and without repeats, then Not now and
Not sure: at most eight, with no model call. `question.candidates` follows `question.created` at once with the same
list, so the TV starts its highlight without waiting out the budget.

**Speech pipeline.** `POST /v1/utterances` synthesises speech on commit. A Polly failure commits the reply without
audio; past the daily cap, the reply gets the mock's tone.

**Cost guard.** At most 1,000 model calls and 100,000 Polly characters per UTC day; beyond that, mock output.

## MCP

`/mcp` on the same process and port is an MCP server for caregiver agents (plan §4.4), built with
`@modelcontextprotocol/sdk` 1.32.1 and its Streamable HTTP transport.

- **Sessions.** `initialize` (a POST without `Mcp-Session-Id`) opens a session with a random UUID, returned in the
  `Mcp-Session-Id` header. Later POST, GET (SSE stream) and DELETE requests carry it. DELETE ends the session; its id
  then gets 404, as does any id the server never issued. Any other request without a session id gets 400. Sessions
  live in memory and end only on DELETE or a restart.
- **Protocol version.** The SDK negotiates it at `initialize`: 2025-11-25 is the latest. On later requests an
  unsupported `MCP-Protocol-Version` header gets 400; a missing one is accepted.
- **Access.** Only `Authorization: Bearer <SAY_WHEN_AGENT_TOKEN>`: a missing or wrong token gets 401 (with
  `WWW-Authenticate: Bearer`), the device token 403. Tokens are compared in constant time. Against DNS rebinding,
  the Host name (any port) must be in `SAY_WHEN_MCP_ALLOWED_HOSTS` (the SDK's `hostHeaderValidation`), and an `Origin`
  header, when there is one, must be in `SAY_WHEN_MCP_ALLOWED_ORIGINS`; otherwise 403. Bodies are JSON, at most 32 KB.
  The token check answers with problem+json; the Host, Origin and session checks answer with a JSON-RPC error, as the
  SDK does.
- **Trace.** Each tool call adds a span `{hop: "mcp", operation: <tool name>, duration_ms, mode}` when its response
  closes, including calls refused by validation; a call to a tool that does not exist is `unknown`. Never arguments or
  results.

| Tool | Inputs | Output | Hints |
| --- | --- | --- | --- |
| `ask_question` | `question` (at most 200 characters), `options` (optional: 1 to 6, each at most 40), `urgency` (`normal` or `high`; default `normal`), `asked_by` (at most 40) | `question_id`, `delivered` (a TV was connected) | not read-only, not idempotent |
| `get_answer` | `question_id`, `wait_seconds` (0 to 25 whole seconds; default 0) | `status` (`pending`, `answered` or `expired`), `answer_text`, `answered_at`, `clicks` | read-only |
| `get_recent_messages` | `since` (optional ISO 8601 time; only later messages), `limit` (1 to 20; default 20) | `messages`: the latest, oldest first, each `text`, `time`, `kind` (`reply` or `spontaneous`), `question_text` (or null) | read-only |
| `add_profile_fact` | `fact` (at most 120 characters, no `<` or `>`), `category` (`likes`, `dislikes`, `people`, `routines` or `other`) | `fact_id` | none |

`get_answer` long-polls: it returns as soon as the answer is stored (after its speech), when the question expires, or
when the wait ends. `add_profile_fact` refuses a 21st fact; the next question's replies use the new fact. Every tool
answers with its output as JSON text and as `structuredContent`. Invalid inputs, an unknown `question_id` and a 21st
fact are tool errors (`isError: true`) with a short reason; the session stays usable.

**Conformance suite** (`test/mcp.test.ts`, gate K4). It runs the official SDK client over Streamable HTTP against a
real server listening on a free loopback port, and raw HTTP for what a client would not send: initialise and session
id, `tools/list` with schemas and hints, every tool, the long-poll (answered when the TV commits during the wait,
pending after a 1 s wait, expired after a newer question), DELETE then 404, a foreign Origin or Host (403), no token
(401), the device token on `/mcp` and the agent token on the TV's routes (403), an unsupported protocol header (400),
invalid inputs as tool errors, and an added fact changing the mock ranking. Run it with
`yarn workspace server vitest run test/mcp.test.ts`, or as part of `yarn workspace server test`.

To try it with the MCP Inspector v2 CLI (with `--stored-auth-only` it never starts an OAuth flow; it stores no
headers), with the token loaded from `.env` into the shell first:

```bash
npx @modelcontextprotocol/inspector@2.11.0 --cli --server-url http://localhost:8787/mcp --transport http --header "Authorization: Bearer $SAY_WHEN_AGENT_TOKEN" --method tools/list --stored-auth-only
```

## Live mode

Not tried against AWS yet. To try it:

1. In IAM Identity Center, create a permission set with:
   - `bedrock:InvokeModel` on `arn:aws:bedrock:eu-central-1:<account-id>:inference-profile/eu.amazon.nova-2-lite-v1:0`,
     and on `arn:aws:bedrock:<region>::foundation-model/amazon.nova-2-lite-v1:0` for each Region the EU profile routes
     to: eu-central-1, eu-north-1, eu-south-1, eu-south-2, eu-west-1 and eu-west-3.
   - `polly:SynthesizeSpeech` on `*`.
2. Run `aws configure sso` to create a profile, then `aws sso login --profile <profile>`.
3. In `.env`, set:
   - `SAY_WHEN_MODE=live`
   - `AWS_PROFILE=<profile>`
   - `AWS_REGION=eu-central-1`
   - `SAY_WHEN_MODEL_ID=eu.amazon.nova-2-lite-v1:0`
   - `SAY_WHEN_VOICE` set to a neural voice that this check lists:
     `aws polly describe-voices --engine neural --region eu-central-1 --profile <profile>`.

The SDK's default credential chain resolves the SSO profile. The server never reads or stores access keys, and when a
profile is set the chain skips environment-variable keys.

## Layout

`src/domain` (model, candidate pipeline, daily cap) · `src/application` (use-cases) · `src/ports` (interfaces) ·
`src/adapters` (Bedrock, Polly, mocks, memory store, WebSocket notifier, trace sink) · `src/interfaces` (REST,
WebSocket, SSE, MCP) · `src/compose.ts` (wiring) · `src/main.ts` (entry point).
