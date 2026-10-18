# Say When TV app

The Fire TV conversation screen (plan §4.2 and §5.2). A question band, a 2 × 4 grid of reply cards and a bar of four
control pills (Undo, More, Spell, Help). Every card and pill is a clock option of one
[switchclock](../../packages/switchclock) engine: 8 replies with equal priors and 4 controls, as in gate K1.

Questions and replies are mock fixtures ([src/questions.ts](src/questions.ts)); there is no server and no audio yet.
A committed reply is shown in very large text for 3 s, then the next question appears. A committed control only shows
its name in the hint line for now.

Started from the `expo-multi-tv` app of Amazon's React Native multi-TV sample (MIT-0; see [NOTICE](../../NOTICE)):
Expo SDK 54, react-native-tvos 0.81 on React Native's legacy architecture, the TV config plugin, and key events
through react-native-keyevent. Android package `dev.saywhen.tv`, minSdk 28 (Fire OS 7).

## Input

The switch is Select: Enter on the emulator's keyboard, or the centre button on a remote. Press when your option's
hand reaches the amber mark at twelve. Each press is timestamped when the key handler is entered, on the same clock
the engine and the dials use. Key auto-repeat is ignored, and a press within 150 ms of the last one is ignored (the
engine's debounce, kept across new selections and question changes).

## Develop

```bash
yarn workspace tv start       # Metro dev server
yarn workspace tv android     # prebuild, build and install the debug app on the emulator, then start it
yarn workspace tv test        # Jest: state machine, dial angles against engine phases, key handling, K2 maths
yarn workspace tv typecheck   # strict tsc over the app, the tests and the engine source it imports
```

## Gate K2 instrumentation (dev builds only)

The Metro terminal shows:

- `[K2] fps …` every 5 s: the rate of the animation frames that turn the dials.
- `[K2] selection …` after each committed selection: each press's offset from the chosen dial's noon, with their
  mean and standard deviation. A `[K2] session: …` line follows with the running totals.
