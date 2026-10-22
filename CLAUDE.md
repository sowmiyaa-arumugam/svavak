# CLAUDE.md: SvaVāk

Single-switch AAC communicator for Fire TV, entered in the Amazon Developer Hackathon 2026
(deadline Fri 23 Oct 2026, 21:00 CEST). The product is "SvaVāk", tagline "Your Voice. Your Choice" (decision D1,
20 Oct 2026), replacing the working name "Aloud", which the repository folder and the root workspace package still
use. Where ā cannot go, it is plain ASCII: "svavak" in package ids, slugs and identifiers, `SVAVAK_` in settings.
Author and owner: Sowmiya Arumugam.
Licence: Apache-2.0.

## Plan (source of truth)

- `docs/private/ALD-PLN-001_Aloud_Implementation_Design_Plan_v1.1.pdf`: §3.5 layout, §4 components,
  §6.3 guardrails, §7.3 tests, §7.5 Definition of Done, §10 scope and cut order.
- `docs/private/` is git-ignored. Never commit it, copy it into tracked files or push it.
- Layout follows §3.5, except that the engine starts as `packages/switchclock` in this repo
  (it is split into its own repo before publishing).

## Licence header on every source file

The first lines of every source file (after a shebang, within the first 10 lines), in the file's
comment syntax:

```ts
// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
```

"Source file" includes Dockerfiles and every YAML file. The pre-commit hook rejects source files that
lack either line.

## A comment on every source line (non-negotiable)

Every hand-written source line carries a comment explaining it. Excluded: lockfiles and generated
files (build output, generated types).

Prettier is not used: it moves trailing comments off block-opening lines, which breaks this rule.

## Test before hand-over

Test every change before handing it over. Report the exact commands run and their results
(pass/fail counts, errors). Never call something done without having run it.

## Working style (karpathy guidelines)

Every code change follows the karpathy-guidelines skill (`/andrej-karpathy-skills:karpathy-guidelines`).

- State assumptions. When something is unclear, ask instead of guessing.
- Write the simplest code that works. Nothing speculative: no unrequested features, options or abstractions.
- Make surgical changes: touch only what the task needs; no drive-by refactors or reformatting.
- Define success criteria up front, then verify them before reporting.

## Facts from sources, not memory

Check library and API facts (versions, flags, signatures, limits) against the official docs or the
installed package, not memory.

## Secrets

- AWS only through IAM Identity Center (SSO) short-lived credentials. Never create or use access keys.
- Nothing sensitive in files or commits: no tokens, keys, account IDs or real personal data.
  Use placeholders and synthetic personas.
- Local values go in a git-ignored `.env`; only `.env.example` is committed: placeholders, plus the two public
  demo tokens for mock mode, which the server and the agent refuse in live mode.
- Never bypass the pre-commit hook (`--no-verify`). If it blocks, fix the cause.

## Scope

Build P0 only (plan §10.1) unless told otherwise. Never cut: the Fire TV app on the emulator, rule
compliance, engine and MCP tests, the secret guardrails, the video and the product feedback.

## Repository mechanics

- Yarn 4.5 workspaces (`apps/*`, `services/*`, `packages/*`) through Corepack; `nodeLinker: node-modules`.
- Enable the hook once per clone: `git config core.hooksPath .githooks` (needs gitleaks on PATH).
  It also blocks UTF-16 files and any file over 1 MiB (`yarn.lock` excepted).
- Log every tool problem in `docs/friction-log.md`, with the fields of plan §11.4.
- Before any git push, complete docs/private/pre-push.md.
