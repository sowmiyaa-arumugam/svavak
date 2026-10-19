# Say When

A single-switch AAC (augmentative and alternative communication) communicator for Fire TV, built for the
Amazon Developer Hackathon 2026.

## Status

- **Engine** ([packages/switchclock](packages/switchclock)): Bayesian single-switch selection with clock mode
  (gate K1: 1.19% error) and Smart Scan mode (gate K1-scan: 0.48% and 1.19% error), and a seeded simulator.
- **TV app** ([apps/tv](apps/tv)): the conversation screen in Smart Scan mode.
  - Questions come from the server's WebSocket stream, with the local fixtures when it can't be reached.
  - It has a 2 s cancel window, after which the reply is posted and its speech played, a 2 s hold for Help, and K2
    instrumentation.
  - It runs on the Android TV emulator; gate K2 on a device is still open.
- **Server** ([services/server](services/server)): REST, the WebSocket question stream and the SSE trace for flow S1,
  mock-first. It has default replies at once and model candidates within 3.5 s, idempotent utterances, a device token
  and daily caps. Live mode (Nova 2 Lite on Bedrock, Polly) is tested only against AWS SDK mocks. The store is in
  memory.
  - An MCP endpoint (`/mcp`, Streamable HTTP) gives caregiver agents `ask_question`, `get_answer`,
    `get_recent_messages` and `add_profile_fact`, with its own agent token (gate K4: conformance suite and Inspector).
- **Not built yet:** the studio, SQLite storage and Docker.

## Contributing set-up

Requirements: Node.js 24 with Corepack (Yarn 4.5), Git (Git for Windows on Windows) and
[gitleaks](https://github.com/gitleaks/gitleaks) on `PATH`.

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
