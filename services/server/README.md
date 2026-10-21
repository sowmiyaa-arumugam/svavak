# SvaVāk server

*Your Voice. Your Choice*

One Node.js service for the TV and for caregiver agents (plan §3.2, §4.3, §4.4): REST, the WebSocket question stream
and the trace stream for the TV, and an MCP endpoint for agents, over a ports-and-adapters core. It covers flow S1:
questions, their reply candidates and utterances, asked and answered through MCP. It also takes the TV's help requests
(flow S3, without acknowledgement).

- **Mock first.** `SVAVAK_MODE=mock` (the default) needs no AWS account. MockLlm makes deterministic candidates from
  the question text and the profile facts, and MockTts makes a short WAV tone, so the TV's playback path runs without
  AWS.
- **Live mode** (`SVAVAK_MODE=live`) uses Amazon Nova 2 Lite on Bedrock and Amazon Polly. It ran live on
  2026-10-21 (gate K3 passed; see [Live mode](#live-mode)), and is tested against AWS SDK client mocks.
- **In memory.** Nothing survives a restart; SQLite is cut for now.
- Bound to `127.0.0.1:8787`. The Android emulator reaches it as `10.0.2.2:8787`.

## Run

```bash
yarn workspace server start        # reads the repository's .env; mock mode unless SVAVAK_MODE=live
node tools/smoke-stream.mjs        # with the server running: posts a question and checks it reaches a WebSocket client
node tools/mcp-smoke.mjs           # with the server and the TV running: ask_question, answer Tea on the TV, get_answer
node tools/k3-eval.mjs             # with the server running: the 30 evaluation questions, gate K3 timing, test-results/k3/eval.md
yarn workspace server test         # Vitest with coverage (gate: 80% lines), including the MCP conformance suite
yarn workspace server vitest run test/mcp.test.ts   # the MCP conformance suite alone (gate K4)
yarn workspace server typecheck    # strict tsc over the source and the tests
```

There is no build step: Node 24 runs the TypeScript source directly, as it does for `packages/switchclock`.

## Configuration

Copy `.env.example` to `.env` at the repository root. The server refuses to start without both tokens.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SVAVAK_MODE` | `mock` | `mock` or `live` |
| `SVAVAK_DEVICE_TOKEN` | none (required) | The TV's static bearer token, at least 16 characters; the TV's debug build embeds it |
| `SVAVAK_AGENT_TOKEN` | none (required) | Bearer token for caregiver or agent MCP clients, at least 16 characters and different from the device token |
| `SVAVAK_MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host names `/mcp` accepts, comma-separated (any port) |
| `SVAVAK_MCP_ALLOWED_ORIGINS` | `http://localhost:5173` | Browser origins `/mcp` accepts, comma-separated; requests without an `Origin` header are allowed |
| `AWS_PROFILE` | none | An `aws login` or IAM Identity Center (SSO) profile; required in live mode |
| `AWS_REGION` | `eu-central-1` | Region for Bedrock, and for Polly unless `SVAVAK_POLLY_REGION` is set |
| `SVAVAK_MODEL_ID` | `eu.amazon.nova-2-lite-v1:0` | Bedrock model or inference profile |
| `SVAVAK_VOICE` | `Brian` | Polly voice; it must exist for the engine in Polly's region |
| `SVAVAK_POLLY_REGION` | `AWS_REGION` | Region for Polly |
| `SVAVAK_POLLY_ENGINE` | `neural` | `neural` or `standard`; standard where the region has no neural voices, such as eu-north-1 |

## API

Every route except `/healthz` and `/mcp` needs `Authorization: Bearer <SVAVAK_DEVICE_TOKEN>`: a missing or wrong
token gets 401, and the agent token gets 403, so an agent can never post an answer. Errors are
`application/problem+json` (RFC 9457). These routes have no Host check: the emulator reaches the server as `10.0.2.2`.

**The studio in a browser** ([apps/studio](../../apps/studio), origin `http://localhost:5173`):
- **Origin.** `GET /v1/trace` and the `GET /v1/stream` upgrade accept no `Origin` (tools send none), the studio's
  (`http://localhost:5173`) or the emulator TV's (`http://10.0.2.2:8787`: React Native's Android WebSocket sends the URL's
  own origin). Any other, a DNS-rebound page's included, gets 403 before the token is checked.
- **CORS.** On `/v1/*`, a request from the studio's origin gets `Access-Control-Allow-Origin` for it. Its preflights
  (`OPTIONS`, which browsers send without a token) are answered with 204, allowing `GET` and `POST` with
  `Authorization`, `Content-Type` and `Idempotency-Key`. Other origins get no CORS headers.
- **Stream token.** Browsers cannot set a WebSocket's headers, so `/v1/stream` also takes the device token as the
  subprotocol pair `bearer, <token>`, in that order and nothing else. The server answers with `bearer`, never the
  token. Like the header, a wrong or missing token gets 401 and the agent token 403.

| Method and path | Purpose |
| --- | --- |
| `GET /v1/stream` (WebSocket) | Events: `question.created`, `question.candidates`, `ping` (every 25 s). On connect, a TV first gets `question.created` for the newest question, if it is unanswered and was asked in the last 2 minutes, with its current candidates; nothing otherwise |
| `POST /v1/questions` | Dev endpoint for `tools/smoke-stream.mjs`; agents use `ask_question`. Body: `text` (at most 200 characters), `asked_by` (at most 40). Returns 201 with the question |
| `POST /v1/utterances` | Commits a reply. Needs an `Idempotency-Key` header. Body: `question_id` (or null), `question_text` (optional; the TV's fixture question, at most 200 characters, or null; ignored when `question_id` names a question), `text`, `clicks`, `duration_ms`. Returns 201, or 200 with the same utterance for a repeated key |
| `POST /v1/alerts` | A help request: Sam held the switch for 2 s or chose Help on the TV. Needs an `Idempotency-Key` header; no body. Returns 201 with `{id, created_at}`, or 200 with the same request for a repeated key, which raises no second alert. It is kept in memory and sent on `GET /v1/trace` as one span, `{hop: "server→caregiver", operation: "help.requested"}`, which the studio's caregiver panel shows and speaks as an alert. Its log line `help.requested` carries its id only. It neither answers nor closes the open question |
| `GET /v1/utterances/{id}/audio` | The reply's audio: Polly's MP3 (`audio/mpeg`), or the mock's WAV tone (`audio/wav`) in mock mode. 404 when there is none |
| `GET /v1/trace` (SSE) | Spans `{id, at, hop, operation, duration_ms, mode}`, plus `dropped` (a count) on `server→llm`: the last 500 first, then live. Never message text |
| `GET /healthz` | Liveness, no token |

**Question lifecycle.** A household has one open question: asking a new one expires any earlier unanswered one
(`get_answer` then reports `expired`). A reply that arrives later for an expired question is still stored, with its
question, but the question stays expired.

**Default replies.** They fit the question, whose kind is decided without a leading name ("Sam, ..."):
- A question ending "... or not?" is yes/no.
- Otherwise " or " makes a choice question.
- A question starting with a wh-word (what, which, who, whom, whose, where, when, why or how) is open.
- A text with no "?" anywhere, such as "Tell me about your day.", is open too.
- Everything else is yes/no, "Tea?" included.

A yes/no question gets eight defaults, shown as Yes, No, Thank you, then the fallbacks Not now, Not sure, Ask me later,
Tell me more and Maybe. An open question gets four: You decide, then Not sure, Tell me more and Not now. A choice
question gets the same four after a short reply for each option (Tea, please and Coffee, please for "Would you like
tea or coffee?").

**Basic answers.** The first four replies always cover the question's basic answers: a yes-intent and a no-intent
reply for a yes/no question; for a choice question, a reply naming each option, that is the word before " or " and
the first word after it that is not an article (a, an, the or some). A side whose word is a function word names no
option: a pronoun or question word, an auxiliary or modal verb (with their short forms, such as "you're" and
"don't"), "not", "something", "anything", "nothing" or "else", so "Would you like more or are you full?" has the
option "more" alone, and "Cricket or something else?" has "cricket" alone. Such a word counts only in lower case
("I" aside) or as the question's first word, as a capital marks a name: "April or May?" has both options. MockLlm
names a choice's options the same way ("Soup or a sandwich for lunch?" gets "Soup, please" and "A sandwich, please").
A reply with the intent `no`, `later` or
`clarify` names an option without choosing it ("No, not the news"), so it does not count, and neither does one that
turns it down in its words ("Tea, not coffee", "instead of coffee", "rather than coffee"). A reply that says the
default itself counts whatever its intent, so no card is shown twice. When no reply gives a basic answer, a short
default does: Yes, please, No, thanks, or the option with "please" ("Coffee, please", "The news,
please"), taking the weakest other reply's place if the list is full. A basic answer missing from the first four takes
the place of the lowest-ranked of them, which moves down one place. Questions asked with options are left as they are.

**Reply pipeline** (plan §4.3, §4.6). Asking without options stores the question and pushes `question.created` straight
away, with the default replies that fit it. It then calls the model within a 3.5 s budget, with
the six latest turns (each the question it answered, if any, then the reply), the local time and the household's
profile facts. The question, the turns and the facts are quoted as data, never as instructions: each text is a JSON
string with `<` and `>` escaped, between `<question>`, `<conversation>` and `<facts>` tags. The question comes last,
after the time, the turns (marked as background, not replies to the current question) and the facts, and the rules keep
every reply on the question's subject: no turn or fact about another subject, no earlier answer repeated for a different
question, no separate facts merged into one reply. With the question first, Nova 2 Lite repeated earlier film answers
to a dinner question (B8.1; see `docs/friction-log.md`). The facts are at most 20,
each at most 120 characters and in one of the categories likes, dislikes, people, routines or other; any other fact
is left out. The model's output is validated against the schema per candidate, then trimmed (a closing full stop
too, so no card ends in one; "?" and "!" stay), capped at 60 characters,
de-duplicated case-insensitively and filtered for banned terms (whole words in any case, and their -s, -es, -ed, -ing
and -er forms, the last three also after a doubled last letter); the `server→llm` span counts the dropped candidates
as `dropped`, never their text. Each live model call logs one `llm.usage` line: its input and output tokens, latency
and stop reason, never text. The rest are filled up (to at most eight) with the defaults that fit the question and that
no candidate already says (a candidate "I'm not sure" keeps out the default Not sure), and the basic answers are
added where missing (above). If none has the intent `later`, the weakest that is not a basic answer gives way to Not
now (or, for a yes/no question, Ask me later if Not now is already there). The
list is ordered best guess first, but a fallback never leads: every reply with the intent `later` or `clarify` ("I
don't know yet", Not sure, Not now) comes after every other reply, unless they are all there is; and the basic answers
are in the first four. Priors are computed from the scores with switchclock's `priors()`, and the result is pushed as
`question.candidates`. On a timeout, an error or unusable output, the defaults stay. Profile facts with `<` or `>`
are left out, so no fact can close the `<facts>` block.

**Asking with options.** The replies are the options (trimmed, without a closing full stop), in their order and
without repeats, then Not now and Not sure: at most eight, with no model call. `question.candidates` follows `question.created` at once with the same
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
  live in memory and end on DELETE, after 30 minutes without requests, or on a restart.
- **Protocol version.** The SDK negotiates it at `initialize`: 2025-11-25 is the latest. On later requests an
  unsupported `MCP-Protocol-Version` header gets 400; a missing one is accepted.
- **Access.** Only `Authorization: Bearer <SVAVAK_AGENT_TOKEN>`: a missing or wrong token gets 401 (with
  `WWW-Authenticate: Bearer`), the device token 403. Tokens are compared in constant time. Against DNS rebinding,
  the Host name (any port) must be in `SVAVAK_MCP_ALLOWED_HOSTS` (the SDK's `hostHeaderValidation`), and an `Origin`
  header, when there is one, must be in `SVAVAK_MCP_ALLOWED_ORIGINS`; otherwise 403. Bodies are JSON, at most 32 KB.
  The token check answers with problem+json; the Host, Origin and session checks answer with a JSON-RPC error, as the
  SDK does.
- **Trace.** Each tool call adds a span `{hop: "mcp", operation: <tool name>, duration_ms, mode}` when its response
  closes, including calls refused by validation; a call to a tool that does not exist is `unknown`. Never arguments or
  results.

| Tool | Inputs | Output | Hints |
| --- | --- | --- | --- |
| `ask_question` | `question` (at most 200 characters), `options` (optional: 1 to 6, each at most 40), `urgency` (`normal` or `high`; default `normal`), `asked_by` (at most 40) | `question_id`, `delivered` (a TV was connected) | not read-only, not idempotent |
| `get_answer` | `question_id`, `wait_seconds` (0 to 25 whole seconds; default 0) | `status` (`pending`, `answered` or `expired`), `answer_text`, `answered_at`, `clicks` | read-only |
| `get_recent_messages` | `since` (optional ISO 8601 time; only later messages), `limit` (1 to 20; default 20) | `messages`: the latest, oldest first, each `text`, `time`, `kind` (`reply`, `spontaneous` or `help`), `question_text` (or null). A `help` message is a help request from the TV: its `time`, with `text` and `question_text` null | read-only |
| `add_profile_fact` | `fact` (at most 120 characters, no `<` or `>`), `category` (`likes`, `dislikes`, `people`, `routines` or `other`) | `fact_id` | none |

`get_answer` long-polls: it returns as soon as the answer is stored (after its speech), when the question expires, or
when the wait ends. `add_profile_fact` refuses a 21st fact; the next question's replies use the new fact. Every tool
answers with its output as JSON text and as `structuredContent`. Invalid inputs, an unknown `question_id` and a 21st
fact are tool errors (`isError: true`) with a short reason; the session stays usable.

**Conformance suite** (`test/mcp.test.ts`, gate K4). It runs the official SDK client over Streamable HTTP against a
real server listening on a free loopback port, and raw HTTP for what a client would not send: initialise and session
id, `tools/list` with schemas and hints, every tool, the long-poll (answered when the TV commits during the wait,
pending after a 1 s wait, expired after a newer question), `get_recent_messages` with more messages than its limit (the
newest, oldest first), a help request from the TV listed as a `help` message while the open question stays open,
DELETE then 404, a session ending after its idle time, a foreign Origin or Host (403), no token
(401), the device token on `/mcp` and the agent token on the TV's routes (403), an unsupported protocol header (400),
invalid inputs as tool errors, and an added fact changing the mock ranking. Run it with
`yarn workspace server vitest run test/mcp.test.ts`, or as part of `yarn workspace server test`.

To try it with the MCP Inspector v2 CLI (with `--stored-auth-only` it never starts an OAuth flow; it stores no
headers), with the token loaded from `.env` into the shell first:

```bash
npx @modelcontextprotocol/inspector@2.11.0 --cli --server-url http://localhost:8787/mcp --transport http --header "Authorization: Bearer $SVAVAK_AGENT_TOKEN" --method tools/list --stored-auth-only
```

## Live mode

**Live run, 2026-10-21** (Nova 2 Lite in eu-central-1, Polly standard Brian in eu-north-1, the emulator TV):
- Gate K3 passed: ask to `question.candidates` p50 1,024 ms and p95 1,559 ms over the 30 evaluation questions
  (gate: p50 at most 2.0 s), with the automatic checks passing for all 30 and the seeded fact in the top four for 3 of 3.
- Polly's speech played on the TV for 10 of 10 replies: from the end of the 2 s cancel window to audio start, p50
  290 ms and p95 879 ms (FR-04 target: 1.2 s p50).
- An `aws login` session lasts about an hour; sign in again just before a live run.

To set it up:

1. Sign in with `aws login --profile <profile>` (AWS CLI 2.32 or later), or create an IAM Identity Center profile with
   `aws configure sso` and sign in with `aws sso login --profile <profile>`. The identity needs `bedrock:InvokeModel`
   on the EU inference profile and on `amazon.nova-2-lite-v1:0` in each Region it routes to (eu-central-1,
   eu-north-1, eu-south-1, eu-south-2, eu-west-1 and eu-west-3), and `polly:SynthesizeSpeech`.
2. In `.env`, set:
   - `AWS_PROFILE=<profile>`
   - `AWS_REGION=eu-central-1`
   - `SVAVAK_MODEL_ID=eu.amazon.nova-2-lite-v1:0`
   - `SVAVAK_VOICE`, `SVAVAK_POLLY_REGION` and `SVAVAK_POLLY_ENGINE`: a voice this check lists for the engine,
     for example `aws polly describe-voices --region eu-north-1 --language-code en-GB --profile <profile>`, which lists
     Amy, Brian and Emma with the standard engine only.
3. Start the server with `SVAVAK_MODE=live` set in the shell for that run; the environment overrides `.env`.

The SDK's default credential chain resolves the profile: `aws login` profiles since SDK 3.936.0 (installed: 3.1146.0),
SSO profiles always. The server never reads or stores access keys, and when a profile is set the chain skips
environment-variable keys.

The model call uses a forced tool call (`toolChoice` on `suggest_replies`), not Bedrock's structured outputs, which
the Nova 2 Lite model card lists as unsupported. Its settings are `temperature` 0 and `maxTokens` 512, settled
on the live run. The Nova 2 docs disagree on both: temperature 0 for tool calls (Troubleshooting) against 0.7 with
topP 0.9 (prompting guide), and a maximum of 5,000 output tokens (request schema) against 64K or 65,000 (model card,
Converse page). On the live run all 33 calls at temperature 0 ended in the forced tool call (stop reason `tool_use`),
with valid candidates, and used 138 to 187 output tokens (from the `llm.usage` log lines), so 512 leaves 2.7 times
headroom; input was about 1,300 tokens per call and Bedrock's own latency 744 to 1,551 ms.

## Evaluation set

`test/evalSet.ts` holds the evaluation set of plan §4.6: 30 synthetic household questions (twelve yes/no, eight choice,
ten open), three of which should bring up a seeded demo fact (tea, cricket, lunch at one). Its automatic checks run
on every `yarn workspace server test` against mock output, through the real pipeline: schema (raw and pushed),
at most 60 characters, intent coverage (a later reply always, yes and no for a yes/no question) and no banned terms.

`node tools/k3-eval.mjs` asks the 30 questions on a running server, one at a time, and takes the time from each ask to
its `question.candidates` from the server's own trace span. It writes `test-results/k3/eval.md`: each question's top
four replies, the checks, the time, whether the fact showed, and an empty column for judging whether an acceptable
reply is in the top four (target: 25 of 30). It prints p50 and p95 and exits 1 when gate K3 (p50 at most 2.0 s) fails;
a question without candidates counts as the slowest.

## Layout

`src/domain` (model, candidate pipeline, daily cap) · `src/application` (use-cases) · `src/ports` (interfaces) ·
`src/adapters` (Bedrock, Polly, mocks, memory store, WebSocket notifier, trace sink) · `src/interfaces` (REST,
WebSocket, SSE, MCP) · `src/compose.ts` (wiring) · `src/main.ts` (entry point).
