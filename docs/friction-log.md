# Friction log

Problems met while building SvaVāk (a single-switch AAC communicator for Fire TV), logged for the Amazon Developer
Hackathon 2026. Each entry gives the date, the tool, the task attempted, the steps taken, the expected and the actual
result, a severity, the workaround used and a suggestion for the tool's owner. "Not recorded" marks a field that the
log did not capture at the time.

Severity: **Blocker** stops the work with no way round; **High** stops a main task until a workaround is found;
**Medium** costs real time or hides the cause of a failure; **Low** is a nuisance, or nothing fails.

## Summary

Sorted by severity, then date.

| Date | Tool | Title | Severity |
| --- | --- | --- | --- |
| 2026-10-18 | Gradle 8.14.3 | "Could not move temporary workspace" with Sophos Home | High |
| 2026-10-20 | Amazon Bedrock | Every call refused while the new AWS account is being verified | High |
| 2026-10-20 | Amazon Polly | AccessDenied in eu-central-1; the only allowed Region has no neural voices | High |
| 2026-10-21 | AWS account (`aws login`) | No IAM users; the sign-in lasts about an hour, then refresh fails | High |
| 2026-10-22 | expo-audio (Android) | `remove()` neither stops nor frees a player, so audio keeps playing | High |
| 2026-10-18 | typescript-eslint with TypeScript 7 | typescript-eslint does not support TypeScript 7 | Medium |
| 2026-10-18 | Prettier with eslint-plugin-prettier | Prettier moves trailing comments off block-opening lines | Medium |
| 2026-10-18 | React Native debug build, Expo CLI | A second Expo app on the emulator loads the first app's bundle | Medium |
| 2026-10-18 | Claude Code with the ecc plugin hooks | A hook reformats a config file and then blocks restoring it | Medium |
| 2026-10-18 | Android TV emulator, adb | No adb way to hold a key for 2 s on API 30 | Medium |
| 2026-10-19 | adb, Android TV emulator | `adb shell input keyevent` lands about 0.85 s after it is sent | Medium |
| 2026-10-19 | Strands Agents | Strands prints and logs conversation content by default | Medium |
| 2026-10-19 | boto3 / botocore | A Bedrock API key from the environment beats a named SSO profile | Medium |
| 2026-10-20 | Android TV emulator console | `event send` answers OK but no key reaches the guest | Medium |
| 2026-10-20 | Android TV emulator | Holding a PC key arrives as about 57 press/release pairs | Medium |
| 2026-10-20 | Expo development builds | The app opens in Expo Go instead of the development build | Medium |
| 2026-10-21 | Claude Code background tasks | Stopping a background shell leaves its server running | Medium |
| 2026-10-21 | React Native (Android) | The Android WebSocket sends an Origin header | Medium |
| 2026-10-21 | Amazon Nova 2 Lite | Nova 2 Lite made up options the agent policy forbids | Medium |
| 2026-10-21 | Amazon Nova 2 Lite | Nova 2 Lite repeats earlier answers to an unrelated question | Medium |
| 2026-10-21 | Chrome | Speech synthesis is blocked until the page has been clicked | Medium |
| 2026-10-22 | Expo CLI (`export:embed`) | A release build cannot find the app's entry file in a Yarn workspaces repository | Medium |
| 2026-10-18 | Android Studio | First-run wizard offered no SDK components | Low |
| 2026-10-18 | Amazon's React Native multi-TV sample | Legacy Architecture warning and StrictMode error on first run | Low |
| 2026-10-18 | Yarn 4.5.0 with TypeScript 7.0.2 | Yarn cannot apply its built-in TypeScript patch | Low |
| 2026-10-18 | Vitest 5.0.3 with Yarn | Vitest 5 needs vite installed alongside it; Yarn only warns | Low |
| 2026-10-18 | Amazon's React Native multi-TV sample | The sample resolves react-native-tvos to a release candidate | Low |
| 2026-10-18 | Expo CLI | Prebuild adds an iOS script to an Android-only app | Low |
| 2026-10-18 | Android Gradle plugin | CMake step warns about SDK XML version 4 | Low |
| 2026-10-18 | Vitest 5.0.3 | Vitest hides console output when an AI agent runs the tests | Low |
| 2026-10-18 | Expo CLI | `expo run:android` rejects `--port` together with `--no-bundler` | Low |
| 2026-10-18 | Claude Code with the ecc plugin (GateGuard) | A hook asks for facts before the first edit of every file | Low |
| 2026-10-19 | Expo SDK 54 tsconfig | Expo's base tsconfig hides React Native's WebSocket headers argument | Low |
| 2026-10-19 | Amazon Bedrock documentation | Nova 2 docs disagree on maxTokens and temperature for tool calls | Low |
| 2026-10-19 | Amazon Polly documentation | Polly lists neural voices and neural Regions separately | Low |
| 2026-10-19 | Claude Code Bash tool | A doubled backslash becomes one | Low |
| 2026-10-19 | Git for Windows (Git Bash) | Git Bash rewrites device paths in `adb push` | Low |
| 2026-10-19 | MCP TypeScript SDK | The SDK's root import fails | Low |
| 2026-10-19 | Strands Agents | `MCPClient` hides why its start-up failed | Low |
| 2026-10-19 | Strands Agents | `MCPClient` warns about its own calls to the MCP SDK | Low |
| 2026-10-19 | uvicorn | uvicorn runs a bound method as an ASGI2 app | Low |
| 2026-10-19 | Starlette | Starlette 1.9's TestClient deprecates httpx | Low |
| 2026-10-20 | Git for Windows (Git Bash) | Git Bash rewrites a device path inside an adb argument | Low |
| 2026-10-20 | Amazon Nova 2 documentation | Nova 2 docs disagree on tool-call temperature and maxTokens | Low |
| 2026-10-21 | Git for Windows | `git mv` of a folder fails with "Permission denied" | Low |
| 2026-10-21 | Expo CLI | With a scheme set, `expo run:android` opens a dev-client link | Low |
| 2026-10-21 | Android TV emulator (Google TV launcher) | The launcher draws blank app tiles | Low |
| 2026-10-21 | Metro | Metro falls back to a full crawl when another Metro shares the project | Low |
| 2026-10-21 | Claude Code Bash tool | Bash fails on some quoting that bash accepts | Low |
| 2026-10-21 | Android TV emulator (Google TV launcher) | After `am force-stop`, the launcher takes the front back | Low |
| 2026-10-21 | Strands Agents, MCP SDK | stderr output when a turn is cancelled mid tool call | Low |
| 2026-10-21 | TypeScript 5.9.3 | DOM and Node typings disagree on `TextDecoderStream` | Low |
| 2026-10-21 | Metro | Metro stops serving the bundle after `yarn install` | Low |
| 2026-10-21 | Android Emulator | The emulator's clock ran about 52 minutes behind the host | Low |
| 2026-10-21 | Metro / Expo CLI | Metro started with `CI=1` does not pick up code changes | Low |
| 2026-10-21 | Android Emulator | A closed port on the host is not refused | Low |
| 2026-10-22 | Metro Fast Refresh | Fast Refresh ran new code against an object the old code had made | Low |
| 2026-10-22 | Android TV emulator (launcher) | The launcher took the foreground back from `am start` | Low |
| 2026-10-22 | Android Emulator | The emulator shut itself down right after loading its snapshot | Low |
| 2026-10-22 | Claude desktop app (Browser pane) | A page in the hidden Browser pane gets no animation frames | Low |
| 2026-10-22 | pip with git-filter-repo, Git for Windows | pip installs git-filter-repo where Git cannot find it | Low |
| 2026-10-22 | apksigner (build-tools 36.0.0) | One password file for keystore and key fails with "end of file reached" | Low |

## Entries

## 2026-10-18: Android Studio first-run wizard offered no SDK components

- **Date:** 2026-10-18
- **Tool:** Android Studio
- **Task attempted:** set up the Android SDK for the Android TV emulator (API 30).
- **Steps taken:** ran Android Studio's first-run set-up wizard.
- **Expected:** the wizard offers the SDK components to install.
- **Actual:** the wizard offered no SDK components.
- **Severity:** Low. A workaround exists.
- **Workaround:** installed the components through SDK Manager instead.
- **Suggestion:** when no components are available, the wizard should say why and link to SDK Manager.

## 2026-10-18: Gradle "Could not move temporary workspace" with Sophos Home

- **Date:** 2026-10-18
- **Tool:** Gradle 8.14.3, with Sophos Home real-time scanning, on Windows 11
- **Task attempted:** build Amazon's sample TV app for the Android TV emulator.
- **Steps taken:** ran the Gradle build on Windows with Sophos Home real-time scanning on.
- **Expected:** the build completes.
- **Actual:** the build failed with "Could not move temporary workspace".
- **Severity:** High. Every build failed until the workaround.
- **Workaround:** added Sophos exceptions for the `.gradle` folder in the user profile, the project folder and the
  Android SDK, then deleted `caches/8.14.3/transforms`.
- **Suggestion:** Gradle's error message should name real-time antivirus scanning as a likely cause and point to the
  folders to exclude.

## 2026-10-18: Amazon's sample shows a Legacy Architecture warning and a StrictMode error

- **Date:** 2026-10-18
- **Tool:** Amazon's React Native multi-TV sample (React Native, LogBox)
- **Task attempted:** first run of Amazon's sample TV app on the Android TV emulator.
- **Steps taken:** started the sample app for the first time.
- **Expected:** the sample starts without warnings or errors.
- **Actual:** a Legacy Architecture warning and a StrictMode `findNodeHandle` error appeared; LogBox only said
  "Open debugger to view warnings".
