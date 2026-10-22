# SvaVāk

*Your Voice. Your Choice*

A single-switch AAC (augmentative and alternative communication) communicator for Fire TV, built for the
Amazon Developer Hackathon 2026.

## Status

- **Engine** ([packages/switchclock](packages/switchclock)): Bayesian single-switch selection with clock mode
  (gate K1: 1.19% error) and Smart Scan mode (gate K1-scan: 0.48% and 1.19% error), and a seeded simulator.
- **TV app** ([apps/tv](apps/tv)): the conversation screen in Smart Scan mode.
  - Questions come from the server's WebSocket stream. While it is connected, the TV shows a calm idle screen between
    questions (the last reply; a short press only shows "Hold the button for help.", and a 2 s hold opens Help).
    Local practice questions, labelled "Practice", run only when the server can't be reached.
  - It has a 2 s cancel window, after which the reply is posted and its speech played, a 2 s hold for Help, which
    sends one help request to the server and says whether it got there, and K2 instrumentation.
  - It runs on the Android TV emulator; gate K2 on a device is still open.
- **Server** ([services/server](services/server)): REST, the WebSocket question stream and the SSE trace for flow S1,
  mock-first. It has default replies at once and model candidates within 3.5 s, idempotent utterances, a device token
  and daily caps. Live mode (Nova 2 Lite on Bedrock, Polly) ran on 2026-10-21 and passed gate K3 (candidates p50 1.0 s). The store is in
  memory.
  - An MCP endpoint (`/mcp`, Streamable HTTP) gives caregiver agents `ask_question`, `get_answer`,
    `get_recent_messages` and `add_profile_fact`, with its own agent token (gate K4: conformance suite and Inspector).
- **Agent** ([services/agent](services/agent)): the simulated Alexa+, a Python Strands agent over the server's MCP tools
  that streams each caregiver turn as SSE on `127.0.0.1:8790`, mock-first (live mode: Nova 2 Lite, run live on
  2026-10-21).
- **Studio** ([apps/studio](apps/studio)): one localhost page (React and Vite, http://localhost:5173) with the caregiver
  panel (the simulated Alexa+), a virtual TV in drive mode on the TV's own modules (the space bar is the switch), the
  engine's posterior after each press, and the system trace. A help request from the TV shows in the caregiver panel
  as "Sam is asking for help." and is spoken once. A Playwright test drives the whole loop in mock mode.
- **Not built yet:** SQLite storage and Docker.

## Run a demo

Mock mode needs no AWS account. Copy `.env.example` to `.env` and set the two tokens, then start each part in its own
terminal, from the repository root, in this order:

```sh
yarn install                                         # 0. once: the workspaces' dependencies (Yarn 4 through Corepack)
yarn workspace server start                          # 1. the server on 127.0.0.1:8787 (mock unless SVAVAK_MODE=live)
cd services/agent && uv run python -m svavak_agent   # 2. the agent on 127.0.0.1:8790; it needs the server
yarn workspace studio dev                            # 3. the studio on http://localhost:5173
yarn workspace tv start                              # 4. Metro for the TV app, then start SvaVāk on the emulator
```

The TV app is built and installed once with `yarn workspace tv android` (see [apps/tv](apps/tv)); its debug build
connects to the server through the emulator's host address. In the studio, leave Drive mode off while the emulator
answers; without an emulator, switch it on and answer with the space bar. Live mode (`SVAVAK_MODE=live` for the
server and the agent) needs an AWS sign-in; see [services/server](services/server).

**Before recording.** Restart the server (step 1) right before you record, while the TV is idle. Its store is in
memory, so a restart clears the conversation: earlier questions and replies, and the profile facts added since it
started (the seeded demo facts come back). The agent, the studio and the TV reconnect on their own, but the TV and the
studio keep showing the last turn ("You said: …"): relaunch SvaVāk on the emulator and reload the studio page. Don't
run the tests or the smoke scripts just before recording.

## Contributing set-up

Requirements: Node.js 24 with Corepack (Yarn 4.5), Git (Git for Windows on Windows) and
[gitleaks](https://github.com/gitleaks/gitleaks) on `PATH`, and [uv](https://docs.astral.sh/uv/) for the agent
([services/agent](services/agent)).

Enable the pre-commit guardrail once per clone:

```sh
git config core.hooksPath .githooks
```

The hook blocks a commit if the staged changes contain a secret (gitleaks), any `.env` file other than
`.env.example`, a source file (including Dockerfiles and YAML) without the licence header, or a file over
1 MiB (`yarn.lock` excepted). It also blocks UTF-16 files, which gitleaks cannot scan: save text files as UTF-8.

## Licence

Licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
Copyright 2026 Sowmiya Arumugam.
