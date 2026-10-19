# Say When server

One Node.js service for the TV (plan §3.2, §4.3): REST, the WebSocket question stream and the trace stream, over a
ports-and-adapters core. This first cut covers flow S1 only: questions, their reply candidates and utterances.

- **Mock first.** `SAY_WHEN_MODE=mock` (the default) needs no AWS account. MockLlm makes deterministic candidates from
  the question text and MockTts makes no audio, so the TV skips playback.
- **Live mode** (`SAY_WHEN_MODE=live`) uses Amazon Nova 2 Lite on Bedrock and Amazon Polly. It has been tested only
  against AWS SDK client mocks so far; see [Live mode](#live-mode) for what to set up.
- **In memory.** Nothing survives a restart; SQLite is cut for now.
- Bound to `127.0.0.1:8787`. The Android emulator reaches it as `10.0.2.2:8787`.

## Run

```bash
yarn workspace server start        # reads the repository's .env; mock mode unless SAY_WHEN_MODE=live
node tools/smoke-stream.mjs        # with the server running: posts a question and checks it reaches a WebSocket client
yarn workspace server test         # Vitest with coverage (gate: 80% lines)
yarn workspace server typecheck    # strict tsc over the source and the tests
```

There is no build step: Node 24 runs the TypeScript source directly, as it does for `packages/switchclock`.

## Configuration

Copy `.env.example` to `.env` at the repository root. The server refuses to start without a device token.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SAY_WHEN_MODE` | `mock` | `mock` or `live` |
| `SAY_WHEN_DEVICE_TOKEN` | none (required) | Static bearer token, at least 16 characters; the TV's debug build embeds it |
| `AWS_PROFILE` | none | IAM Identity Center (SSO) profile; required in live mode |
| `AWS_REGION` | `eu-central-1` | Region for Bedrock and Polly |
| `SAY_WHEN_MODEL_ID` | `eu.amazon.nova-2-lite-v1:0` | Bedrock model or inference profile |
| `SAY_WHEN_VOICE` | `Brian` | Polly neural voice |

## API

Every route except `/healthz` needs `Authorization: Bearer <SAY_WHEN_DEVICE_TOKEN>`. Errors are
`application/problem+json` (RFC 9457).

| Method and path | Purpose |
| --- | --- |
| `GET /v1/stream` (WebSocket) | Events: `question.created`, `question.candidates`, `ping` (every 25 s) |
| `POST /v1/questions` | Temporary dev endpoint until the MCP server's `ask_question` exists. Body: `text` (at most 200 characters), `asked_by` (at most 40). Returns 201 with the question |
| `POST /v1/utterances` | Commits a reply. Needs an `Idempotency-Key` header. Body: `question_id` (or null), `text`, `clicks`, `duration_ms`. Returns 201, or 200 with the same utterance for a repeated key. `audio_url` is null in mock mode |
| `GET /v1/utterances/{id}/audio` | The reply's MP3 (`audio/mpeg`), or 404 when there is none |
| `GET /v1/trace` (SSE) | Spans `{id, at, hop, operation, duration_ms, mode}`: the last 500 first, then live. Never message text |
| `GET /healthz` | Liveness, no token |

**Reply pipeline** (plan §4.3, §4.6). `POST /v1/questions` stores the question and pushes `question.created` straight
away, with eight default candidates (Yes, No and Not now first). It then calls the model within a 3.5 s budget. The
model's output is validated against the schema per candidate, then trimmed, capped at 60 characters, de-duplicated
case-insensitively and filled up to eight with defaults. Priors are computed from the scores with switchclock's
`priors()`, and the result is pushed as `question.candidates`. On a timeout, an error or unusable output, the
defaults stay.

**Speech pipeline.** `POST /v1/utterances` synthesises speech on commit. A Polly failure or the daily cap commits
the reply without audio.

**Cost guard.** At most 1,000 model calls and 100,000 Polly characters per UTC day; beyond that, mock output.

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
WebSocket, SSE) · `src/compose.ts` (wiring) · `src/main.ts` (entry point).
