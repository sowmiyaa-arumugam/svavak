# Friction log

Every tool problem is logged when it happens, with the fields the hackathon rules ask for (plan §11.4):
task attempted, steps, expected versus actual result, severity, workaround and suggestion, tagged by tool.
These entries feed the product-feedback answers. Values marked *(proposed)* still need confirming.

## 2026-10-18: Android Studio first-run wizard offered no SDK components

- **Tool:** Android Studio
- **Task attempted:** set up the Android SDK for the Android TV emulator (API 30). *(proposed)*
- **Steps:** ran Android Studio's first-run set-up wizard.
- **Expected:** the wizard offers the SDK components to install.
- **Actual:** the wizard offered no SDK components.
- **Severity:** low, since a workaround exists. *(proposed)*
- **Workaround:** installed the components through SDK Manager instead.
- **Suggestion:** when no components are available, the wizard should say why and link to SDK Manager. *(proposed)*

## 2026-10-18: Gradle "Could not move temporary workspace" with Sophos Home

- **Tool:** Gradle 8.14.3 (with Sophos Home real-time scanning, Windows 11)
- **Task attempted:** build Amazon's sample TV app for the Android TV emulator. *(proposed)*
- **Steps:** ran the Gradle build on Windows with Sophos Home real-time scanning on.
- **Expected:** the build completes.
- **Actual:** the build failed with "Could not move temporary workspace".
- **Severity:** high, since every build failed until the workaround. *(proposed)*
- **Workaround:** added Sophos exceptions for `%USERPROFILE%\.gradle`, `C:\dev` and the Android SDK, then deleted
  `caches/8.14.3/transforms`.
- **Suggestion:** Gradle's error message should name real-time antivirus scanning as a likely cause and point to
  the folders to exclude. *(proposed)*

## 2026-10-18: Amazon's sample shows a Legacy Architecture warning and a StrictMode error

- **Tool:** Amazon's React Native multi-TV sample (React Native, LogBox)
- **Task attempted:** first run of Amazon's sample TV app on the Android TV emulator.
- **Steps:** started the sample app for the first time.
- **Expected:** the sample starts without warnings or errors.
- **Actual:** a Legacy Architecture warning and a StrictMode `findNodeHandle` error appeared; LogBox only said
  "Open debugger to view warnings".
- **Severity:** to be assessed.
- **Workaround:** none recorded yet.
- **Suggestion:** LogBox should show the warning text itself; the sample should not trigger StrictMode errors on a
  clean first run. *(proposed)*

## 2026-10-18: Yarn cannot apply its built-in TypeScript patch to TypeScript 7.0.2

- **Tool:** Yarn 4.5.0 (through Corepack) with TypeScript 7.0.2
- **Task attempted:** install the dev dependencies of the switchclock engine package.
- **Steps:** added `typescript` 7.0.2 to `packages/switchclock` and ran `corepack yarn install`.
- **Expected:** the install completes without warnings.
- **Actual:** the fetch step warned `YN0066: typescript@patch:typescript@npm%3A7.0.2#optional!builtin<compat/typescript>
  ...: Cannot apply hunk #1`. The install ended "Done with warnings", and `tsc` 7.0.2 then ran normally. The same
  warning appeared for TypeScript 5.9.3 after the workspaces moved to it (B6).
- **Severity:** low, since nothing failed. *(proposed)*
- **Workaround:** none needed. The repo uses `nodeLinker: node-modules`, and Yarn's built-in patches exist for
  packages that are not compatible with Plug'n'Play (plugin-compat README). *(proposed)*
- **Suggestion:** when Yarn's built-in Plug'n'Play patch does not fit a TypeScript version, Yarn should say what that
  means, and skip it under `nodeLinker: node-modules`. *(proposed)*

## 2026-10-18: Vitest 5 needs vite installed alongside it; Yarn only warns

- **Tool:** Vitest 5.0.3 with Yarn 4.5.0
- **Task attempted:** set up the switchclock engine's test runner.
- **Steps:** added `vitest` and `@vitest/coverage-v8` 5.0.3, without `vite`, and ran `corepack yarn install`.
- **Expected:** either Vitest installs what it needs to run, or the install fails clearly when a required package is
  missing. *(proposed)*
