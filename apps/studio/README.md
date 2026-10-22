# SvaVāk studio

*Your Voice. Your Choice*

One localhost page that makes the whole loop visible (plan §4.7, decision D6), for judges, testing and the video. Its
virtual TV is labelled as the web version of the TV app: the real app runs on Fire OS. It uses the TV's colour tokens
([apps/tv/src/colors.ts](../tv/src/colors.ts)), so the two read as one product. It is laid out on a 1920 × 1080
stage that is scaled to fit the window (see Look).

- **Header**: the wordmark on the left, and on the right a line saying what answers the questions and the
  **Drive mode** switch, a teal toggle on a real checkbox (`role="switch"`). With Drive mode off the line reads "The
  SvaVāk app on the Fire TV emulator answers the questions."; with it on, "Answer on the virtual TV with the space
  bar."
- **Caregiver panel** (alone and centred, at most 1100 px wide, with Drive mode off; on the left with it on), with a
  permanent "Simulated Alexa+ experience" banner. Type to the simulated Alexa+ and press Send. The turn goes to the
  [agent](../../services/agent)'s `POST /agent/turn`, read as a stream. Each tool call shows as a chip (outlined while
  it runs, filled when it has worked, red on a tool error). The agent's answer is shown at 32 px and spoken with the
  browser's speech synthesis. The conversation sits just above the text box, chat style.
  - **Help alerts.** A help request from the TV (the app on the emulator, or the virtual TV) shows in the conversation
    as "Sam is asking for help." with its time (HH:MM on this computer's clock, as the agent's recap says it), bold on
    a deep red box framed in the TV's help red, and is spoken once with the browser's speech, as the agent's answers
    are. Chrome lets a page speak only after a click or a key has activated it (Shift or Esc does not), so an alert
    that comes before that is spoken then. It comes from the server's `help.requested` span on the trace stream, so a
    help request from before the page opened is not shown; a span replayed after a reconnect is shown once. Alerts
    stay in the conversation: those from before the latest turn above it, those from during or after it below it. The
    conversation scrolls to its newest part.
- **Virtual TV** (right), labelled "Web version of the TV app: the real app runs on Fire OS". It and the engine view
  are shown only with Drive mode on, which is off by default, so the TV never competes with the app on the emulator
  for the household's questions.
  - Drive mode runs the TV's own conversation state machine, switchclock scan engine, switch handling and stream
    client ([apps/tv/src](../tv/src)), drawn on the TV's 1920 × 1080 layout and scaled into a 16:9 frame.
  - It connects to the [server](../../services/server) as the household's TV. It shows the idle screen between
    questions (where a short press only shows "Hold the button for help." for 3 s and sends nothing, as on the TV),
    practice questions when the server can't be reached, "Finding replies…" while a question waits for the
    model's replies (with dimmed empty cards up to eight, as on the TV), and Help. Help sends one help request to
    `POST /v1/alerts`, as the TV does (without its 4 s timeout and retry), and shows the TV's lines: "Asking for
    help…", then "Help request sent." or "Couldn't send the help request.".
  - It reads each question aloud before its scan starts, as the TV does (B9): it fetches the question's announcement
    from the server with the device token and plays it in the page, and the highlight starts once it has ended and
    the replies are ready. A press during it stops it, and the scan starts as soon as the replies are ready; holding
    for Help stops it too. The browser plays audio only after a click or a key on the page (switching Drive mode on
    is one); when it can't play the announcement, the scan starts as without one.
  - The **space bar** is the switch: press when your answer lights up, or hold for 2 s for Help. While you type in the
    caregiver's text box, a space is just a space.
  - A reply that stands through its 2 s cancel window is posted to `POST /v1/utterances`, as the TV posts it. The
    studio plays no reply audio of its own.
- **Engine view** (under the virtual TV): the scan engine's posterior for every option as bars, after each press, with
  the commit threshold θ = 0.97 as a dashed line.
