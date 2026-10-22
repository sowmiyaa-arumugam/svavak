# SvaVāk TV app

*Your Voice. Your Choice*

The Fire TV conversation screen in Smart Scan mode. It shows a question band, a 2 × 4 grid of
reply cards and two control pills (Something else, Help). All ten are options of one
[switchclock](../../packages/switchclock) `ScanEngine`. A server question may have fewer cards (at least one), for
example one asked with options; the pills then follow its last card. One thick teal highlight steps through the cards
in reading order (best guess first, except that the server puts the question's basic answers in the first four and
lists its fallback replies after the rest), then Something
else, then Help: 1 s each, 2 s for the first, and then the scan repeats.

Questions come from the [server](../../services/server). While the app is connected to it, a calm idle screen waits
between the caregiver's questions: the name, "Waiting for a question" and the last reply ("You said: …"), with nothing
lit or moving. A short press there sends nothing: it shows "Hold the button for help." for 3 s (a press meanwhile
starts the 3 s again), so one accidental press alerts nobody; holding the switch for 2 s opens Help, with its help
request. Only while the server can't be reached does the app ask practice questions from mock fixtures
([src/questions.ts](src/questions.ts)), listed best guess first with the question's basic
answers in the first four, as the server lists them (a test names them for each question), and labelled "Practice"
instead of "Alex asks". A build with a server starts on the idle screen and turns to practice if its first connection
attempt fails.
- **A server question** takes over at once while the scan runs, another server question waits for its replies, or the
  screen is idle. If it arrives during "Saying it" or Help, it waits until that window ends or Help is dismissed.
- **Read aloud** (B9). A question shows on the screen only, so Sam may not notice it arrive. When it shows, the app
  plays its spoken announcement from the server, "Alex asks: Would you like tea or coffee?", in a voice that is not
  Sam's own (Polly's Amy; a short tone in mock mode), while its replies are found. The highlight starts only once the
  announcement has finished and the replies are ready (below). A press whose key goes down during the announcement
  stops it, choosing nothing; the scan then starts as soon as the replies are ready, as without an announcement: at
  once if they are final, else when the model's arrive or the budget ends (B9.1). One whose key went down before the
  announcement began does nothing.
  Holding the switch for 2 s opens Help then too, with its one help request, and stops the announcement. A question
  is announced once: not again when Help is dismissed, after a cancel, or for its replay after a reconnect. When the
  app can't play it (the server made none, the audio can't be loaded, or it has not started within 2 s), the scan
  starts as it would without one. Practice questions have no announcement.
- **Never over Sam** (B9.1). If Sam's reply is still being posted or spoken when a question shows (one that arrived
  in the reply's 2 s window shows as the window ends), its announcement starts only once his latest reply's speech has
  finished or failed, or at most 10 s after the reply stood, so a stuck post or player holds nothing back for good. A
  cancelled reply is never spoken: while connected, a cancel shows a question that arrived in the window at once,
  and announces it at once. The wait counts as part of the announcement: a press or Help during it keeps the
  announcement from playing.
- It shows the question and the server's default replies at once, but the highlight starts only when the model's
  replies arrive (then on them, in the server's order, using its priors) or when the server's 3.5 s budget for
  them has passed (then on the defaults), and not before the question's announcement has finished or failed, unless a
  press skips it (above). Until then the question band reads "Alex asks · Finding replies…", so the
  unlit defaults look intentional. Replies that come later are ignored, so the list never changes while the
  highlight moves. The grid keeps its size too: a question asked without options shows its defaults and dimmed empty
  cards up to eight, which the model's replies fill in place. Empty cards are never lit or scanned; any that the
  final list doesn't reach stay empty, as do all of them if the model's replies don't come. A question asked with options gets its final replies straight after it, so its highlight starts as soon
  as its announcement has finished; replayed after a reconnect, it waits out the budget like any other question.
- After a reconnect the server sends the open question again. If the screen already has it (shown, or held until
  "Saying it" or Help ends), new replies in it are the model's, taken within the budget as above, and the same replies
  again change nothing; a running scan never restarts.
- Once it is answered, the idle screen returns, with that reply. If the connection dropped meanwhile, practice
  follows instead. Practice replies are never shown as the last reply, since they cannot reach the server.
- **When the connection comes back** during practice, the practice question gives way to the idle screen at once, or
  when its reply's "Saying it" window ends (a cancel ends it too) or Help is dismissed. A server question on screen is
  never interrupted by the connection coming or going.

Fixture replies get mock AI-like priors by position (0.35, 0.20, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04) and each control
1%, as in the second case of gate K1-scan.

- **A reply** that is committed fills the screen for 2 s with "Saying it — press to cancel". A key-down in that
  window cancels it at once and scans the same question again (a practice question once the connection is back gives
  way to the idle screen instead; while connected, a server question that arrived in the window takes over), and so
  does a switch key still held when the window ends. Otherwise the reply is
  posted to `POST /v1/utterances`, its speech is played with Expo's audio module (Polly's MP3, or a short tone in mock
  mode), and the idle screen (or, offline, the next practice question) appears. A cancelled reply never leaves the TV.
