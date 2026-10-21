# SvaVāk studio

*Your Voice. Your Choice*

One localhost page that makes the whole loop visible (plan §4.7, decision D6), for judges, testing and the video. It
is labelled everywhere as a web mirror: the real app runs on Fire OS. It uses the TV's colour tokens
([apps/tv/src/colors.ts](../tv/src/colors.ts)), so the two read as one product. It is laid out for a 1920 × 1080
screen.

- **Caregiver panel** (left), with a permanent "Simulated Alexa+ experience" banner. Type to the simulated Alexa+
  and press Send. The turn goes to the [agent](../../services/agent)'s `POST /agent/turn`, read as a stream. Each
  tool call shows as a chip (outlined while it runs, filled when it has worked, red on a tool error). The agent's
  answer is shown in large text and spoken with the browser's speech synthesis.
- **Virtual TV** (right), labelled "Web mirror: the real app runs on Fire OS". It is off by default behind the
  **Drive mode** switch, so it never competes with the app on the emulator for the household's questions.
  - Drive mode runs the TV's own conversation state machine, switchclock scan engine, switch handling and stream
    client ([apps/tv/src](../tv/src)), drawn on the TV's 1920 × 1080 layout and scaled into a 16:9 frame.
  - It connects to the [server](../../services/server) as the household's TV. It shows the idle screen between
    questions, practice questions when the server can't be reached, "Finding replies…" while a question waits for the
    model's replies, and Help.
  - The **space bar** is the switch: press when your answer lights up, or hold for 2 s for Help. While you type in the
    caregiver's text box, a space is just a space.
  - A reply that stands through its 2 s cancel window is posted to `POST /v1/utterances`, as the TV posts it. The
    studio plays no audio of its own.
- **Engine view** (under the virtual TV): the scan engine's posterior for every option as bars, after each press, with
  the commit threshold θ = 0.97 as a dashed line.
- **System trace** (bottom): the server's live spans from `GET /v1/trace` as a strip of hops: caregiver → agent →
  MCP → server → Bedrock or Polly → TV.
  - Each hop lights up with the duration of its latest span. The caregiver and agent hops come from the panel itself:
    the time until the agent's stream opened, and the whole turn.
  - A badge shows MOCK or LIVE, from the latest server span. The mock adapters are marked "(mock)" on the Bedrock or
    Polly hop.
  - Spans from before the page opened are not drawn.

## Run a demo

Four terminals, from the repository root, with the repository's `.env` set up as in [.env.example](../../.env.example)
(mock mode needs no AWS account):

```bash
yarn install                                # 0. once: the workspaces' dependencies
yarn workspace server start                 # 1. the server on 127.0.0.1:8787
cd services/agent && uv run python -m svavak_agent   # 2. the agent on 127.0.0.1:8790 (after the server)
yarn workspace studio dev                   # 3. the studio on http://localhost:5173
yarn workspace tv start                     # 4. Metro for the TV app on the emulator (see apps/tv)
```

Open http://localhost:5173 in a browser. With the TV app running on the emulator, leave Drive mode off: ask in the
caregiver panel, answer on the emulator, and watch the trace. Without an emulator, switch Drive mode on and answer
with the space bar.

## Access

- **Tokens.** In dev (`vite`), [vite.config.ts](vite.config.ts) reads `SVAVAK_DEVICE_TOKEN` from the repository's
  `.env`, or from the environment, which wins, and compiles it into the page served on localhost. No other setting is
  read. A `vite build` carries no token. Tokens are never put in a URL or a committed file.
- **Trace.** It is read with `fetch` and an `Authorization` header, not `EventSource`, which cannot send headers.
- **Stream.** Browsers cannot set headers on a WebSocket, so the virtual TV offers the subprotocol list
  `bearer, <device token>`. The server checks the token and answers with `bearer` only.
- **Origin.** Of browser pages, the server lets only the studio's origin, `http://localhost:5173`, use `/v1/trace` and
  `/v1/stream`; it also accepts the emulator TV's own origin and no Origin at all (tools), and it answers the studio's
  CORS preflights. The agent allows the same origin.

## Test

```bash
yarn workspace studio typecheck   # strict tsc over the studio, its test and the TV source it imports
yarn workspace studio e2e         # Playwright, mock mode; its exit code is the verdict
```

`yarn workspace studio playwright install chromium` downloads the pinned browser once.

The end-to-end test ([e2e/loop.spec.ts](e2e/loop.spec.ts)) starts its own server, agent and studio (Playwright's
`webServer`), in that order, in mock mode with fresh random tokens and no AWS profile. Ports 8787, 8790 and 5173 must
be free. The test then:

1. switches Drive mode on (the virtual TV goes idle);
2. sends "Ask Sam if he wants tea or coffee" from the caregiver panel;
3. waits for the virtual TV to show Tea and Coffee, and presses the space bar while Tea is lit;
4. expects the caregiver panel to show "Sam says: Tea." and Tea's posterior to have reached θ;
5. expects the trace to show the MCP and TV hops, and the MOCK badge.

It drives the page through stable `data-testid` attributes, with `data-mode`, `data-label`, `data-lit`, `data-state`,
`data-hop` and `data-seen` for state. It saves 1080p screenshots to `test-results/b5/` (git-ignored).

Pinned: React 19.1.0 (the TV's version), Vite 8.3.1 with `@vitejs/plugin-react` 6.1.2, TypeScript 5.9.3 and
`@playwright/test` 1.64.1.

## Layout

| Path | Contents |
| --- | --- |
| `src/App.tsx` | The page layout and the Drive mode switch |
| `src/CaregiverPanel.tsx` | The simulated Alexa+: text, tool chips, speech |
| `src/VirtualTv.tsx` | The web mirror of the TV, on the TV's own modules |
| `src/EngineView.tsx` | The posterior bars and θ |
| `src/TraceStrip.tsx` | The trace stream and the strip of hops |
| `src/sse.ts` | Server-sent events read with `fetch` |
| `e2e/` | The Playwright test |