- **System trace** (bottom): the server's live spans from `GET /v1/trace` as a strip of hops: caregiver → agent →
  MCP → server → Bedrock or Polly → TV.
  - Each hop lights up with the duration of its latest span. The caregiver and agent hops come from the panel itself:
    the time until the agent's stream opened, and the whole turn.
  - A badge shows MOCK or LIVE, from the latest server span. The mock adapters are marked "(mock)" on the Bedrock or
    Polly hop.
  - A help request lights TV ("help request"), server (`POST /v1/alerts`) and caregiver (`help.requested`).
  - Spans from before the page opened are not drawn.

## Look

Dark and calm, in the spirit of [Hamish Williams' portfolio](https://hamishw.com), with our own CSS
([src/styles.css](src/styles.css)): large type, generous spacing, translucent dark panels and subtle motion.

- **Background:** "A group of green leaves with a dark background" by Aaron Vasquez on Unsplash, under the Unsplash
  License (see [NOTICE](../../NOTICE)). It is resized to 1920 px wide and compressed to 272 KB
  ([src/assets](src/assets)). A 70% overlay and a vignette that only darkens keep every text colour drawn on it at
  WCAG AA contrast.
- **Logo:** the page's title is the SvaVāk logo's gold wordmark without its tagline,
  [assets/brand/SvaVak_logo_wordmark.svg](../../assets/brand), in Source Serif 4 outlines (SIL Open Font License, see
  [NOTICE](../../NOTICE)); at header size the tagline would be too small to read. Its viewBox crops it to what it
  draws, and it is 32 px tall, so its capitals are as tall as the old text title's.
- **Stage:** the page is laid out at 1920 × 1080 and zoomed to fit the window, its proportions kept: the scale is
  the smaller of window width ÷ 1920 and window height ÷ 1080 ([src/main.tsx](src/main.tsx) sets it as `--scale`,
  and again on every resize). It is centred, and the photo fills any space beside or above it. CSS `zoom` lays the
  page out at its final size, so text is drawn at that size and stays sharp. The page never scrolls.
- **Type:** Montserrat (SIL Open Font License), self-hosted from `@fontsource/montserrat` in weights 400, 600 and 700.
  No font or image CDN is called at runtime. The virtual TV keeps the TV's own look and its system type.
- **Motion:** the page rises into place on load, and each part of a caregiver turn, and each help alert, as it
  arrives. Under `prefers-reduced-motion: reduce` nothing animates or transitions.
- **Credits:** "Design inspired by Hamish Williams · Background photo: Aaron Vasquez / Unsplash". They are here and
  in [NOTICE](../../NOTICE); the page itself shows no credits line.

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

Playwright starts its own server, agent and studio (its `webServer`), in that order, in mock mode with fresh random
tokens and no AWS profile. Ports 8787, 8790 and 5173 must be free. The end-to-end test
([e2e/loop.spec.ts](e2e/loop.spec.ts)) then:

1. switches Drive mode on (the virtual TV goes idle);
2. sends "Ask Sam if he wants tea or coffee" from the caregiver panel;
3. waits for the virtual TV to show Tea and Coffee, and presses the space bar while Tea is lit;
4. expects the caregiver panel to show "Sam says: Tea." and Tea's posterior to have reached θ;
5. expects the trace to show the MCP and TV hops, and the MOCK badge.

It drives the page through stable `data-testid` attributes, with `data-mode`, `data-label`, `data-lit`, `data-state`,
`data-hop` and `data-seen` for state. It saves 1080p screenshots to `test-results/b5/` (git-ignored).

The Help tests ([e2e/help.spec.ts](e2e/help.spec.ts)) check seven things, with the browser's speech recorded instead
of played where they count it:

- A help request sent from the page as the TV sends it (and its retry, with the same key) shows one alert, "Sam is
  asking for help." with its time, spoken once; the TV, server and caregiver hops light up; and "What did Sam say?"
  answers "Sam asked for help at …" first.
- Holding the space bar for 2 s in Drive mode opens Help at 2 s with the key still down, sends one request to
  `POST /v1/alerts`, shows "Help request sent." and the same alert, spoken once; a short press closes Help.
- With that request held back for 2 s and then refused, the virtual TV shows "Asking for help…", then "Couldn't send
  the help request.", and no alert appears.
- A short press on the idle screen in Drive mode shows "Hold the button for help." for a few seconds and sends
  nothing, so no alert appears; the K3 key chatter after it (57 press/release pairs about 46 ms apart) is one hold
  and sends one request.
- An alert that arrives before any click or key on the page is shown at once and spoken at the first click, not at a
  Shift: Chrome refuses speech ("not-allowed") until a click or a key other than a modifier or Esc. The test
  reproduces that rule, which `page.evaluate` would lift.
- After nine alerts the newest is in full view: the conversation scrolls to its end.
- An alert stays the same element when the caregiver starts a turn after it, so a screen reader does not announce it
  again.

The announcement tests ([e2e/announce.spec.ts](e2e/announce.spec.ts)) switch Drive mode on and send the same
caregiver turn, recording the page's audio events (`playing`, `pause`, `ended`, `error`) from its first script on:

- The virtual TV fetches the question's announcement with the device token (200, the mock's `audio/wav` tone), plays
  it to its end, and lights its first option only after that end.
