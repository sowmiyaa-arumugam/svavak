# Say When

A single-switch AAC (augmentative and alternative communication) communicator for Fire TV, built for the
Amazon Developer Hackathon 2026.

## Status

Repository bootstrap only: no product code yet.

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