- **Severity:** Low. The log did not record the app failing; the severity was not assessed at the time.
- **Workaround:** not recorded.
- **Suggestion:** LogBox should show the warning text itself; the sample should not trigger StrictMode errors on a
  clean first run.

## 2026-10-18: Yarn cannot apply its built-in TypeScript patch to TypeScript 7.0.2

- **Date:** 2026-10-18
- **Tool:** Yarn 4.5.0 (through Corepack) with TypeScript 7.0.2
- **Task attempted:** install the dev dependencies of the switchclock engine package.
- **Steps taken:** added `typescript` 7.0.2 to `packages/switchclock` and ran `corepack yarn install`.
- **Expected:** the install completes without warnings.
- **Actual:** the fetch step warned `YN0066: typescript@patch:typescript@npm%3A7.0.2#optional!builtin<compat/typescript>
  ...: Cannot apply hunk #1`. The install ended "Done with warnings", and `tsc` 7.0.2 then ran normally. The same
  warning appeared for TypeScript 5.9.3 after the workspaces moved to it.
- **Severity:** Low. Nothing failed.
- **Workaround:** none needed. The repo uses `nodeLinker: node-modules`, and Yarn's built-in patches exist for
  packages that are not compatible with Plug'n'Play (plugin-compat README).
- **Suggestion:** when Yarn's built-in Plug'n'Play patch does not fit a TypeScript version, Yarn should say what that
  means, and skip it under `nodeLinker: node-modules`.

## 2026-10-18: Vitest 5 needs vite installed alongside it; Yarn only warns

- **Date:** 2026-10-18
- **Tool:** Vitest 5.0.3 with Yarn 4.5.0
- **Task attempted:** set up the switchclock engine's test runner.
- **Steps taken:** added `vitest` and `@vitest/coverage-v8` 5.0.3, without `vite`, and ran `corepack yarn install`.
- **Expected:** either Vitest installs what it needs to run, or the install fails clearly when a required package is
  missing.
- **Actual:** the install ended "Done with warnings". The only signal was `YN0002: switchclock@workspace:packages/switchclock
  doesn't provide vite (p82825), requested by vitest`, plus a YN0086 summary. Vitest 4.1.11 listed `vite` as a
  dependency; 5.0.3 lists it only as a peer dependency.
- **Severity:** Low. It was caught before any test ran.
- **Workaround:** added `vite` 8.3.1 as a dev dependency.
- **Suggestion:** Vitest's install instructions should say that from version 5 `vite` must be installed alongside it,
  and Yarn should make a missing required peer stand out from other peer warnings.

## 2026-10-18: typescript-eslint does not support TypeScript 7

- **Date:** 2026-10-18
- **Tool:** typescript-eslint 8.58.1 (latest: 8.71.2) with TypeScript 7.0.2
- **Task attempted:** reuse the ESLint set-up of Amazon's sample at the repository root, for the TV app and the
  switchclock engine, which used TypeScript 7.0.2.
- **Steps taken:** read the peer dependencies of `@typescript-eslint/parser` and the `exports` of the `typescript` 7.0.2
  package.
- **Expected:** ESLint's TypeScript parser works with the current TypeScript release.
- **Actual:** every 8.x release up to 8.71.2 declares the peer `typescript: ">=4.8.4 <6.1.0"`, and the main export of
  `typescript` 7.0.2 is only `lib/version.cjs`, with no compiler API for tools to call.
- **Severity:** Medium. It forced a TypeScript downgrade.
- **Workaround:** both workspaces use TypeScript 5.9.3.
- **Suggestion:** the TypeScript 7 release notes and typescript-eslint's install page should state the gap and the
  TypeScript version to use until the API returns.

## 2026-10-18: Prettier moves trailing comments off block-opening lines

- **Date:** 2026-10-18
- **Tool:** Prettier 3.8.2 through eslint-plugin-prettier 5.5.5, with this repository's comment-on-every-line rule
- **Task attempted:** reuse the Prettier settings of Amazon's sample for the TV app and the switchclock engine.
- **Steps taken:** ran `yarn lint` (the sample's ESLint configuration, which includes the `prettier/prettier` rule) and
  Prettier on single files.
- **Expected:** formatting keeps each line's trailing comment on that line.
- **Actual:** Prettier moves a comment that follows `{` or `(`, as in `export class Engine { // …`, onto a line of its
  own, which leaves the opening line without a comment. `yarn lint` reports 297 `prettier/prettier` warnings across
  the 29 TypeScript files and no other finding in our code.
- **Severity:** Medium. Prettier's formatting and the comment rule cannot both hold.
- **Workaround:** Prettier was removed from the repository on 2026-10-18 (rule, `.prettierrc` and dependency); CLAUDE.md
  says why.
- **Suggestion:** Prettier could offer an option to keep trailing comments on block-opening lines.

## 2026-10-18: Amazon's sample resolves react-native-tvos to a release candidate

- **Date:** 2026-10-18
- **Tool:** Amazon's React Native multi-TV sample (`apps/expo-multi-tv`)
- **Task attempted:** copy the sample's Expo SDK 54 and react-native-tvos 0.81 set-up for the TV app.
- **Steps taken:** read the sample's `package.json` and `yarn.lock`, and the npm registry.
- **Expected:** the sample's versions match Expo SDK 54.
- **Actual:** `react-native: npm:react-native-tvos@~0.81.0-0` resolves to `0.81.0-0rc5`, a release candidate: under
  semver's pre-release rules the range cannot match 0.81.1-0 to 0.81.5-2. `@react-native-tvos/config-tv@^0.0.10`
  declares the peer `expo ^51`, and `expo-build-properties ~0.13.0` predates SDK 54, whose `expo` lists `~1.0.10`.
- **Severity:** Low. The sample still builds and runs.
- **Workaround:** pinned react-native-tvos 0.81.5-2 (Expo SDK 54 lists React Native 0.81.5), config-tv 0.1.7 and
  expo-build-properties 1.0.10.
- **Suggestion:** pin an exact react-native-tvos version in the sample and check it with `expo install --check`.

## 2026-10-18: A second Expo app on the emulator loads the first app's bundle

- **Date:** 2026-10-18
- **Tool:** React Native 0.81 (react-native-tvos) debug build with the Expo CLI, Android TV emulator (API 30)
- **Task attempted:** run the TV app's debug build while the sample's `expo run:android` still held port 8081.
- **Steps taken:** started Metro for apps/tv on port 8082, ran `expo run:android --no-bundler`, and mapped the emulator's
  port 8081 to 8082 with `adb reverse`.
- **Expected:** the new app loads its own bundle, or fails with a clear "wrong project" error.
- **Actual:** on a stock emulator React Native loads from `10.0.2.2:8081` (the host), not through `adb reverse`, so the
  TV app silently ran the sample's bundle and showed a red box: `RNGestureHandlerModule could not be found`.
- **Severity:** Medium. The error points at a module the app never uses.
- **Workaround:** pointed the app's debug server at `10.0.2.2:8082` (React Native's `debug_http_host` dev setting).
- **Suggestion:** Metro could reject bundle requests for an app id that differs from its own project's, and
  `expo run:android` could warn when another project's Metro is on the target port.

## 2026-10-18: Expo prebuild adds an iOS script to an Android-only app

- **Date:** 2026-10-18
- **Tool:** Expo CLI (SDK 54) `expo run:android`
- **Task attempted:** first prebuild of the Fire TV app.
- **Steps taken:** ran `yarn workspace tv android`.
- **Expected:** prebuild for Android changes nothing outside `android/`.
- **Actual:** it reported "Updating package.json" and added `"ios": "expo run:ios"` to `apps/tv/package.json`; it adds
  the script again whenever it is missing.
- **Severity:** Low.
- **Workaround:** kept the script, since removing it only brings it back on the next fresh prebuild.
- **Suggestion:** prebuild should add scripts only for the platforms it is building.

## 2026-10-18: Gradle's CMake step warns about SDK XML version 4

- **Date:** 2026-10-18
- **Tool:** Android Gradle plugin (CMake configuration) with the Android SDK installed by Android Studio
- **Task attempted:** first Gradle build of the TV app's debug APK.
- **Steps taken:** ran `yarn workspace tv android`.
- **Expected:** no SDK warnings on a fresh SDK.
- **Actual:** `configureCMakeDebug[x86]` printed `[CXX5304] This version only understands SDK XML versions up to 3 but
  an SDK XML file of version 4 was encountered`. The build succeeded.
- **Severity:** Low.
- **Workaround:** none needed.
- **Suggestion:** the warning should name the component to update.

## 2026-10-18: A Claude Code plugin hook reformats a config file and then blocks restoring it

- **Date:** 2026-10-18
- **Tool:** Claude Code with the ecc plugin's `stop:format-typecheck` and `pre:config-protection` hooks
- **Task attempted:** keep the root `eslint.config.js` in the repository's comment-on-every-line form while setting up
  linting.
- **Steps taken:** created `eslint.config.js` in a Claude Code session; later tried to correct it with the Edit tool.
- **Expected:** files keep the layout the session wrote, or a formatter that rewrites them leaves them editable.
- **Actual:** the stop hook ran `prettier --write` on the file, which left 10 lines without their comments. The
  config-protection hook then blocked every Edit or Write to `eslint.config.js`, including restoring the content
  the session had written.
- **Severity:** Medium. The file cannot be put back without changing the hook set-up.
- **Workaround:** the git-ignored `.claude/settings.local.json` sets `ECC_DISABLED_HOOKS=stop:format-typecheck`. For
  the approved removal of the Prettier rule on 2026-10-18, `pre:config-protection` was added there for that one edit and
  removed straight after; the next edit attempt was blocked again.