- With the announcement's request failing on the network, the scan starts at once and nothing plays. With a 5 s
  announcement instead (served by the test), a short press during it pauses it, and the scan starts at once, since
  the question's replies are final.

Each answers Tea with the space bar at the end, as the loop test does, since an open question would be replayed to
the next test's virtual TV.

The look tests ([e2e/look.spec.ts](e2e/look.spec.ts)) check four things:

- The page draws the darkened photo in Montserrat, with the banner, the virtual TV's label, the engine panel's hint
  (which no longer says to turn on Drive mode, since the panel shows only in it) and the mode badge, and shows the
  whole wordmark as its title, top left, with its capitals as tall as the text title's were.
- Every request goes to the studio, the server or the agent.
- Every line of the main text, a help alert's included, has WCAG AA contrast (4.5:1, or 3:1 for large text) against
  the pixels drawn behind it, with Drive mode off and on. They are measured in a 1080p screenshot taken with the text
  made transparent.
- Nothing animates or transitions under `prefers-reduced-motion: reduce`.

The layout tests ([e2e/layout.spec.ts](e2e/layout.spec.ts)) run at 1920 × 1080, 1920 × 960, 1366 × 768,
1280 × 800 and 2560 × 1440, with Drive mode off and with it on (after one question answered with the space bar).
At each size they check four things:

- The stage's scale is the smaller of the two ratios (within 1 %, and exactly 1 at 1920 × 1080), and the stage is
  centred.
- There are no scrollbars, no two panels overlap, the system trace is drawn, and every heading and line of text is
  visible: the element on top at its middle (`elementFromPoint`) is the one that draws it.
- With Drive mode off, only the caregiver panel shows, centred. With it on, the engine's bars show in full. The
  header line and the virtual TV's label match the mode.
- The latest reply is 32 px on the stage and sits just above the text box.

They also check that resizing from 1920 × 1080 to 1366 × 768 and back rescales without a reload, and that the Drive
mode switch is a teal toggle on a real checkbox that Tab and Space reach. They save screenshots of both modes at
1920 × 1080 and 1366 × 768 to `test-results/b7_2/` (git-ignored).

Pinned: React 19.1.0 (the TV's version), Vite 8.3.1 with `@vitejs/plugin-react` 6.1.2, TypeScript 5.9.3,
`@playwright/test` 1.64.1 and `@fontsource/montserrat` 5.3.0.

## Layout

| Path | Contents |
| --- | --- |
| `src/App.tsx` | The page layout and the Drive mode switch |
| `src/styles.css` | The look |
| `src/assets/` | The background photo (Unsplash License, see NOTICE) |
| `src/CaregiverPanel.tsx` | The simulated Alexa+: text, tool chips, speech, help alerts |
| `src/VirtualTv.tsx` | The web version of the TV app, on the TV's own modules |
| `src/EngineView.tsx` | The posterior bars and θ |
| `src/TraceStrip.tsx` | The trace stream, the strip of hops and the help requests |
| `src/sse.ts` | Server-sent events read with `fetch` |
| `e2e/` | The Playwright tests: the loop, Help, the announcement, the look and the layout (`sendHelp.ts` sends a help request as the TV does) |