- **Actual:** the install ended "Done with warnings". The only signal was `YN0002: switchclock@workspace:packages/switchclock
  doesn't provide vite (p82825), requested by vitest`, plus a YN0086 summary. Vitest 4.1.11 listed `vite` as a
  dependency; 5.0.3 lists it only as a peer dependency.
- **Severity:** low, since it was caught before any test ran. *(proposed)*
- **Workaround:** added `vite` 8.3.1 as a dev dependency.
- **Suggestion:** Vitest's install instructions should say that from version 5 `vite` must be installed alongside it,
  and Yarn should make a missing required peer stand out from other peer warnings. *(proposed)*

## 2026-10-18: typescript-eslint does not support TypeScript 7

- **Tool:** typescript-eslint 8.58.1 (latest: 8.71.2) with TypeScript 7.0.2
- **Task attempted:** reuse the ESLint set-up of Amazon's sample at the repository root, for the TV app and the
  switchclock engine, which used TypeScript 7.0.2.
- **Steps:** read the peer dependencies of `@typescript-eslint/parser` and the `exports` of the `typescript` 7.0.2 package.
- **Expected:** ESLint's TypeScript parser works with the current TypeScript release. *(proposed)*
- **Actual:** every 8.x release up to 8.71.2 declares the peer `typescript: ">=4.8.4 <6.1.0"`, and the main export of
  `typescript` 7.0.2 is only `lib/version.cjs`, with no compiler API for tools to call.
- **Severity:** medium, since it forced a TypeScript downgrade. *(proposed)*
- **Workaround:** both workspaces use TypeScript 5.9.3.
- **Suggestion:** the TypeScript 7 release notes and typescript-eslint's install page should state the gap and the
  TypeScript version to use until the API returns. *(proposed)*

## 2026-10-18: Prettier moves trailing comments off block-opening lines

- **Tool:** Prettier 3.8.2 through eslint-plugin-prettier 5.5.5, with this repository's comment-on-every-line rule
- **Task attempted:** reuse the Prettier settings of Amazon's sample for apps/tv and packages/switchclock.
- **Steps:** ran `yarn lint` (the sample's ESLint configuration, which includes the `prettier/prettier` rule) and
  Prettier on single files.
- **Expected:** formatting keeps each line's trailing comment on that line. *(proposed)*
- **Actual:** Prettier moves a comment that follows `{` or `(`, as in `export class Engine { // …`, onto a line of its
  own, which leaves the opening line without a comment. `yarn lint` reports 297 `prettier/prettier` warnings across
  the 29 TypeScript files and no other finding in our code.
- **Severity:** medium, since Prettier's formatting and the comment rule cannot both hold. *(proposed)*
- **Workaround:** Prettier was removed from the repository on 2026-10-18 (rule, `.prettierrc` and dependency); CLAUDE.md
  says why.
- **Suggestion:** Prettier could offer an option to keep trailing comments on block-opening lines. *(proposed)*

## 2026-10-18: Amazon's sample resolves react-native-tvos to a release candidate

- **Tool:** Amazon's React Native multi-TV sample (`apps/expo-multi-tv`, commit d435082)
- **Task attempted:** copy the sample's Expo SDK 54 and react-native-tvos 0.81 set-up for the Say When TV app.
- **Steps:** read the sample's `package.json` and `yarn.lock`, and the npm registry.
- **Expected:** the sample's versions match Expo SDK 54. *(proposed)*
- **Actual:** `react-native: npm:react-native-tvos@~0.81.0-0` resolves to `0.81.0-0rc5`, a release candidate: under
  semver's pre-release rules the range cannot match 0.81.1-0 to 0.81.5-2. `@react-native-tvos/config-tv@^0.0.10`
  declares the peer `expo ^51`, and `expo-build-properties ~0.13.0` predates SDK 54, whose `expo` lists `~1.0.10`.
- **Severity:** low, since the sample still builds and runs. *(proposed)*
- **Workaround:** pinned react-native-tvos 0.81.5-2 (Expo SDK 54 lists React Native 0.81.5), config-tv 0.1.7 and
  expo-build-properties 1.0.10.
- **Suggestion:** pin an exact react-native-tvos version in the sample and check it with `expo install --check`.
  *(proposed)*

## 2026-10-18: A second Expo app on the emulator loads the first app's bundle

- **Tool:** React Native 0.81 (react-native-tvos) debug build with the Expo CLI, Android TV emulator (API 30)
- **Task attempted:** run the Say When debug build while the sample's `expo run:android` still held port 8081.
- **Steps:** started Metro for apps/tv on port 8082, ran `expo run:android --no-bundler`, and mapped the emulator's
  port 8081 to 8082 with `adb reverse`.
- **Expected:** the new app loads its own bundle, or fails with a clear "wrong project" error. *(proposed)*
- **Actual:** on a stock emulator React Native loads from `10.0.2.2:8081` (the host), not through `adb reverse`, so the
  Say When app silently ran the sample's bundle and showed a red box: `RNGestureHandlerModule could not be found`.
- **Severity:** medium, since the error points at a module the app never uses. *(proposed)*
- **Workaround:** pointed the app's debug server at `10.0.2.2:8082` (React Native's `debug_http_host` dev setting).
- **Suggestion:** Metro could reject bundle requests for an app id that differs from its own project's, and
  `expo run:android` could warn when another project's Metro is on the target port. *(proposed)*