- **Suggestion:** the format hook should respect a project's opt-out (for example a missing format script) and skip
  files that the protection hook guards.

## 2026-10-18: Vitest hides the report lines when an AI agent runs the tests

- **Date:** 2026-10-18
- **Tool:** Vitest 5.0.3, run from Claude Code
- **Task attempted:** read the measured values that the engine's gate tests print.
- **Steps taken:** ran `yarn workspace switchclock test` in a Claude Code session.
- **Expected:** the `console.log` lines of the gate tests appear in the output, as in a terminal.
- **Actual:** no report line appeared. With the `AI_AGENT` and `CLAUDECODE` environment variables unset, the same
  command printed them, so the agent detection in Vitest's `std-env` dependency hides the console output of passing
  tests.
- **Severity:** Low. The tests still pass or fail correctly.
- **Workaround:** `npx vitest run --silent=false` shows the lines; the switchclock README says so.
- **Suggestion:** Vitest should print one line saying that console output was hidden and how to show it.

## 2026-10-18: `expo run:android` rejects `--port` together with `--no-bundler`

- **Date:** 2026-10-18
- **Tool:** Expo CLI (SDK 54) `expo run:android`
- **Task attempted:** rebuild and install the TV app while its Metro server was already running on port 8082.
- **Steps taken:** ran `yarn workspace tv android --no-bundler --port 8082`.
- **Expected:** a build that targets the already-running server on 8082.
- **Actual:** `CommandError: --port and --no-bundler are mutually exclusive arguments`. Without `--port`, the run
  waited on `localhost:8081`, where another project's Metro was running.
- **Severity:** Low. The app keeps its own debug server setting (`10.0.2.2:8082`).
- **Workaround:** ran it with `--no-bundler` only.
- **Suggestion:** allow `--port` with `--no-bundler` to name the server that is already running.

## 2026-10-18: No adb way to hold a key for 2 s on the Android TV emulator (API 30)

- **Date:** 2026-10-18 (met again 2026-10-19)
- **Tool:** Android Emulator with the Android TV (API 30) system image, adb
- **Task attempted:** test and screenshot the 2 s switch hold that opens Help.
- **Steps taken:** tried `adb emu event send EV_KEY:KEY_ENTER:1 EV_SYN:0:0`, `adb shell sendevent` and
  `adb shell input keyevent`.
- **Expected:** one of them can hold a key down for a chosen time.
- **Actual:** the console's `event send` answered `OK`, but `getevent` showed no event on any input device;
  `sendevent` failed with `Permission denied` (SELinux, although the shell user is in the `input` group); and
  `input keyevent` on API 30 has only `--longpress`, with no hold duration.
- **Severity:** Medium. The Help hold could not be checked on the emulator by adb alone.
- **Workaround:** the system's `hid` shell tool registered a virtual USB keyboard through `/dev/uhid` and sent an
  Enter report, a 2,500 ms delay and a release. On API 30 its JSON `register` command needs a `bus` field; without it
  the tool fails with a `NullPointerException` in `Event.getBus`. Met again on 2026-10-19, for a press that goes down
  inside the 2 s "Saying it" window and comes up after it: `input keyevent --longpress 66` holds the key for about
  400 ms (a key-down, the long-press timeout, then the key-up), and `dumpsys input` lists the recent key events with
  their ages, which gave the key-down's offset into the window (1.70 s).
- **Suggestion:** document a supported way to hold a key for a set time on emulators (for example an `input keyevent`
  duration on every API level), and make the console's `event send` report when no device receives the event.

## 2026-10-18: A Claude Code plugin hook asks for facts before the first edit of every file

- **Date:** 2026-10-18 (met again 2026-10-19 and 2026-10-21)
- **Tool:** Claude Code with the ecc plugin's GateGuard fact-forcing hook
- **Task attempted:** build the Smart Scan change across about 25 files in one session.
- **Steps taken:** created and edited source, test, documentation and scratchpad files with the Write and Edit tools.
- **Expected:** a one-time check per session or per folder.
- **Actual:** the hook blocked the first Bash command and the first edit of each file, including throwaway scratchpad
  files, until the session restated the callers, the purpose and the user's instruction: about 20 blocks in one session.
  Met again on 2026-10-19: the first Bash command of the session was blocked once. Met again on 2026-10-21: the first
  Bash command, the first file in the session's scratchpad folder (a throwaway rename script) and a `rm -rf` of a
  git-ignored `__pycache__` folder were each blocked until the facts were restated. A script that only appended to this
  log was also blocked as destructive, because the text it wrote mentioned that command.
- **Severity:** Low. Each block costs one retry.
- **Workaround:** stated the facts and retried each time. Since 2026-10-18 the git-ignored `.claude/settings.local.json`
  sets `GATEGUARD_EXEMPT_GLOBS=**`, which exempts edits to the repository's own paths; destructive-command checks stay
  on, and paths outside the repository are still checked.
- **Suggestion:** exempt the session's scratchpad directory by default, and accept one statement for a batch of related
  files.

## 2026-10-19: Expo's base tsconfig hides React Native's WebSocket headers argument

- **Date:** 2026-10-19
- **Tool:** Expo SDK 54 (`expo/tsconfig.base.json`) with React Native 0.81 (react-native-tvos) typings
- **Task attempted:** open the TV app's WebSocket to the server with the device token in an `Authorization` header.
- **Steps taken:** wrote `new WebSocket(url, null, { headers })` in `apps/tv/src/stream.ts` and ran
  `yarn workspace tv typecheck`.
- **Expected:** it compiles: React Native's WebSocket takes an options object with `headers` as its third argument
  (`Libraries/WebSocket/WebSocket.js`), and React Native's own `src/types/globals.d.ts` declares that constructor.
- **Actual:** `TS2554: Expected 1-2 arguments, but got 3`. Expo's base tsconfig sets `"lib": ["DOM", "ESNext"]`, and the
  DOM declaration of `WebSocket` wins over React Native's.
- **Severity:** Low. A cast works around it.
- **Workaround:** cast `WebSocket` to a three-argument constructor type in `src/stream.ts`.
- **Suggestion:** Expo's base tsconfig for React Native projects could leave out the DOM library, or React Native's
  typings could merge their constructor with the DOM one instead of losing to it.

## 2026-10-19: Nova 2 documentation disagrees on maxTokens and temperature for tool calls

- **Date:** 2026-10-19
- **Tool:** Amazon Bedrock documentation (Amazon Nova 2 user guide, Nova 2 Lite model card)
- **Task attempted:** set `inferenceConfig` and the tool input schema for the server's forced `suggest_replies` call.
- **Steps taken:** read the Nova 2 request and response schema page, the Converse page, the troubleshooting page, the
  tools page and the model card.
- **Expected:** one range for each parameter, and a statement of which JSON Schema keywords tool calls enforce.
- **Actual:** the maximum `maxTokens` is given as 5,000 (schema page), up to 65,000 (Converse page) and 64K (model
  card). The schema page gives temperature a range of 0.00001 to 1, while the troubleshooting page recommends
  `temperature: 0` for reliable tool use. No page says whether `minItems`, `maxItems` or `maxLength` in a tool's input
  schema are honoured.
- **Severity:** Low. At the time only mocked calls had been tested.
- **Workaround:** `maxTokens` 1,000 (below every figure) and `temperature` 0, as the tool-use guidance says. Count and
  length limits go in descriptions and are re-validated on the server. The first live calls were to confirm this.
- **Suggestion:** one table of inference parameters per model and API, and a list of the schema keywords that tool
  calls enforce.

## 2026-10-19: Polly lists neural voices and neural Regions separately

- **Date:** 2026-10-19
- **Tool:** Amazon Polly documentation
- **Task attempted:** choose a default neural voice that is available in eu-central-1 (Frankfurt).
- **Steps taken:** read the neural-voices and available-voices pages.
- **Expected:** a list of the voices each Region offers.
- **Actual:** one page lists the Regions with neural voices, another lists the neural voices, and neither says whether
  every voice is offered in every listed Region.
- **Severity:** Low. A wrong voice fails safe: the reply is committed without audio.
- **Workaround:** default `Brian` (British English, neural), configurable as `SVAVAK_VOICE`, to be checked with
  `aws polly describe-voices --engine neural --region eu-central-1` once SSO access existed.
- **Suggestion:** a table of voices by Region on the neural-voices page.

## 2026-10-19: Claude Code's Bash tool turns a doubled backslash into one

- **Date:** 2026-10-19 (met again the same day)
- **Tool:** Claude Code (desktop app) Bash tool, running Git Bash on Windows 11
- **Task attempted:** edit test files that contain backslashes (regular expressions) with shell scripts.
- **Steps taken:** ran a string-replace script with backslashes inside single quotes, then checked with
  `printf '%s\n' 'a\\b'` and a quoted heredoc (`<<'EOF'`) holding `c\\d`.
- **Expected:** `a\\b` and `c\\d`, since bash keeps backslashes inside single quotes and quoted heredocs.
- **Actual:** `a\b` and `c\d`: each doubled backslash reaches bash as one, so the script's search text did not match.
  The script checked for a match before writing, so no file was damaged. Met again, twice, in Python scripts passed
  through a quoted heredoc:
  - `\\x21-\\x7e` reached Python as `\x21-\x7e`, so a regular expression was written as the equivalent `[!-~]`.
  - `\\b` became a backspace, and the script's match check stopped it.
- **Severity:** Low. It costs a retry, but a script without that check could write the wrong text.
- **Workaround:** used the Edit tool for any text with backslashes, or wrote the script to a file first.
- **Suggestion:** pass commands to the shell unchanged, or document the escaping the tool applies.

## 2026-10-19: `adb shell input keyevent` lands about 0.85 s after it is sent

