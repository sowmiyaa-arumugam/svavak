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