## 2026-10-18: Expo prebuild adds an iOS script to an Android-only app

- **Tool:** Expo CLI (SDK 54) `expo run:android`
- **Task attempted:** first prebuild of the Fire TV app.
- **Steps:** ran `yarn workspace tv android`.
- **Expected:** prebuild for Android changes nothing outside `android/`. *(proposed)*
- **Actual:** it reported "Updating package.json" and added `"ios": "expo run:ios"` to `apps/tv/package.json`; it adds
  the script again whenever it is missing.
- **Severity:** low. *(proposed)*
- **Workaround:** kept the script, since removing it only brings it back on the next fresh prebuild.
- **Suggestion:** prebuild should add scripts only for the platforms it is building. *(proposed)*

## 2026-10-18: Gradle's CMake step warns about SDK XML version 4

- **Tool:** Android Gradle plugin (CMake configuration) with the Android SDK installed by Android Studio
- **Task attempted:** first Gradle build of the Say When debug APK.
- **Steps:** ran `yarn workspace tv android`.
- **Expected:** no SDK warnings on a fresh SDK. *(proposed)*
- **Actual:** `configureCMakeDebug[x86]` printed `[CXX5304] This version only understands SDK XML versions up to 3 but
  an SDK XML file of version 4 was encountered`. The build succeeded.
- **Severity:** low. *(proposed)*
- **Workaround:** none needed.
- **Suggestion:** the warning should name the component to update. *(proposed)*

## 2026-10-18: A Claude Code plugin hook reformats a config file and then blocks restoring it

- **Tool:** Claude Code with the ecc plugin's `stop:format-typecheck` and `pre:config-protection` hooks
- **Task attempted:** keep the root `eslint.config.js` in the repository's comment-on-every-line form while building B6.
- **Steps:** created `eslint.config.js` in a Claude Code session; later tried to correct it with the Edit tool.
- **Expected:** files keep the layout the session wrote, or a formatter that rewrites them leaves them editable.
  *(proposed)*
- **Actual:** the stop hook ran `prettier --write` on the file, which left 10 lines without their comments. The
  config-protection hook then blocked every Edit or Write to `eslint.config.js`, including restoring the content
  the session had written.
- **Severity:** medium, since the file cannot be put back without changing the hook set-up. *(proposed)*
- **Workaround:** the git-ignored `.claude/settings.local.json` sets `ECC_DISABLED_HOOKS=stop:format-typecheck`. For
  the approved removal of the Prettier rule on 2026-10-18, `pre:config-protection` was added there for that one edit and
  removed straight after; the next edit attempt was blocked again.
- **Suggestion:** the format hook should respect a project's opt-out (for example a missing format script) and skip
  files that the protection hook guards. *(proposed)*

## 2026-10-18: Vitest hides the K1 report lines when an AI agent runs the tests

- **Tool:** Vitest 5.0.3, run from Claude Code
- **Task attempted:** read the measured K1 and K1-scan values that the gate tests print.
- **Steps:** ran `yarn workspace switchclock test` in a Claude Code session.
- **Expected:** the `console.log` lines of the gate tests appear in the output, as in a terminal. *(proposed)*
- **Actual:** no report line appeared. With the `AI_AGENT` and `CLAUDECODE` environment variables unset, the same
  command printed them, so the agent detection in Vitest's `std-env` dependency hides the console output of passing
  tests.
