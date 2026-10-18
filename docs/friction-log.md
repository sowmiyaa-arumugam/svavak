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
  ...: Cannot apply hunk #1`. The install ended "Done with warnings", and `tsc` 7.0.2 then ran normally.
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