- **Date:** 2026-10-19 (met again the same day)
- **Tool:** adb with the Android TV (API 30) emulator
- **Task attempted:** select an option on the TV for the MCP smoke test by pressing Enter while it is lit.
- **Steps taken:** took a screenshot to see the lit card, then sent `adb shell input keyevent 66` from the host; timed
  both commands.
- **Expected:** a key press that arrives within about 100 ms, like a remote's.
- **Actual:** each `input keyevent` took 800 to 900 ms (the tool starts a Java process on the device for every call),
  and a raw `adb exec-out screencap` took 800 to 1,000 ms. Presses aimed at the first card arrived at the end of its
  2 s window, so the engine scanned the top two again instead of committing; four presses committed nothing.
- **Severity:** Medium. Timed presses from the host select the wrong moment.
- **Workaround:** manual timing tests used the PC keyboard; scripted replays used the emulator's gRPC input. Earlier, a
  short shell script on the device took screenshots with `screencap`, reads the card's pixel with
  `dd` and `od`, and runs `input keyevent 66` there as soon as the card lights up; it arrived about 0.75 s into the
  2 s window and committed with one press. (`sendevent` is still refused, as in the 2026-10-18 entry.) Met again the
  same day: in one of three runs, the press from the same script landed at the end of Tea's window, and the TV asked to
  confirm between Tea and Coffee ("Not sure yet") instead of committing. The end-to-end script now waits 3 s after a
  press and presses again if nothing was committed; it committed with one press in the run kept.
- **Suggestion:** a low-latency key-injection command for emulators (for example a console `event send` that reaches
  the app), or an `input` daemon that does not start a new process per key.

## 2026-10-19: Git Bash rewrites device paths in `adb push`

- **Date:** 2026-10-19 (met again 2026-10-21)
- **Tool:** Git for Windows (Git Bash, MSYS2 path conversion) with adb
- **Task attempted:** copy a script to `/data/local/tmp` on the emulator.
- **Steps taken:** ran `adb push script.sh /data/local/tmp/script.sh` in Git Bash.
- **Expected:** the file is copied to that path on the device.
- **Actual:** Git Bash turned the device path into `C:/Program Files/Git/data/local/tmp/...`, and adb failed with
  `remote secure_mkdirs failed`.
- **Severity:** Low. The error names the rewritten path.
- **Workaround:** `MSYS_NO_PATHCONV=1 adb push ...`; a device path inside a quoted `adb shell "..."` string is left
  alone. Met again on 2026-10-21: with `MSYS_NO_PATHCONV=1`, a host path written the Git Bash way (`/c/...`) is not
  converted either, and adb failed with `cannot stat`. Writing the host path as `C:/...` worked.
- **Suggestion:** Git Bash could skip path conversion for arguments of known device tools such as adb, or warn when it
  rewrites one.

## 2026-10-19: The MCP TypeScript SDK's root import fails

- **Date:** 2026-10-19
- **Tool:** `@modelcontextprotocol/sdk` 1.32.1 (npm)
- **Task attempted:** check the SDK's entry points before writing the MCP server.
- **Steps taken:** ran `import('@modelcontextprotocol/sdk')` in Node 24.
- **Expected:** the package root loads, as its `exports` map lists a `"."` entry.
- **Actual:** `ERR_MODULE_NOT_FOUND`: the `"."` entry points at `dist/esm/index.js` (and `dist/cjs/index.js`), and
  neither file is in the package.
- **Severity:** Low. Every documented import uses a subpath such as `@modelcontextprotocol/sdk/server/mcp.js`.
- **Workaround:** import from subpaths only.
- **Suggestion:** ship the root files, or drop the `"."` entry from `exports`.

## 2026-10-19: Strands' MCPClient hides why its start-up failed

- **Date:** 2026-10-19
- **Tool:** Strands Agents 1.61.1 (`strands.tools.mcp.MCPClient`) with `mcp` 1.30.0
- **Task attempted:** stop the agent at start-up with a clear message when the MCP server is down or refuses the token.
- **Steps taken:** called `MCPClient(url=..., headers=...).start()` against a closed port, and against a server
  answering 401.
- **Expected:** an error that says "connection refused" or "401 Unauthorized".
- **Actual:** both raised `MCPClientInitializationError('the client initialization failed: unhandled errors in a
  TaskGroup (1 sub-exception)')`. The cause, `httpx.ConnectError` or `httpx.HTTPStatusError` (401), is only inside
  `__cause__.exceptions[0]`. A closed loopback port also takes about 2.1 s to fail on Windows.
- **Severity:** Low. The cause can be found by walking the chain.
- **Workaround:** the agent walks `__cause__` and `ExceptionGroup.exceptions` for an HTTP status or a transport error.
- **Suggestion:** put the innermost cause in the message (for example "401 Unauthorized from <url>"), or raise it
  directly.

## 2026-10-19: Strands' MCPClient warns about its own calls to the MCP SDK

- **Date:** 2026-10-19
- **Tool:** Strands Agents 1.61.1 with `mcp` 1.30.0
- **Task attempted:** run the agent's tests without warnings.
- **Steps taken:** created `MCPClient(url=..., headers=...)`, started it, stopped it, and also started it against a
  server that refused it.
- **Expected:** no warnings from the documented way to connect over Streamable HTTP.
- **Actual:**
  - Every start warned `DeprecationWarning: Use streamable_http_client instead`. On `mcp` 1.x, Strands' `url=` form
    calls the deprecated `streamablehttp_client`.
  - A failed start also warned `RuntimeWarning: coroutine 'MCPClient.stop.<locals>._set_close_event' was never
    awaited`.
- **Severity:** Low. Nothing fails.
- **Workaround:** the agent's pytest configuration ignores exactly these two messages.
- **Suggestion:** call `streamable_http_client` with an `httpx.AsyncClient` on `mcp` 1.x, and close the event without
  creating the coroutine when the loop has already stopped.

## 2026-10-19: Strands prints and logs conversation content by default

- **Date:** 2026-10-19
- **Tool:** Strands Agents 1.61.1
- **Task attempted:** run the agent as a service whose logs never hold caregiver text or answers.
- **Steps taken:** read the `Agent` constructor and the event loop's log calls, then ran a turn whose model wrote broken
  tool JSON.
- **Expected:** a library that prints nothing unless asked, and logs no message content above DEBUG.
- **Actual:**
  - The default `callback_handler` (`PrintingCallbackHandler`) prints the model's text and each tool name to stdout,
    also during `stream_async`.
  - When the model's tool input is not valid JSON, `strands.event_loop.streaming` logs up to 200 characters of it at
    WARNING. Python's last-resort handler then prints it to stderr, because Strands installs no handler.
- **Severity:** Medium for services handling personal messages; nothing warns about it.
- **Workaround:** `Agent(..., callback_handler=None)`, and the `strands` logger set to CRITICAL, since its ERROR lines
  also print a full traceback on every failed MCP start-up and name tools the model made up. Tests check that broken
  tool input, a made-up tool name and a start-up traceback never reach the logs.
- **Suggestion:** default to no printing outside interactive use, and log only the tool name and the input's length.

## 2026-10-19: uvicorn runs a bound method as an ASGI2 app

- **Date:** 2026-10-19
- **Tool:** uvicorn 0.54.0
- **Task attempted:** serve the tests' stub MCP server, an `async def asgi(self, scope, receive, send)` method, with
  uvicorn.
- **Steps taken:** passed `self.asgi` to `uvicorn.Config(...)` and started the server in a thread.
- **Expected:** uvicorn detects the ASGI3 signature, as it does for a plain `async def` function.
- **Actual:** lifespan start-up failed with `TypeError: StubServer.asgi() missing 2 required positional arguments:
  'receive' and 'send'`. The interface check looks at `__call__` of a bound method, which is not a coroutine function,
  so uvicorn treated the app as ASGI2.
- **Severity:** Low. The error names the missing arguments.
- **Workaround:** `uvicorn.Config(..., interface="asgi3")`.
- **Suggestion:** unwrap bound methods (`inspect.ismethod`) before the coroutine check.

## 2026-10-19: Starlette 1.9's TestClient deprecates httpx

- **Date:** 2026-10-19
- **Tool:** Starlette 1.9.0 (`starlette.testclient`) with httpx 0.28.1
- **Task attempted:** test the agent's HTTP interface with Starlette's TestClient.
- **Steps taken:** imported `starlette.testclient.TestClient`.
- **Expected:** no warning with the httpx release that the MCP SDK already installs.
- **Actual:** `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead`.
- **Severity:** Low. The tests run.
- **Workaround:** the agent's pytest configuration ignores this message; httpx2 was not added.
- **Suggestion:** name the Starlette release that will drop httpx support in the warning.

## 2026-10-19: boto3 sends a Bedrock API key from the environment even when an SSO profile is named

- **Date:** 2026-10-19
- **Tool:** boto3 and botocore 1.43.114, through Strands Agents 1.61.1's `BedrockModel`
- **Task attempted:** make the agent's live mode sign in only with the IAM Identity Center (SSO) profile in
  `AWS_PROFILE`.
- **Steps taken:** a review experiment built `BedrockModel(boto_session=boto3.Session(profile_name=...))` with a
  synthetic `AWS_BEARER_TOKEN_BEDROCK` in the environment, then called `converse_stream` against a stub.
- **Expected:** an explicitly named profile decides the credentials, as it does for access keys in the environment
  (botocore skips its environment-variable provider when a profile is named).
- **Actual:** the request went out with `Authorization: Bearer <the API key>` and no SigV4 signature, and nothing
  warned about it. botocore prefers bearer auth for Bedrock whenever `AWS_BEARER_TOKEN_BEDROCK` is set and no
  signature version is configured in code.
