# Say When agent

The simulated Alexa+ of plan §4.5: a [Strands](https://strandsagents.com) agent that reaches Sam only through the
[server](../server)'s MCP tools. It streams each caregiver turn as server-sent events, for the studio's caregiver panel
(plan §4.7).

- **Tools from MCP.** At start-up the agent connects to `http://127.0.0.1:8787/mcp` with Strands' `MCPClient` over
  Streamable HTTP, sending `SAY_WHEN_AGENT_TOKEN`, and lists the server's tools: `ask_question`, `get_answer`,
  `get_recent_messages` and `add_profile_fact`. The session stays open until the agent stops.
- **One Strands agent per turn.** Every turn runs the real Strands tool loop with a fresh `Agent` and no memory of
  earlier turns; the model and the tool list are shared.
- **Mock first.** `SAY_WHEN_MODE=mock` (the default) needs no AWS account. Live mode is tested only with a stub model
  so far.
- Bound to `127.0.0.1:8790`. Logs are JSON lines without caregiver text or answers.

## Set-up and run

Requirements: [uv](https://docs.astral.sh/uv/). It installs Python 3.12 itself when the machine has no 3.12.

```bash
cd services/agent
uv sync                                  # Python 3.12 and the exact versions in uv.lock
yarn workspace server start              # first, in another terminal: the MCP server on 127.0.0.1:8787
uv run python -m say_when_agent          # the agent; reads the repository's .env
uv run pytest                            # tests with coverage (gate: 80%), against a stub MCP server
uv run ruff check .                      # lint
```

The agent stops at start-up with one line saying why, for example
`say-when-agent: the MCP server at http://127.0.0.1:8787/mcp is unreachable: is it running? (yarn workspace server start)`,
or `... refused SAY_WHEN_AGENT_TOKEN (HTTP 401): use the server's agent token from the repository's .env`.
Any other HTTP error is named as such (`... answered HTTP 500 at initialize`).

Pinned: `strands-agents` 1.61.1, `mcp` 1.30.0, `boto3[crt]` 1.43.114, `starlette` 1.9.0, `uvicorn` 0.54.0 and
`python-dotenv` 1.2.4.
- `mcp` 1.30.0 negotiates protocol 2025-11-25, the server's. The 2.x line drops the initialize handshake and sessions.
- The `crt` extra lets boto3 use `aws login` profiles.

## Configuration

It reads the repository's `.env`, and the process environment overrides it. The names are those of `.env.example`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SAY_WHEN_MODE` | `mock` | `mock` or `live`, as the server's |
| `SAY_WHEN_AGENT_TOKEN` | none (required) | The server's agent token for `/mcp`: at least 16 visible ASCII characters, no spaces; never logged or printed |
| `AWS_PROFILE` | none | IAM Identity Center (SSO) profile; required in live mode, which refuses to start while `AWS_BEARER_TOKEN_BEDROCK` (a Bedrock API key) is set |
| `AWS_REGION` | `eu-central-1` | Bedrock region |
| `SAY_WHEN_MODEL_ID` | `eu.amazon.nova-2-lite-v1:0` | Bedrock model or inference profile |

## Modes

**Live.** A Strands `BedrockModel` with the model set explicitly to `SAY_WHEN_MODEL_ID`, at temperature 0.2. Its region
is `AWS_REGION`, and its credentials come from the `AWS_PROFILE` session, never from access keys. The system prompt is
the agent policy of plan §4.6:

- Call `ask_question` (as Alex), then `get_answer` with a wait of at most 20 s.
- If the answer is still pending, say that Sam hasn't answered yet.
- Report an answer word for word as "Sam says: …", and never invent or guess one.
- Keep questions short, in the second person, and pass options only when the caregiver named them.
- Never ask for passwords, health records or financial data.

**Speech guard.** The model proposes; code decides what is spoken, so the agent never speaks an answer the TV didn't
commit. It applies in both modes (in mock mode it changes nothing).
- `<thinking>…</thinking>` spans, which Nova can write into its text, are removed, across lines. A reply with nothing
  else left says nothing.
- When the turn called `get_answer` or `get_recent_messages`, the speech is composed by code from the latest such
  result, as in mock mode: "Sam says: …" with the answer word for word, "Sam hasn't answered yet.", the recap of what
  Sam said, or "Sorry, that didn't work." for a tool error. The model's own words are dropped.
- Otherwise a reply that reports Sam ("Sam says:" or "Sam said:", any case) becomes "Sam hasn't answered yet.".
  Anything else is spoken as the model wrote it.

The `tool_call` and `tool_result` events are not changed.

It has not been run against AWS yet: on 2026-10-20 Bedrock refused calls while the AWS account was being verified.
Strands' `BedrockModel` streams (ConverseStream) by default and leaves `<thinking>` text in place, hence the guard
below.

**Mock.** The same agent and tool loop, driven by `MockModel`, a deterministic Strands model provider
([say_when_agent/mock_model.py](say_when_agent/mock_model.py)). It reads the caregiver's words and the tool results
from the conversation and calls the tools as follows. Questions are asked as Alex, with "he (she, they) wants" turned
into "would you like"; the rest is kept as typed. Case and closing punctuation are ignored.

| Caregiver says | Tool calls | Speech |
| --- | --- | --- |
| "Ask Sam if he wants tea or coffee" | `ask_question` "Would you like tea or coffee?" with options Tea and Coffee, then `get_answer` (wait 20 s) | "Sam says: Tea." or "Sam hasn't answered yet." |
| "Ask Sam if he wants a walk" | `ask_question` "Would you like a walk?" without options (the server adds Yes and No), then `get_answer` | as above |
| "Ask Sam what he wants to watch" | `ask_question` "What would you like to watch?" without options, then `get_answer` | as above |
| "What did Sam say?" | `get_recent_messages` (limit 5) | `To "Would you like tea or coffee?", Sam said: Tea. To "Shall we go out?", Sam said: Not now.` (newest first), or "Sam hasn't said anything recently." |
| "Remember that Sam loves gardening" | `add_profile_fact` "Sam loves gardening", category `likes` (`dislikes` for hates, dislikes or a negated like, `other` otherwise) | "Noted." |
| Anything else | none | "In mock mode I can ask Sam a question, tell you what Sam said, or remember something about Sam." |

Options are split at " or " and at commas, and he, she and they are all understood. A tool error gets "Sorry, that
didn't work."

The recap speaks the newest one to three messages, newest first, one sentence each:
`To "<question>", Sam said: <reply>.`, or `Sam said: <reply>.` for a message without a question. A reply said more
than once (case and spacing ignored) is spoken once, with its newest question.

## Interface

`POST /agent/turn` with the JSON body `{"text": "..."}`: a non-empty string of at most 500 characters, or else 400 (413
for a body over 4 KiB). The response is `text/event-stream`, with one event per frame (`event: <name>`, then
`data: <JSON>`):

| Event | Data | When |
| --- | --- | --- |
| `tool_call` | `name`, `input` | The model calls a tool, before it runs |
| `tool_result` | `name`, `ok` | The tool finished; `ok` is false for a tool error. Never its content |
| `speech` | `text` | The agent's reply, to be spoken |
| `error` | `message` | The model or a tool failed; the turn ends |
| `done` | `{}` | Always last |

```bash
curl -N -X POST http://127.0.0.1:8790/agent/turn -H "Content-Type: application/json" -d '{"text": "Ask Sam if he wants tea or coffee"}'
```

**Access.** The endpoint is loopback-only, with no token of its own; the studio's authentication will be settled with
the studio.
- **Host.** It must be `localhost` or `127.0.0.1` (any port), or the request gets 403 (DNS-rebinding protection).
- **Origin.** An `Origin` header, when there is one, must be `http://localhost:5173` (the studio), or the request gets
  403, preflight included. Requests without `Origin`, such as curl's, are allowed.
- **CORS.** Only the studio's origin gets CORS headers, for `POST` with `Content-Type`.

A browser reads the stream with `fetch()` and a stream reader, because `EventSource` only sends GET.

**Logs.** One JSON line at start-up (`agent.started`, with the mode and the tool names). Each turn adds one line
(`turn.done`), plus uvicorn's access line. That line has the tools called (a name the model made up is logged as
`unknown`), the outcome (`ok`, `cancelled` when the client went away first, or the error's type), the duration, and
the turn's tokens for the cost report: `input_tokens` and `output_tokens`, summed over all its model calls from
Bedrock's usage metadata (Strands' `accumulated_usage`). They are 0 in mock mode, and when the turn was cancelled or
failed. Never caregiver text, answers or the token. Strands' own log lines are switched off, because they can quote
model-written tool input or tool names; the agent reports failures itself.

**Known limits.** No reconnect: after a server restart, or once the server has ended the MCP session after 30 minutes
without requests, restart the agent, because tool calls fail with the server's 404 until then. Tool calls have no timeout of their own. A second SSE stream for help alerts (plan §4.5) comes with the
alerts.

## Layout

| Path | Contents |
| --- | --- |
| `say_when_agent/config.py` | Settings |
| `say_when_agent/mock_model.py` | The mock model provider |
| `say_when_agent/service.py` | The MCP session, the policy and the turns |
| `say_when_agent/app.py` | The HTTP interface and `main()` |
| `tests/` | pytest, against `tests/stub_server.py`: FastMCP with the server's four tool names, input types, limits and required fields, and its bearer-token check |