- **Severity:** low, since the tests still pass or fail correctly. *(proposed)*
- **Workaround:** `npx vitest run --silent=false` shows the lines; the switchclock README says so.
- **Suggestion:** Vitest should print one line saying that console output was hidden and how to show it. *(proposed)*

## 2026-10-18: `expo run:android` rejects `--port` together with `--no-bundler`

- **Tool:** Expo CLI (SDK 54) `expo run:android`
- **Task attempted:** rebuild and install the TV app while its Metro server was already running on port 8082.
- **Steps:** ran `yarn workspace tv android --no-bundler --port 8082`.
- **Expected:** a build that targets the already-running server on 8082. *(proposed)*
- **Actual:** `CommandError: --port and --no-bundler are mutually exclusive arguments`. Without `--port`, the run
  waited on `localhost:8081`, where another project's Metro was running.
- **Severity:** low, since the app keeps its own debug server setting (`10.0.2.2:8082`). *(proposed)*
- **Workaround:** ran it with `--no-bundler` only.
- **Suggestion:** allow `--port` with `--no-bundler` to name the server that is already running. *(proposed)*

## 2026-10-18: No adb way to hold a key for 2 s on the Android TV emulator (API 30)

- **Tool:** Android Emulator with the Android TV (API 30) system image, adb
- **Task attempted:** test and screenshot the 2 s switch hold that opens Help.
- **Steps:** tried `adb emu event send EV_KEY:KEY_ENTER:1 EV_SYN:0:0`, `adb shell sendevent` and
  `adb shell input keyevent`.
- **Expected:** one of them can hold a key down for a chosen time. *(proposed)*
- **Actual:** the console's `event send` answered `OK`, but `getevent` showed no event on any input device;
  `sendevent` failed with `Permission denied` (SELinux, although the shell user is in the `input` group); and
  `input keyevent` on API 30 has only `--longpress`, with no hold duration.
- **Severity:** medium, since the Help hold could not be checked on the emulator by adb alone. *(proposed)*
- **Workaround:** the system's `hid` shell tool registered a virtual USB keyboard through `/dev/uhid` and sent an
  Enter report, a 2,500 ms delay and a release. On API 30 its JSON `register` command needs a `bus` field; without it
  the tool fails with a `NullPointerException` in `Event.getBus`. Met again on 2026-10-19 (B2.1), for a press that
  goes down inside the 2 s "Saying it" window and comes up after it: `input keyevent --longpress 66` holds the key for
  about 400 ms (a key-down, the long-press timeout, then the key-up), and `dumpsys input` lists the recent key events
  with their ages, which gave the key-down's offset into the window (1.70 s).
- **Suggestion:** document a supported way to hold a key for a set time on emulators (for example an `input keyevent`
  duration on every API level), and make the console's `event send` report when no device receives the event.
  *(proposed)*

## 2026-10-18: A Claude Code plugin hook asks for facts before the first edit of every file

- **Tool:** Claude Code with the ecc plugin's GateGuard fact-forcing hook
- **Task attempted:** build the Smart Scan change across about 25 files in one session.
- **Steps:** created and edited source, test, documentation and scratchpad files with the Write and Edit tools.
- **Expected:** a one-time check per session or per folder. *(proposed)*
- **Actual:** the hook blocked the first Bash command and the first edit of each file, including throwaway scratchpad
  files, until the session restated the callers, the purpose and the user's instruction: about 20 blocks in one session.
- **Severity:** low; each block costs one retry. *(proposed)*
- **Workaround:** stated the facts and retried each time. Since 2026-10-18 the git-ignored `.claude/settings.local.json`
  sets `GATEGUARD_EXEMPT_GLOBS=**`, which exempts edits to the repository's own paths; destructive-command checks stay
  on, and paths outside the repository are still checked.
- **Suggestion:** exempt the session's scratchpad directory by default, and accept one statement for a batch of related
  files. *(proposed)*

## 2026-10-19: Expo's base tsconfig hides React Native's WebSocket headers argument