- **Severity:** Medium. A long-term key silently replaces short-lived SSO credentials.
- **Workaround:** live mode refuses to start while `AWS_BEARER_TOKEN_BEDROCK` is set. A test checks this.
- **Suggestion:** let an explicitly named profile take precedence over the bearer token, or log a warning when the
  bearer token overrides a named profile.

## 2026-10-20: Bedrock refuses every call while the AWS account is being verified

- **Date:** 2026-10-20 (the refusals lasted overnight)
- **Tool:** Amazon Bedrock Runtime (Converse), through the AWS SDK for JavaScript 3.1146.0 with an `aws login` profile
- **Task attempted:** the first live run against Nova 2 Lite (`eu.amazon.nova-2-lite-v1:0`, eu-central-1) with a forced
  tool call, to settle temperature and maxTokens.
- **Steps taken:** signed in with `aws login`. `aws polly describe-voices` in eu-north-1 worked with the same profile.
  Then 30 Converse calls were sent, one per evaluation question.
- **Expected:** tool-call responses, or an error naming a missing permission.
- **Actual:** all 30 calls failed with `AccessDeniedException: Your account is currently being verified. Verification
  normally takes less than 2 hours. Until your account is verified, you may not have access to this operation.` The
  first calls were refused overnight, well past the stated 2 hours. The live evaluation and the live end-to-end run
  were blocked until it cleared.
- **Severity:** High. It blocks every live AI step.
- **Workaround:** mock mode until the verification cleared. The experiment script did not stop at the first refusal,
  so all 30 calls went out within a few seconds; no AWS call was made after that.
- **Suggestion:** give account verification its own error code, so it is not read as an IAM denial. Show the
  verification state and its expected end on the Bedrock console's model access page.

## 2026-10-20: Amazon Polly in eu-central-1 is refused; the allowed Region has no neural voices

- **Date:** 2026-10-20
- **Tool:** Amazon Polly (SynthesizeSpeech), with an AWS-managed service control policy
- **Task attempted:** synthesise speech with a neural voice (default `Brian`) from the server, in eu-central-1 beside
  Bedrock.
- **Steps taken:** called Polly in eu-central-1 with the project role's credentials. Other steps are not recorded.
- **Expected:** SynthesizeSpeech works in eu-central-1, alongside Bedrock.
- **Actual:** `AccessDenied`: an explicit deny from an AWS-managed service control policy that allows Polly only in
  eu-north-1, which has no neural voices. The console's "Enable advanced features" option cannot be undone and needs
  a paid plan, so it was not used.
- **Severity:** High. Speech could not be produced in the chosen Region until a workaround was found.
- **Workaround:** the standard voices Brian and Amy in eu-north-1 (`SVAVAK_POLLY_REGION`, `SVAVAK_POLLY_ENGINE`).
- **Suggestion:** state the Region limit of the managed policy in its description, and in the error message name the
  policy that denies the call. Say on "Enable advanced features" that it cannot be undone, and what it costs, before
  the user chooses it.

## 2026-10-20: The emulator console's `event send` answers OK but no key reaches the guest

- **Date:** 2026-10-20
- **Tool:** Android Emulator 37.2.12 console, through `adb emu` (Android TV API 30 image, Windows 11)
- **Task attempted:** inject one clean 2.5 s Enter hold (one key-down, one key-up) to check the TV's hold for Help.
- **Steps taken:**
  - `adb -s emulator-5554 emu event send EV_KEY:KEY_ENTER:1 EV_SYN:SYN_REPORT:0`, then the same with `EV_SYN:0:0`.
  - `getevent -lt` recorded every input device in the guest meanwhile.
- **Expected:** a DOWN and an UP event on the virtual keyboard, and Help opening.
- **Actual:**
  - `SYN_REPORT` is not an accepted alias: the console answered `KO: invalid event code`, yet `adb emu` exited 0.
  - With `EV_SYN:0:0` the console answered `OK`, but no event reached any input device and the app saw nothing.
  - `adb shell sendevent` was refused (permission denied) on this `user` build, which cannot run `adb root` either.
- **Severity:** Medium. The console's documented way to inject keys silently does nothing.
- **Workaround:** the emulator's gRPC endpoint, `EmulatorController/sendKey`. Its port and token are in the running
  emulator's discovery file under `%LOCALAPPDATA%\Temp\avd\running`, and the call delivered both events.
- **Suggestion:** route `event send` to the input device the emulator uses for host keys, or answer KO. Make
  `adb emu` exit non-zero on a KO, and list the `EV_SYN` codes.

## 2026-10-20: Holding a PC key in the emulator reaches Android as press-release pairs

- **Date:** 2026-10-20
- **Tool:** Android Emulator 37.2.12 (Qt 6 window, Windows 11)
- **Task attempted:** hold the switch (Enter) for 2 s to open Help.
- **Steps taken:**
  - Held Enter on the PC keyboard for 30 s; the `getevent -l` capture showed one DOWN and then many UP lines.
  - Replayed the host's auto-repeat through gRPC `sendKey`: a key-down every 33 ms for 2.5 s, then one key-up.
- **Expected:** one DOWN, then Android's own key repeats, and one UP when the key is released.
- **Actual:** the kernel got 57 DOWN and 57 UP events, alternating about 46 ms apart. The app saw one short press
  followed by bounces, so Help never opened. A clean key-down and key-up 2.5 s apart opened Help.
- **Severity:** Medium. A held key cannot be demonstrated with the PC keyboard unless the app copes with the bounces.
- **Workaround:** chatter-tolerant input in the app (a key-down shortly after a release counts as the same press),
  checked by replaying the captured pattern through gRPC `sendKey`. A physical remote or switch, or a clean key-down
  and key-up through gRPC `sendKey`, also works.
- **Suggestion:** drop the host's auto-repeat events, or pass them on as key repeats (EV_KEY value 2) instead of
  release-press pairs.

## 2026-10-20: Git Bash rewrites a device path inside an adb argument

- **Date:** 2026-10-20
- **Tool:** Git for Windows bash (MSYS2)
- **Task attempted:** run `sendevent /dev/input/event2 ...` in the emulator through `adb shell`, from a Node script
  started in Git Bash.
- **Steps taken:** passed `/dev/input/event2` as a command-line argument.
- **Expected:** the path reaches the device unchanged.
- **Actual:** MSYS path conversion turned it into `C:/Program Files/Git/dev/input/event2`, and `sendevent` failed
  with "Max 4 arguments".
- **Severity:** Low. It is documented MSYS behaviour.
- **Workaround:** `MSYS_NO_PATHCONV=1` for that command.
- **Suggestion:** do not convert arguments passed to native Windows programs that forward them to a remote shell,
  such as adb.

## 2026-10-20: The Nova 2 docs disagree on tool-call temperature and on maxTokens

- **Date:** 2026-10-20
- **Tool:** Amazon Nova 2 user guide and the Bedrock model card for Nova 2 Lite
- **Task attempted:** choose `temperature` and `maxTokens` for the server's forced tool call.
- **Steps taken:** read the Nova 2 Troubleshooting page, the advanced prompting guide, the request schema, the Converse
  page and the model card.
- **Expected:** one recommendation and one limit.
- **Actual:**
  - Temperature: Troubleshooting says 0 for tool calls, while the prompting guide says 0.7 with topP 0.9 (reasoning
    off).
  - maxTokens: the request schema says at most 5,000, while the model card says 64K and the Converse page 65,000.
  - The Bedrock pricing page did not show its prices in the browser, so the token prices came from the public Price
    List files.
- **Severity:** Low. The settings can be measured instead.
- **Workaround:** kept temperature 0 and maxTokens 1000 until real responses can be measured (the server logs output
  tokens and stop reason per call).
- **Suggestion:** one recommended setting for tool use with Nova 2, and one documented output limit.

## 2026-10-20: The app opens in Expo Go instead of the development build

- **Date:** 2026-10-20 (met again 2026-10-22)
- **Tool:** Expo development builds (Expo CLI and Metro, SDK 54) on the Android TV emulator
- **Task attempted:** open the SvaVāk development build on the Android TV emulator from the running Metro server.
- **Steps taken:** ran `yarn workspace tv start`. Metro said it was using Expo Go. Pressing `a` opened the app inside
  Expo Go; pressing `s`, then `a`, opened the development build.
- **Expected:** pressing `a` in Metro opens the SvaVāk development build in landscape.
- **Actual:** it opened inside Expo Go, portrait and cropped, where the switch did nothing.
- **Severity:** Medium. Nothing says that the wrong host app is showing the project.
- **Workaround:** press `s` in Metro to switch to the development build, then `a` to open it on Android.
- **Suggestion:** when a development build is installed for the project, Metro should open it by default, or say
  which host app it opened.

## 2026-10-21: `git mv` of a folder fails with "Permission denied" on Windows

- **Date:** 2026-10-21 (met again the same day)
- **Tool:** Git for Windows (Git Bash), Windows 11
- **Task attempted:** rename the agent's Python package folder for the product rename to SvaVāk.
- **Steps taken:** ran `git mv services/agent/say_when_agent services/agent/svavak_agent`.
- **Expected:** the folder and its tracked files are renamed.
- **Actual:** `fatal: renaming 'services/agent/say_when_agent' failed: Permission denied`. No process of this session
  held the folder; it still had a git-ignored `__pycache__` folder in it.
- **Severity:** Low. A short workaround exists.
- **Workaround:** created the new folder and ran `git mv` on each tracked file, then removed the old `__pycache__` and
  the empty folder. Met again the same day with a plain `mv` of an untracked draft folder, one of whose files the
  Claude desktop app had just opened in its Browser pane; copying the folder and deleting the old one worked.
