# Say When TV app

The Fire TV conversation screen (plan §4.2 and §5.2) in Smart Scan mode. It shows a question band, a 2 × 4 grid of
reply cards and two control pills (Something else, Help). All ten are options of one
[switchclock](../../packages/switchclock) `ScanEngine`. One thick teal highlight steps through the cards, best guess
first in reading order, then Something else, then Help: 1 s each, 2 s for the first, and then the scan repeats.

Questions come from the [server](../../services/server) when it can be reached, and otherwise from mock fixtures
([src/questions.ts](src/questions.ts)), listed best guess first.
- **A server question** takes over at once while the scan runs or another server question waits for its replies. If it
  arrives during "Saying it" or Help, it waits until that window ends or Help is dismissed.
- It shows the question and the server's default replies at once, but the highlight starts only when the model's
  replies arrive (then on them, best guess first, using the server's priors) or when the server's 3.5 s budget for
  them has passed (then on the defaults). Replies that come later are ignored, so the list never changes while the
  highlight moves.
- After a reconnect the server sends the open question again. If the screen already has it (shown, or held until
  "Saying it" or Help ends), new replies in it are the model's, taken within the budget as above, and the same replies
  again change nothing; a running scan never restarts.
- Once it is answered, the fixtures resume.

Fixture replies get mock AI-like priors by position (0.35, 0.20, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04) and each control
1%, as in the second case of gate K1-scan.

- **A reply** that is committed fills the screen for 2 s with "Saying it — press to cancel". A key-down in that
  window cancels it at once and scans the same question again, and so does a switch key still held when the window
  ends. Otherwise the reply is posted to `POST /v1/utterances`, its speech is played with Expo's audio module
  (Polly's MP3, or a short tone in mock mode), and the next question appears. A cancelled reply never leaves the TV.
- **Not sure yet.** When a press leaves no option at θ = 0.97, only the top two are scanned once more and the other
  cards dim. If nobody presses, the full scan resumes.
- **Something else** on a fixture question loads the next fixture question and its replies. On a server question
  it is the answer: it is said and posted like any reply.
- **Help**, chosen in the scan or opened by holding the switch for 2 s at any time, shows "Help is coming". A press
  dismisses it and the scan starts again (a server question still within its budget waits for its replies first).

A press counts for the card that was lit when the user decided: any moment while the card is lit, plus a reaction
delay of about 150 ms (the engine's window model). Every card and both pills carry an accessibility label and the
button role; nothing is announced aloud. The Android TV launcher banner is
[assets/tv-banner.png](assets/tv-banner.png) (320 × 180), applied at prebuild; Fire TV takes its banner from the
Appstore submission instead.

Started from the `expo-multi-tv` app of Amazon's React Native multi-TV sample (MIT-0; see [NOTICE](../../NOTICE)):
Expo SDK 54, react-native-tvos 0.81 on React Native's legacy architecture, the TV config plugin, and key events
through react-native-keyevent. Android package `dev.saywhen.tv`, minSdk 28 (Fire OS 7).

## Input

The switch is Select: Enter on the emulator's keyboard, or the centre button on a remote. Press when your answer
lights up; hold for 2 s for Help. Each press is timestamped at key-down, when the key handler is entered, on the same
clock the engine and the highlight use; whether it was a press or a hold is decided at key-up. Key auto-repeat is
ignored, a press within 150 ms of the last one is ignored (the engine's debounce, kept across every state), and so is
a key-down within 150 ms after any release, so a bounce after a hold or a long press does nothing. Inside the 2 s
"Saying it" window the reply is cancelled at the key-down, without waiting for the key-up; a switch key still held
when the window ends, a bounce included, cancels it too, and a hold that began in the window opens Help on that
question.

## Server connection

- **Where it connects.** The app opens `GET /v1/stream` on `http://10.0.2.2:8787`, the emulator's address for the
  host, and reconnects with back-off (0.5 to 8 s, jittered).
- **The token.** The device token is `SAY_WHEN_DEVICE_TOKEN` from the repository's `.env`. `app.config.js` reads it,
  and expo-constants embeds it in the APK at build time, so changing the token needs a rebuild. A build without a
  token runs on the fixtures only.
- **Posting replies.** `POST /v1/utterances` has a 4 s timeout and one retry under the same idempotency key.
- **Cleartext HTTP.** [plugins/withDebugCleartext.js](plugins/withDebugCleartext.js) allows it only to `10.0.2.2` and
  only in debug builds, through a network security config. Release builds keep Android's default of HTTPS only.

## Develop

```bash
yarn workspace tv start       # Metro dev server
yarn workspace tv android     # prebuild, build and install the debug app on the emulator, then start it
yarn workspace tv test        # Jest: state machine, key handling, K2 maths, stream client, utterance posting
yarn workspace tv typecheck   # strict tsc over the app, the tests and the engine source it imports
```

## Gate K2 (scan mode)

Pass condition (plan §10.4): 19 of 20 intended selections, at least 50 fps, timing jitter recorded.

### Instrumentation (dev builds only)

The Metro terminal (and `adb logcat -s ReactNativeJS`) shows:

- `[K2] fps …` every 5 s: the rate of the animation frames that drive the highlight.
- `[K2] selection …` after each committed selection: each press's offset from the chosen card's highlight onset, with
  their mean and standard deviation. Presses made while a rescan did not show the chosen card are left out. A
  `[K2] session: …` line follows with the running totals.

### Protocol

1. Start Metro and install the debug build on the emulator or a Fire TV device, with the Metro terminal in view.
2. Before each selection, write down the intended option. Spread the 20 targets over the grid, and include Something
   else and Help at least once each.
3. Make 20 selections with the switch alone, pressing when the intended option lights up. A selection counts when the
   first commit is the intended option; a wrong commit is a miss, even if a press in the 2 s window then cancels it.
4. Note the lowest `[K2] fps` value of the session.
5. Note the last `[K2] session` line. Under the window model an aimed press lands between μ = 150 ms after the
   card lights up and μ after it goes dark (1150 ms on a 1 s card, 2150 ms on the 2 s first card), give or take
   σ = 120 ms. Offsets well outside that range mean the real delay or jitter, including key-handler and rendering
   delay, is larger than the engine assumes.
6. Check once each: holding the switch for 2 s opens "Help is coming" and a press dismisses it; a press during
   "Saying it" cancels the reply and restarts the scan of the same question.

K2 passes with at least 19 of 20 intended selections, a lowest frame rate of at least 50 fps, and the jitter recorded.