- **Tool:** Expo SDK 54 (`expo/tsconfig.base.json`) with React Native 0.81 (react-native-tvos) typings
- **Task attempted:** open the TV app's WebSocket to the server with the device token in an `Authorization` header.
- **Steps:** wrote `new WebSocket(url, null, { headers })` in `apps/tv/src/stream.ts` and ran `yarn workspace tv typecheck`.
- **Expected:** it compiles: React Native's WebSocket takes an options object with `headers` as its third argument
  (`Libraries/WebSocket/WebSocket.js`), and React Native's own `src/types/globals.d.ts` declares that constructor.
- **Actual:** `TS2554: Expected 1-2 arguments, but got 3`. Expo's base tsconfig sets `"lib": ["DOM", "ESNext"]`, and the
  DOM declaration of `WebSocket` wins over React Native's.
- **Severity:** low, since a cast works around it. *(proposed)*
- **Workaround:** cast `WebSocket` to a three-argument constructor type in `src/stream.ts`.
- **Suggestion:** Expo's base tsconfig for React Native projects could leave out the DOM library, or React Native's
  typings could merge their constructor with the DOM one instead of losing to it. *(proposed)*

## 2026-10-19: Nova 2 documentation disagrees on maxTokens and temperature for tool calls

- **Tool:** Amazon Bedrock documentation (Amazon Nova 2 user guide, Nova 2 Lite model card)
- **Task attempted:** set `inferenceConfig` and the tool input schema for the server's forced `suggest_replies` call.
- **Steps:** read the Nova 2 request and response schema page, the Converse page, the troubleshooting page, the tools
  page and the model card.
- **Expected:** one range for each parameter, and a statement of which JSON Schema keywords tool calls enforce.
  *(proposed)*
- **Actual:** the maximum `maxTokens` is given as 5,000 (schema page), up to 65,000 (Converse page) and 64K (model
  card). The schema page gives temperature a range of 0.00001 to 1, while the troubleshooting page recommends
  `temperature: 0` for reliable tool use. No page says whether `minItems`, `maxItems` or `maxLength` in a tool's input
  schema are honoured.
- **Severity:** low so far, since live mode has only been tested against SDK mocks. *(proposed)*
- **Workaround:** `maxTokens` 1,000 (below every figure) and `temperature` 0, as the tool-use guidance says. Count and
  length limits go in descriptions and are re-validated on the server. All of this is to be confirmed on the first
  live call.
- **Suggestion:** one table of inference parameters per model and API, and a list of the schema keywords that tool
  calls enforce. *(proposed)*

## 2026-10-19: Polly lists neural voices and neural Regions separately

- **Tool:** Amazon Polly documentation
- **Task attempted:** choose a default neural voice that is available in eu-central-1 (Frankfurt).
- **Steps:** read the neural-voices and available-voices pages.
- **Expected:** a list of the voices each Region offers. *(proposed)*
- **Actual:** one page lists the Regions with neural voices, another lists the neural voices, and neither says whether
  every voice is offered in every listed Region.
- **Severity:** low, since a wrong voice fails safe: the reply is committed without audio. *(proposed)*
- **Workaround:** default `Brian` (British English, neural), configurable as `SAY_WHEN_VOICE`. To be checked with
  `aws polly describe-voices --engine neural --region eu-central-1` once SSO access exists.
- **Suggestion:** a table of voices by Region on the neural-voices page. *(proposed)*

## 2026-10-19: Claude Code's Bash tool turns a doubled backslash into one

- **Tool:** Claude Code (desktop app) Bash tool, running Git Bash on Windows 11
- **Task attempted:** edit test files that contain backslashes (regular expressions) with shell scripts during B2.1.
- **Steps:** ran a string-replace script with backslashes inside single quotes, then checked with
  `printf '%s\n' 'a\\b'` and a quoted heredoc (`<<'EOF'`) holding `c\\d`.
- **Expected:** `a\\b` and `c\\d`, since bash keeps backslashes inside single quotes and quoted heredocs.
- **Actual:** `a\b` and `c\d`: each doubled backslash reaches bash as one, so the script's search text did not match.
  The script checked for a match before writing, so no file was damaged.
- **Severity:** low; it costs a retry, but a script without that check could write the wrong text. *(proposed)*
- **Workaround:** used the Edit tool for any text with backslashes, or wrote the script to a file first.
- **Suggestion:** pass commands to the shell unchanged, or document the escaping the tool applies. *(proposed)*