- **Suggestion:** fall back to moving the tracked files one by one when renaming the folder fails, or name the file
  that blocked it.

## 2026-10-21: With a scheme set, `expo run:android` opens the app through a dev-client link

- **Date:** 2026-10-21
- **Tool:** Expo CLI (SDK 54) `expo run:android --no-bundler`, React Native 0.81 debug build (react-native-tvos)
- **Task attempted:** install and start the renamed TV app after adding the `svavak` scheme.
- **Steps taken:** ran `yarn workspace tv expo run:android --no-bundler` with Metro on port 8081.
- **Expected:** the app starts as it does from the launcher.
- **Actual:** the CLI opened `svavak://expo-development-client/?url=http%3A%2F%2F<host LAN address>%3A8081`, although
  the app has no dev client. The app started, but a LogBox banner ("Open debugger to view warnings") covered the
  question band. After `am force-stop` and a normal start, no banner appeared.
- **Severity:** Low. It only affects the first start after an install.
- **Workaround:** restart the app normally (`adb shell am force-stop dev.svavak.tv`, then start it from the launcher or
  with `am start`) before recording.
- **Suggestion:** open the launcher activity when the project has no `expo-dev-client`.

## 2026-10-21: The Google TV launcher on the emulator draws blank app tiles

- **Date:** 2026-10-21
- **Tool:** Android TV emulator image with the Google TV home (API 30, no internet on its Wi-Fi)
- **Task attempted:** confirm that the launcher shows the renamed app's banner and label.
- **Steps taken:** pressed Home, then opened the Apps tab with the D-pad.
- **Expected:** the installed apps' banners.
- **Actual:** five empty tiles; the banners appeared only after focus moved onto the row, and the label only on the
  focused tile.
- **Severity:** Low.
- **Workaround:** moved focus onto the row, then onto the app, before the screenshot.
- **Suggestion:** draw installed apps' banners without waiting for focus or network.

## 2026-10-21: Metro falls back to a full crawl when another Metro shares the project

- **Date:** 2026-10-21
- **Tool:** Metro (Expo CLI, SDK 54)
- **Task attempted:** start a second Metro for the renamed TV app on port 8081, while an earlier one still ran on 8082
  for the same project.
- **Steps taken:** ran `yarn workspace tv expo start --port 8081`.
- **Expected:** a normal start.
- **Actual:** `Error while reading cache, falling back to a full crawl: Error: Unable to deserialize cloned data.`
  The bundle then built and served normally.
- **Severity:** Low. Nothing failed.
- **Workaround:** none needed.
- **Suggestion:** say which cache file was unreadable and whether another Metro is using it.

## 2026-10-21: Claude Code's Bash tool fails on some quoting that bash accepts

- **Date:** 2026-10-21
- **Tool:** Claude Code (desktop app) Bash tool, running Git Bash on Windows 11
- **Task attempted:** check line endings and edit test files from shell commands.
- **Steps taken:**
  - ran `for f in ...; do echo "$f crlf=$(grep -c $'\r$' $f)"; done`;
  - ran a quoted heredoc (`python - <<'EOF'`) of about 90 lines whose Python held triple-quoted strings with
    apostrophes.
- **Expected:** bash runs both: ANSI-C quoting inside a command substitution, and a quoted heredoc's body taken
  literally.
- **Actual:** the first failed with `/usr/bin/bash: eval: line 1: unexpected EOF while looking for matching ')'`, the
  second with `/usr/bin/bash: -c: line 93: unexpected EOF while looking for matching '''`. Nothing ran, so no file
  changed. A shorter heredoc of the same form worked in the same session.
- **Severity:** Low. Each costs a retry.
- **Workaround:** counted carriage returns with `tr -cd '\r' < "$f" | wc -c`, and made the edits with the Edit tool.
- **Suggestion:** pass commands to bash unchanged, or document the wrapping the tool applies (see also the backslash
  entry of 2026-10-19).

## 2026-10-21: Stopping a background shell leaves its server running

- **Date:** 2026-10-21
- **Tool:** Claude Code (desktop app) background Bash tasks and TaskStop, Windows 11
- **Task attempted:** restart the mock server and agent on new code.
- **Steps taken:** started `corepack yarn workspace server start` and `uv run python -m svavak_agent` as background
  tasks, then stopped both tasks with TaskStop.
- **Expected:** the processes they started end too.
- **Actual:** TaskStop reported success, but the server's `node` process kept listening on 127.0.0.1:8787; the
  shell had ended, its child had not.
- **Severity:** Medium. A stale server answers later checks with old code.
- **Workaround:** looked up the listener with `netstat -ano` and ended it with `Stop-Process`, then stopped servers
  by port from then on.
- **Suggestion:** end the whole process tree of a stopped background task on Windows, or say which children are still
  running.

## 2026-10-21: After `am force-stop`, the Google TV launcher takes the front back

- **Date:** 2026-10-21
- **Tool:** Android TV emulator image with the Google TV home (API 30), adb
- **Task attempted:** restart the TV app on new JavaScript with `am force-stop dev.svavak.tv`, then
  `am start -n dev.svavak.tv/.MainActivity`.
- **Steps taken:** ran the two commands one after the other, with the app in front.
- **Expected:** the app restarts in front.
- **Actual:** the activity manager logged the app's start, but the launcher started its own MainActivity 80 ms later
  and stayed in front; the app ran behind it.
- **Severity:** Low.
- **Workaround:** run `am start` again a few seconds later ("its current task has been brought to the front").
- **Suggestion:** the launcher should not bring itself back when another app's activity is already starting.

## 2026-10-21: Strands and the MCP SDK print to stderr when a turn is cancelled mid tool call

- **Date:** 2026-10-21
- **Tool:** Strands Agents 1.61.1 (`MCPClient`) with `mcp` 1.30.0
- **Task attempted:** close each turn's own MCP session when the caregiver panel disconnects during `get_answer`.
- **Steps taken:** a real uvicorn agent and the stub server; the stub held `get_answer`; the client went away mid-turn;
  the turn's `finally` stopped its `MCPClient`.
- **Expected:** a quiet shutdown.
- **Actual:** the session was still ended (DELETE) and the next turn worked, but asyncio printed `Task was destroyed
  but it is pending! task: <Task pending ... coro=<MCPClient._invoke_on_background_thread.<locals>.run_async.<locals>
  .wait_for_cancel() ...>>`, and `mcp` logged `Error parsing SSE message` with an anyio `ClosedResourceError`
  traceback. Neither held caregiver text, an answer or the token.
- **Severity:** Low. Nothing fails.
- **Workaround:** none; left as is.
- **Suggestion:** let `MCPClient.stop()` wait for its own clean-up task, and have the SDK treat a stream closed by its
  own client as a normal end.

## 2026-10-21: The AWS account has no IAM users, and the `aws login` session lasts about an hour

- **Date:** 2026-10-21 (two failed calls that day, 100 minutes apart)
- **Tool:** AWS account (the new AWS experience, with no IAM users), AWS CLI 2.38.2 and the AWS SDKs with an
  `aws login --profile` profile for the project role, Bedrock Runtime in eu-central-1
- **Task attempted:** the live Bedrock check, then the live server and agent runs.
- **Steps taken:** the account has no IAM users, so every call went through the project role. The user signed in with
  `aws login --profile <profile>` at about 06:30 and again at 09:20 CEST. At 2026-10-21 05:35 UTC one
  `aws bedrock-runtime converse` call to `eu.amazon.nova-2-lite-v1:0` was made with `maxTokens` 16 and retries off
  (`AWS_MAX_ATTEMPTS=1`). Calls at 07:35 and 09:17 CEST failed, and a call at 09:26 CEST worked.
- **Expected:** a sign-in that lasts a working session, or a clear expiry time; a short reply, or an error from
  Bedrock.
- **Actual:** the credentials stopped refreshing about an hour after each sign-in, with two different messages. The
  first call stopped before reaching Bedrock, exit code 255: `aws: [ERROR]: Unable to create or refresh login
  credentials due to insufficient permissions. You may be missing permission for the 'signin:CreateOAuth2Token'
  action.` (the error code behind it was `LoginInsufficientPermissions`). A second call at 07:17 UTC failed before
  reaching Bedrock with a different message: `aws: [ERROR]: Your session has expired. Please reauthenticate using
  'aws login'.` When the session ended during a live run, the running server and agent failed mid-run. The first live
  run was finished within the hour: the probe at 07:26 UTC, the last call at about 07:32 UTC. All AWS work stopped at
  each failure, with no retry.
- **Severity:** High. It blocks every live step until the user signs in again.
- **Workaround:** log in again with `aws login --profile <profile>` and restart both the server and the agent. Sign in
  just before a live run and do the AWS calls first.
- **Suggestion:** say whether the stored sign-in expired or the identity lacks the permission, and name the command
  that fixes it: the two calls gave two different reasons for what looks like one expired sign-in. Print the session's
  expiry at sign-in, and say "expired" in both messages.

## 2026-10-21: TypeScript's DOM and Node typings disagree on `TextDecoderStream`

- **Date:** 2026-10-21
- **Tool:** TypeScript 5.9.3 with `lib: ["DOM"]` and `@types/node` 24.19.1 in one project (the caregiver studio)
- **Task attempted:** decode a `fetch` response body as text with `body.pipeThrough(new TextDecoderStream())`.
- **Steps taken:** ran `yarn workspace studio typecheck`; the project includes Node types for its Vite and Playwright
  configs.
- **Expected:** it compiles, as the same code runs in the browser.
- **Actual:** `TS2345: Argument of type 'TextDecoderStream' is not assignable to parameter of type
  'ReadableWritablePair<string, Uint8Array<ArrayBufferLike>>' ... Type 'BufferSource' is not assignable to type
  'Uint8Array<ArrayBufferLike>'`.