- **Not sure yet.** When a press leaves no option at θ = 0.97, only the top two are scanned once more and the other
  cards dim. If nobody presses, the full scan resumes.
- **Something else** on a fixture question loads the next fixture question and its replies. On a server question
  it is the answer: it is said and posted like any reply.
- **Help**, chosen in the scan or opened by holding the switch for 2 s at any time, sends one help request to the
  server for the caregiver (`POST /v1/alerts`, with the device token, an idempotency key, a 4 s timeout and one
  retry). The screen says what really happened: "Asking for help…" while it is sent, "Help request sent." once the
  server confirms it, or "Couldn't send the help request." when it can't (a build without a server, or a server that
  can't be reached, as in offline practice). Help that is already open sends nothing more, so a hold sends one request,
  even under the emulator's key chatter. A press dismisses it and the scan starts again (a server question still
  within its budget waits for its replies first); an answer that comes after that changes nothing. On the idle screen
  only the 2 s hold opens Help (a short press there shows the hint above and sends nothing), and dismissing it
  returns to the idle screen (or to a server question that arrived meanwhile).

A press counts for the card that was lit when the user decided: any moment while the card is lit, plus a reaction
delay of about 150 ms (the engine's window model). Every reply card and both pills carry an accessibility label and
the button role (an empty card has neither); they are not read aloud as they light up. The Android TV launcher banner is
[assets/tv-banner.png](assets/tv-banner.png) (320 × 180), drawn from the SvaVāk logo on black
([assets/brand](../../assets/brand)) and applied at prebuild; Fire TV takes its banner from the Appstore submission
instead.

Started from the `expo-multi-tv` app of Amazon's React Native multi-TV sample (MIT-0; see [NOTICE](../../NOTICE)):
Expo SDK 54, react-native-tvos 0.81 on React Native's legacy architecture, the TV config plugin, and key events
through react-native-keyevent. Android package `dev.svavak.tv`, minSdk 28 (Fire OS 7).

## Input

The switch is Select: Enter on the emulator's keyboard, or the centre button on a remote. Press when your answer
lights up; hold for 2 s for Help. Each press is timestamped at key-down, when the key handler is entered, on the same
clock the engine and the highlight use. A release followed by a new key-down within 150 ms is the same press or hold
(a bounce, a tremor, or the emulator's version of a held PC key; see Gate K2), so a press is handed over once the key
has stayed up for 150 ms, and a hold opens Help as soon as it reaches 2 s, while the key is still down; its final
release does nothing. Key auto-repeat is ignored, and a press within 150 ms of the last one is ignored (the engine's
debounce, kept across every state). Inside the 2 s "Saying it" window the reply is cancelled at the key-down, without
waiting for the key-up; a switch key still held when the window ends cancels it too, and a hold that began in the
window opens Help on that question.

## Server connection

- **Where it connects.** The app opens `GET /v1/stream` on `http://10.0.2.2:8787`, the emulator's address for the
  host, and reconnects with back-off (0.5 to 8 s, jittered).
- **The token.** The device token is `SVAVAK_DEVICE_TOKEN` from the repository's `.env`. `app.config.js` reads it,
  and expo-constants embeds it in the APK at build time, so changing the token needs a rebuild. A build without a
  token runs on the fixtures only.
- **Posting replies.** `POST /v1/utterances` has a 4 s timeout and one retry under the same idempotency key.
- **Announcements.** A question's `announcement_url` is played from the server with the device token by Expo's
  audio module, on a player apart from the replies' speech, so neither cuts the other off. A new reply stops the
  previous reply's speech: its player is paused, removed and released, since on Android `remove()` alone neither
  stops nor frees it. An announcement is given up if it has not started within 2 s; a reply's speech plays whenever
  it starts. Dev builds log `[speech]` and
  `[announcement]` lines (`playing`, then `finished`, `not played` or `stopped`) in the Metro terminal and `adb
  logcat -s ReactNativeJS`. On the emulator (2026-10-22, mock mode, five questions asked on the dev endpoint, raw screen frames
  150 to 490 ms apart on the device clock), the highlight showed only in frames captured after `[announcement]
  finished` (in one run the frame began 13 ms before that line, within the capture's own start-up time). In four runs
  a frame taken while the tone played showed the question with its final replies and nothing lit; in the fifth, the
  question's first frame was already after the tone.
- **Cleartext HTTP.** [plugins/withDebugCleartext.js](plugins/withDebugCleartext.js) allows it only to `10.0.2.2`,
  through a network security config, in debug builds and in release builds (the demo APK below), since the mock
  server on the emulator's host has no HTTPS. Every other host is HTTPS only.

## Develop

```bash
yarn workspace tv start       # Metro dev server
yarn workspace tv android     # prebuild, build and install the debug app on the emulator, then start it
yarn workspace tv test        # Jest: state machine, key handling, K2 maths, stream client, utterance posting
yarn workspace tv typecheck   # strict tsc over the app, the tests and the engine source it imports
```

## Demo APK

The judges' APK (B11) is a release build: it carries its own JavaScript bundle (no Metro) and the public demo device
token from `.env.example`, and works against a mock-mode server on the emulator's host. The token in the environment
wins over `.env`. Gradle signs a release build with the template's debug key; `apksigner` replaces that signature
with your own key (schemes v1 and v2, as Fire OS 8 requires). Keep the keystore and the APK outside the
repository. `EXPO_NO_METRO_WORKSPACE_ROOT=1` makes the app's folder Metro's root for the bundle, which otherwise
looks for the app's entry at the repository root (see the friction log).

```bash
cd apps/tv && EXPO_TV=1 npx expo prebuild --platform android --no-install
cd android && SVAVAK_DEVICE_TOKEN=svavak-public-demo-device-token EXPO_NO_METRO_WORKSPACE_ROOT=1 EXPO_TV=1 ./gradlew assembleRelease --no-daemon
apksigner sign --ks <keystore> --v1-signing-enabled true --v2-signing-enabled true --out <outside-the-repo>/svavak-demo.apk app/build/outputs/apk/release/app-release.apk
```

## Gate K2 (scan mode)

Pass condition: 19 of 20 intended selections, at least 50 fps, timing jitter recorded.

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
6. Check once each: holding the switch for 2 s opens Help ("Help request sent." with the server running) and a press
   dismisses it; a press during "Saying it" cancels the reply and restarts the scan of the same question.

K2 passes with at least 19 of 20 intended selections, a lowest frame rate of at least 50 fps, and the jitter recorded.

### Holding the switch on the emulator

In the first K2 run every check passed except step 6's hold: holding Enter on the PC keyboard in the emulator window
for 30 s never opened Help. The app is not the cause. Checked on 2026-10-20 (emulator 37.2.12, Android TV API 30):
- **A clean hold opens Help.** One Enter key-down, then one key-up 2.5 s later, sent through the emulator's gRPC
  `EmulatorController/sendKey` (the path its window uses for host keys). The kernel got exactly one DOWN and one UP,
  2.49 s apart (`getevent -lt`), and "Help is coming" appeared.
- **The PC keyboard's key repeat breaks the hold.** A key-down repeated every 33 ms for 2.5 s, as a host keyboard's
  auto-repeat sends it, reached the kernel as 57 DOWN and 57 UP events, alternating about 46 ms apart. The app
  rightly saw one short press and then bounces within its 150 ms release debounce, never a hold. Qt's Windows key
  handling turns each auto-repeat into a release and a press, which fits (from Qt's source, not confirmed in the
  emulator's).
- **What did not work.** `adb emu event send` answered OK, but no event reached any input device. `adb shell
  sendevent` was refused on this `user` build, which also cannot run `adb root`.

**Changed on 2026-10-21 (B7).** The app now treats a release followed by a new key-down within 150 ms as the same
hold, as real switches can chatter the same way. The PC keyboard's pattern is therefore one hold: Help opens 2 s after
its first key-down, while the key is still down, and its final release does nothing. A short press is handed over
once the key has stayed up for 150 ms, still stamped at its key-down. Replaying the K3 pattern on the emulator
through the same gRPC `sendKey` (a key-down every 33 ms, which reached the kernel as press/release pairs about 46 ms
apart: 55 pairs in 2.5 s, 88 in 4 s) opened "Help is coming" while the keys were still coming, and a short press then
dismissed it. Holding Enter on the PC keyboard itself, which the emulator turns into the same pattern, was not tried
by hand.

**Help request, 2026-10-21 (B8).** The same replay (55 key-downs in 2.5 s) with the server running in mock mode sent
one help request: one `help.requested` line in the server's log and one `[help] request sent` in the app's log. The
screen showed "Help request sent.", and a short press returned to the idle screen. With the server stopped, the
emulator does not refuse the closed port on the host, so both 4 s attempts time out: "Asking for help…" stayed about
8 s, then "Couldn't send the help request." appeared, and a short press returned to the practice question.