- **Severity:** Low.
- **Workaround:** read the body with `getReader()` and a `TextDecoder` in streaming mode instead.
- **Suggestion:** align the two typings of the streams API, or say in the docs which to use when both are loaded.

## 2026-10-21: React Native's Android WebSocket sends an Origin header

- **Date:** 2026-10-21
- **Tool:** React Native 0.81 (react-native-tvos 0.81.5-2), `WebSocketModule.kt`
- **Task attempted:** refuse `/v1/stream` to any browser Origin but the studio's, on the understanding that the TV
  sends none.
- **Steps taken:** added the Origin check; the server's tests passed; then the TV app on the emulator was left on
  practice questions, and the server logged no connection from it.
- **Expected:** a native client sends no `Origin`, as Node's `ws` and the TV's `fetch` do not.
- **Actual:** when the app sets no `Origin`, React Native's Android WebSocket adds one derived from the URL
  (`getDefaultOrigin`): `http://10.0.2.2:8787` on the emulator. The check answered 403, so the TV fell back to
  practice.
- **Severity:** Medium. Nothing on the TV said why it could not connect.
- **Workaround:** the server also accepts the emulator TV's origin, `http://10.0.2.2:8787`, as a fixed value (not the
  request's own Host, which a DNS-rebound page could match); a test covers it, and the emulator connected again.
- **Suggestion:** document the default `Origin` in React Native's WebSocket guide.

## 2026-10-21: Metro stops serving the bundle after `yarn install`

- **Date:** 2026-10-21
- **Tool:** Metro (Expo CLI, SDK 54) with Yarn 4.5 workspaces (`nodeLinker: node-modules`)
- **Task attempted:** keep the TV app on the emulator running while the studio's dependencies were added.
- **Steps taken:** Metro ran on port 8081; `yarn install` added the studio workspace; the app was then restarted.
- **Expected:** Metro picks up the changed `node_modules` and serves the bundle.
- **Actual:** the app showed "Refreshing..." and then "Loading from 10.0.2.2:8081..." with no end; Metro answered
  `/status` but its bundle stayed at 0%.
- **Severity:** Low. A restart fixes it.
- **Workaround:** restarted Metro with `--clear`, then the app.
- **Suggestion:** Metro could notice that `node_modules` was relinked and rebuild its file map, or say so in its log.
- **Seen again:** 2026-10-22 (B12). After `yarn workspace switchclock add` installed `@stdlib/math-base-special-erfc`
  and 136 other packages, the Metro already running on 8081 answered the Android bundle request with HTTP 500,
  `UnableToResolveError` for `@stdlib/constants-float64-high-word-sign-mask`, although the package was on disk and Node
  resolved it. A separate `expo export --platform android` (a fresh Metro) bundled the app without errors.

## 2026-10-21: Nova 2 Lite made up options the agent policy forbids

- **Date:** 2026-10-21
- **Tool:** Amazon Nova 2 Lite (`eu.amazon.nova-2-lite-v1:0`) through Strands Agents 1.61.1, temperature 0.2
- **Task attempted:** the live footage turn "Ask Sam what he'd like to watch tonight".
- **Steps taken:** the agent's system prompt said "Pass options only when the caregiver named them."
- **Expected:** `ask_question` without options, so the server suggests replies from Sam's profile (cricket).
- **Actual:** the model passed six options of its own ("Movie", "TV show", "Documentary", "News", "Game show",
  "Not sure"), so no cricket reply could appear.
- **Severity:** Medium. The footage turn failed.
- **Workaround:** the policy now names the case: "Never make options up: for an open question, such as what Sam would
  like to watch, leave options out". The next turns asked without options.
- **Suggestion:** none for the model; a prompt rule needs an example of the case it forbids. Nova's prompting guide
  could say so.

## 2026-10-21: The Android TV emulator's clock ran about 52 minutes behind the host

- **Date:** 2026-10-21
- **Tool:** Android Emulator 37.2.12 (Android TV, API 30), Windows 11
- **Task attempted:** find out why the TV app on the emulator did not answer `tools/mcp-smoke.mjs`.
- **Steps taken:** read `adb logcat` for the app's process and compared its times with the server's log.
- **Expected:** the guest's clock follows the host's.
- **Actual:** `adb shell date` showed 09:19:56 GMT while the host showed 10:12:12 UTC, so the app's latest log lines
  looked about an hour old and the app looked frozen. It was running; the smoke script had pressed before the app
  reconnected.
- **Severity:** Low. It cost time while reading logs.
- **Workaround:** compare `adb shell date` with the host's time before reading guest log times.
- **Suggestion:** the emulator should keep the guest clock in step with the host after the host sleeps or resumes,
  or show the offset in its extended controls.

## 2026-10-21: Metro started with CI=1 does not pick up code changes

- **Date:** 2026-10-21
- **Tool:** Expo CLI (Expo SDK 54.0.37), `expo run:android` and `expo start`
- **Task attempted:** load a change to the TV app's key handling on the emulator.
- **Steps taken:** started the app with `CI=1 yarn workspace tv android` from a script, then changed
  `apps/tv/src/switchInput.ts`.
- **Expected:** the app reloads with the change, or the CLI says how to get it.
- **Actual:** Metro printed "Metro is running in CI mode, reloads are disabled. Remove CI=true to enable watch mode."
- **Severity:** Low. The message names the cause.
- **Workaround:** stop Metro, start it again with `CI=1 yarn workspace tv start`, then force-stop and start the app.
- **Suggestion:** a flag for a non-interactive Metro that still watches files.

## 2026-10-21: In the emulator, a closed port on the host is not refused

- **Date:** 2026-10-21
- **Tool:** Android Emulator 37.2.12 (Android TV, API 30), Windows 11
- **Task attempted:** check the TV app's "Couldn't send the help request." screen with the server stopped.
- **Steps taken:** stopped the server on the host's port 8787, held the switch on the emulator through gRPC `sendKey`,
  and took screenshots every 2 s; then ran `toybox nc -w 10 10.0.2.2 8787` (and port 1) in `adb shell`.
- **Expected:** a connection to a host port with nothing listening is refused at once, as on a real network, so the
  failure shows at once.
- **Actual:** `nc` ended with "Timeout" after about 1.4 s, not "Connection refused"; a connection to Metro's port
  8081 opened in 46 ms. The app's request ended only when its own 4 s timeout fired (`AbortError`), twice with its one
  retry, so "Asking for help…" stayed on screen about 8 s before the failure line.
- **Severity:** Low. The app's timeout bounds it, and it only slows the offline case.
- **Workaround:** none needed; wait out the timeouts when checking the offline screens.
- **Suggestion:** answer a guest's connection to a closed host port with a reset, as the host itself does.

## 2026-10-21: Nova 2 Lite repeats earlier answers to an unrelated question

- **Date:** 2026-10-21
- **Tool:** Amazon Bedrock Runtime (Converse), Amazon Nova 2 Lite (`eu.amazon.nova-2-lite-v1:0`, eu-central-1), a
  forced tool call at temperature 0
- **Task attempted:** keep reply suggestions on the current question.
- **Steps taken:** on a fresh server, asked "What would you like to watch tonight?" (answered "Cricket game, please"),
  added the fact "Sam loves old Bollywood films", asked it again (answered "Old Bollywood film?"), then asked "What
  would you like for dinner?". The prompt gave the question first, then the earlier turns and the profile facts, and
  said "Use facts only when they are relevant". Then four rules were added: every reply answers the current question,
  context only where it fits, no topic carried into an unrelated question, no facts merged into one reply.
- **Expected:** replies about dinner.
- **Actual:** the dinner question's first four were the earlier answers: "Cricket game, please", "Old Bollywood film?",
  "Yes, cricket". With such rules added, the replay still put "Cricket highlights, please" and "An old Bollywood film"
  first, and 2 of 10 probe calls were clean; with the turns also marked as background, 5 of 10; with them marked and
  only the latest turn sent, 0 of 10 ("The same as last time, a Bollywood film"). Some replies bent the old answer to
  the new question ("I want the Bollywood film for dinner"). Only moving the question after the turns and facts gave
  10 of 10. At temperature 0 the same request still gave different replies from call to call, so one run settles
  nothing.
- **Severity:** Medium. Off-topic replies take the first row, which the person scans first.
- **Workaround:** (21 Oct) the question last in the user message, the earlier turns labelled as background, and rules
  that name the question's subject first and leave out context about another subject. Checked on 3 fresh-server replays
  (all clean) and the 30-question evaluation, where facts still slipped in now and then: one run put "I prefer tea to
  coffee" and "Sam likes cricket" in the first four for "Soup or a sandwich for lunch?". Over 60 more calls per prompt,
  a fact landed on a question not about it in 2 first fours (4 with the old prompt).
- **Suggestion:** say in the Nova prompting guidance where the question should go when earlier turns come as context,
  and whether temperature 0 is meant to repeat.

## 2026-10-21: Chrome blocks speech synthesis until the page has been clicked

- **Date:** 2026-10-21
- **Tool:** Chrome (Web Speech API, `speechSynthesis`), in the caregiver studio
- **Task attempted:** speak the TV's alerts (for example a help request) aloud in the studio as soon as they arrive.
- **Steps taken:** an alert arrived before any click on the studio page; `speechSynthesis.speak` did nothing.
- **Expected:** a help alert is spoken as soon as it arrives.
- **Actual:** it stayed silent until the page had been clicked or typed into, because Chrome needs a user gesture
  before speech.
- **Severity:** Medium. A help request could go unheard without any sign of failure.
- **Workaround:** queue alerts until the first click or key, then speak them; queued speech now plays then.
- **Suggestion:** reject the `speak()` call or fire an `error` event on the utterance with a named reason (such as
  "not-allowed") when user activation is missing, and say so in the Web Speech documentation.

## 2026-10-22: Fast Refresh ran new code against an object the old code had made

- **Date:** 2026-10-22
- **Tool:** Metro with React Native Fast Refresh (Expo SDK 54.0.37, react-native-tvos 0.81.5-2), the TV app's dev build
  on the Android TV emulator
- **Task attempted:** add question announcements to the TV app's conversation state machine, with the app running on
  the emulator from the shared Metro.
- **Steps taken:** edited `apps/tv/src/conversation.ts`, which exports the `Conversation` class that the screen creates
  once with `useMemo`, while the app was running.
- **Expected:** Fast Refresh reloads the app in full when a module that is not a component changes.
- **Actual:** the app logged `TypeError: this.quiet is not a function (it is undefined)` (`isComponentError: true`):
  new code apparently ran against the `Conversation` made by the old module, which has no `quiet` method (the cause is
  inferred, not confirmed).
- **Severity:** Low. It only happens while editing, and a relaunch clears it.
- **Workaround:** force-stop and start the app after editing a module that is not a component, before checking
  anything on the emulator.
- **Suggestion:** Fast Refresh should fall back to a full reload when an edited module's exports are held in
  component state, or say in the log that a reload is needed.

## 2026-10-22: After a force-stop, the Android TV launcher took the foreground back from `am start`

- **Date:** 2026-10-22
- **Tool:** Android Emulator 37.2.12 (Android TV, API 30), `adb shell am`
- **Task attempted:** relaunch the TV app's dev build so it loads the new bundle from Metro.
- **Steps taken:** `adb shell am force-stop dev.svavak.tv`, then `adb shell am start -n dev.svavak.tv/.MainActivity`.
- **Expected:** the app in the foreground.
- **Actual:** the app's process started, but the TV launcher started itself right after ("Background activity start
  for com.google.android.tvlauncher allowed because SYSTEM_ALERT_WINDOW permission is granted") and stayed in front,
  so `dumpsys activity activities` named the launcher as the resumed activity. A second `am start` brought the app's
  task to the front.
- **Severity:** Low. A second command fixes it, but an emulator check on the launcher would test nothing.
- **Workaround:** after `am start`, check `mResumedActivity` and run `am start` again when the launcher is in front.
- **Suggestion:** the launcher should not bring itself to the front while another app's start is in progress.

## 2026-10-22: expo-audio on Android: `remove()` neither stops nor frees a player

- **Date:** 2026-10-22
- **Tool:** expo-audio 1.1.1 (Expo SDK 54) on Android, in the TV app on the Android TV emulator
- **Task attempted:** stop the previous spoken reply when a new reply starts, so two voices never overlap.
- **Steps taken:** before the fix, `apps/tv/src/speech.ts` created each reply's player with `createAudioPlayer` and
  stopped the previous one with `player?.remove()` alone.
  After the fix (22 Oct), every end or stop calls `pause()`, then `remove()`, then `release()`.
- **Expected:** `remove()` stops the playback and frees the player.
- **Actual:** the audio kept playing after `remove()`: it neither stopped nor freed the player, so the old reply
  talked on under the new one.
- **Severity:** High. For a communication aid, overlapping speech makes the reply unintelligible.
- **Workaround:** (22 Oct) pause the player, then `remove()` it, then release it.
- **Suggestion:** make `remove()` stop playback and release the native player, or document that it only detaches the
  player from the module's registry and that `pause()` and `release()` must be called first.

## 2026-10-22: A release build cannot find the app's entry file in a Yarn workspaces repository

- **Date:** 2026-10-22
- **Tool:** Expo CLI 54.0.27 (`export:embed`, run by React Native's Gradle task `createBundleReleaseJsAndAssets`)
- **Task attempted:** build the TV app's release APK for judges (B11), with its JavaScript bundled into the APK.
- **Steps taken:** `EXPO_TV=1 ./gradlew assembleRelease --no-daemon` in `apps/tv/android`, after `expo prebuild`.
- **Expected:** the bundle built from the app's entry, `node_modules/expo/AppEntry.js` (the `main` in its
  `package.json`), as Metro does for the debug build.
- **Actual:** "Unable to resolve module ./node_modules/expo/AppEntry.js from C:\dev\aloud/." Expo makes the
  workspace root Metro's server root, but resolves the app's relative entry path against that root, where no
  `node_modules/expo` exists (Yarn installs expo in `apps/tv/node_modules`). The build failed after 1.5 minutes.
- **Severity:** Medium. It stops the release build, and the message points at the repository root, not at a setting.
- **Workaround:** set `EXPO_NO_METRO_WORKSPACE_ROOT=1` for the build, so Metro's server root is the app's folder (found
  in `@expo/config`'s `getMetroServerRoot`); `metro.config.js` still watches the whole repository for switchclock.
- **Suggestion:** resolve the entry file against the project root, or name `EXPO_NO_METRO_WORKSPACE_ROOT` in the error.

## 2026-10-22: The emulator shut itself down right after loading its snapshot

- **Date:** 2026-10-22
- **Tool:** Android Emulator (AVD `Television_1080p`, Android TV API 30) on Windows 11
- **Task attempted:** start the TV emulator for the demo APK check (B11).
- **Steps taken:** `emulator -avd Television_1080p`, first through PowerShell's `Start-Process` with a minimized window,
  then from a background Git Bash shell.
- **Expected:** the emulator keeps running until it is closed.
- **Actual:** both times it loaded the `default_boot` snapshot and then shut down on its own ("Wait for emulator ... to
  shutdown gracefully", then "Saving snapshot"), and `adb devices` listed nothing. The cause was not found.
- **Severity:** Low. A third start stayed up.
- **Workaround:** `Start-Process` with standard output and error redirected to files, and no window style.
- **Suggestion:** log why a graceful shutdown was requested.

## 2026-10-22: A page in the hidden Browser pane gets no animation frames

- **Date:** 2026-10-22
- **Tool:** Claude desktop app, Browser pane (Claude Code)
- **Task attempted:** walk through the README's judge steps in the studio, pressing Space when Tea lights up on the
  virtual TV.
- **Steps taken:** opened http://localhost:5173 in the Browser pane, switched on Drive mode, sent the question, and
  waited for Tea's highlight from a script.
- **Expected:** the virtual TV's highlight steps through the cards.
- **Actual:** while the pane was hidden (the user was away), `requestAnimationFrame` never ran, so the highlight did
  not move and the script timed out; a later press landed on Coffee, and the agent's 20 s wait ended first.
- **Severity:** Low. The studio is fine; only the check could not run there.
- **Workaround:** the same steps in headless Chromium through Playwright, where animation frames run.
- **Suggestion:** say in the tool result when a page is hidden and its animation frames are paused.
- **Seen again:** 2026-10-22 (B12), on the fresh-clone check of the judge steps. Screenshots timed out after 5 s, and
  a script waiting for Tea's `lit` class timed out after 20 s; a Space press sent after it still chose Tea, since the
  engine works from the clock, not from the drawn highlight. The agent's 20 s wait had ended by then, so the caregiver
  panel said "Sam hasn't answered yet." The rest of the steps were driven through the page's accessibility tree.

## 2026-10-22: pip installs git-filter-repo where Git cannot find it

- **Date:** 2026-10-22
- **Tool:** pip 25.1 (Anaconda Python 3.13.5) with git-filter-repo 2.47.0; Git for Windows 2.49.0
- **Task attempted:** rewrite the author and committer of every commit to the GitHub no-reply address before
  publishing (B12).
- **Steps taken:** `python -m pip install --user git-filter-repo`, then `git filter-repo --version` and
  `git filter-repo --help`.
- **Expected:** Git finds the new `filter-repo` command, and `--help` shows its options.
- **Actual:** pip put `git-filter-repo.exe` in `%APPDATA%\Python\Python313\Scripts`, which is not on `PATH`, and said
  so only in a warning ("Consider adding this directory to PATH"); Git answered "'filter-repo' is not a git command".
  With that folder on `PATH` the command ran, but `--help` failed with "documentation file not found"
  (`git-filter-repo.html`, exit 128): Git for Windows opens an HTML manual page, which pip does not install.
- **Severity:** Low. The command works once the folder is on `PATH`.
- **Workaround:** added the folder to `PATH` for the shell, and read the options with `python -m git_filter_repo -h`.
- **Suggestion:** the install notes could name the Scripts folder on Windows and the `-h` route for help.

## 2026-10-22: apksigner: one password file for keystore and key fails with "end of file reached"

- **Date:** 2026-10-22
- **Tool:** apksigner (Android SDK build-tools 36.0.0)
- **Task attempted:** sign the rebuilt demo APK (B12) with the keystore kept outside the repository, reading its
  password from a file so it is never typed or printed.
- **Steps taken:** `apksigner sign --ks <keystore> --ks-pass file:<password file> --key-pass file:<password file> ...`,
  with a one-line password file and a keystore whose key has the same password.
- **Expected:** both passwords read from the file's one line.
- **Actual:** "Failed to load signer", caused by "Failed to read Key ... password for signer #1 : end of file reached":
  when both options name the same file, apksigner reads the key password from the next line. `apksigner sign --help`
  documents this ("passwords are read from the file one line at a time"); the error message does not.
- **Severity:** Low. The message names the file and the key.
- **Workaround:** left out `--key-pass`; apksigner then tries the keystore password for the key first.
- **Suggestion:** when the shared file runs out of lines, say so in the error and point to the help text.
