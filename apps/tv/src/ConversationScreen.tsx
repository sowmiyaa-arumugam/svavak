// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The conversation screen in scan mode: question band, up to 2 x 4 reply cards, two control pills and a hint;
// an idle screen between the server's questions.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'; // hooks
import { StyleSheet, Text, View } from 'react-native'; // primitives
import KeyEvent from 'react-native-keyevent'; // Android key events, forwarded by plugins/withKeyEvent.js
import { now } from './clock'; // the shared clock
import { cardsOf, CONFIG, CONTROLS, Conversation, HELP_TEXT, IDLE_HINT, type Reply } from './conversation'; // the state machine, the grid's cards, and the Help and idle screens' words
import { FpsMeter, selectionLog } from './k2'; // K2 instrumentation (dev builds)
import { QUESTIONS } from './questions'; // mock questions
import { postHelp, postUtterance, SERVER } from './server'; // the server, if this build has one
import { playAnnouncement, playSpeech } from './speech'; // speech playback: replies, and question announcements
import { StreamClient } from './stream'; // the server's question stream
import { SwitchInput } from './switchInput'; // the single switch
import { colors, px } from './theme'; // tokens and scale

const HINT = 'Press when your answer lights up. Hold for Help.'; // the one-line hint
const CANCEL = 'Saying it — press to cancel'; // under a committed reply
const FPS_WINDOW_MS = 5000; // K2: frames per second, logged every 5 s
const HIGHLIGHT = px(12); // the scan highlight's border width

/** A question's announcement waits at most this long after Sam's reply stood for its speech to be over (B9.1). */
export const SAY_WAIT_MS = 10_000; // a reply of up to 60 characters is posted and spoken in about 5 s; the rest is for a slow network

/**
 * Posts a reply that stood through its cancel window, then plays its speech if the server made any. Settles once that
 * is over, but at most SAY_WAIT_MS later, so a stuck post or player never holds the next question's announcement back.
 */
export function say(reply: Reply): Promise<void> { // the conversation's reply hook: a question's announcement waits for it
  if (!SERVER) return Promise.resolve(); // a build without a server: the reply was shown on screen only
  const server = SERVER; // narrowed for the callbacks
  const spoken = postUtterance(server, reply).then( // POST /v1/utterances
    (audioUrl) => (audioUrl ? playSpeech(audioUrl, server.token) : undefined), // spoken to its end; null when the server made none: nothing to play
    (error) => { if (__DEV__) console.log(`[server] reply not posted: ${String(error)}`); }, // offline: nothing more to do
  ); // end of the post
  return Promise.race([spoken, new Promise<void>((done) => setTimeout(done, SAY_WAIT_MS))]); // whichever comes first
} // end of say

/** Plays a server question's spoken announcement (B9) from this build's server, which a build without one never gets. */
function announce(path: string, onEnd: () => void): () => void { // the conversation's announcement hook
  const server = SERVER!; // only server questions have announcements
  return playAnnouncement(`${server.url}${path}`, server.token, onEnd); // its own player, with the device token
} // end of announce

/** Sends the help request of one opening of Help; rejects when this build has no server or the server can't be reached. */
function requestHelp(): Promise<void> { // the conversation's help hook
  if (!SERVER) return Promise.reject(new Error('no server in this build')); // fixtures only: nobody to alert
  return postHelp(SERVER).then( // POST /v1/alerts
    () => { if (__DEV__) console.log('[help] request sent'); }, // the server confirmed it
    (error) => { if (__DEV__) console.log(`[help] request not sent: ${String(error)}`); throw error; }, // the screen says so
  ); // end of the post
} // end of requestHelp

/** The only screen so far. Every card and pill is an option of one scan engine: up to 8 replies and 2 controls. */
export function ConversationScreen() { // the screen
  const { conversation, input } = useMemo(() => { // one conversation and its switch for the screen's lifetime
    const input = new SwitchInput(now, (t) => conversation.press(t), (t) => conversation.help(t), (t) => conversation.down(t)); // stamps at key-down
    const conversation = new Conversation(CONFIG, now, QUESTIONS, __DEV__ ? selectionLog(console.log) : () => {}, say, requestHelp, () => input.held(), SERVER !== null, announce); // K2 log in dev; a build with a server starts idle and reads its questions aloud
    return { conversation, input }; // each calls the other only later, from key events and timers
  }, []); // created once
  const snap = useSyncExternalStore(conversation.subscribe, conversation.snapshot); // re-render on every change
  const [, setDrawn] = useState(''); // the highlight the frame loop last saw; a change re-renders the screen

  useEffect(() => { // the switch: key-downs, presses and holds go to the conversation
    KeyEvent.onKeyDownListener(input.keyDown); // key down, from MainActivity
    KeyEvent.onKeyUpListener(input.keyUp); // key up: a press once the key stays up, the end of a hold
    return () => { // on unmount
      KeyEvent.removeKeyDownListener(); // stop listening to key down
      KeyEvent.removeKeyUpListener(); // and key up
      input.dispose(); // no press or Help handed over after this
      conversation.dispose(); // cancel pending timers
    }; // end of clean-up
  }, [conversation, input]); // once

  useEffect(() => { // the server's questions while it can be reached; the fixtures keep the app working without it
    if (!SERVER) return; // built without a token: fixtures only
    const stream = new StreamClient(SERVER.url, SERVER.token, (event) => { // connects now, reconnects with back-off
      if (event.type === 'connected') conversation.setOnline(true); // the idle screen between questions, no practice
      else if (event.type === 'disconnected') conversation.setOnline(false); // practice until the server can be reached again
      else if (event.type === 'question.created') conversation.receive(event.question); // a new question, or the open one again after a reconnect
      else conversation.update(event.questionId, event.replies, event.scores); // its final replies: the model's, or its options
    }); // end of the stream
    stream.start(); // connect
    return () => stream.stop(); // hang up on unmount
  }, [conversation]); // once

  useEffect(() => { // one animation clock: each frame checks what the engine highlights now
    const { engine } = conversation; // source of the highlight and the running scan
    const fps = __DEV__ ? new FpsMeter(now(), FPS_WINDOW_MS, (f) => console.log(`[K2] fps ${f.toFixed(1)}`)) : null; // dev
    let request = 0; // pending frame request
    let drawn = ''; // what is on screen: the lit option and the scanned options
    const frame = () => { // once per display frame
      const t = now(); // this frame's time
      const seen = `${engine.highlighted(t)}|${engine.scanAt(t).items.join()}`; // what should be on screen now
      if (seen !== drawn) { // the highlight stepped, or a rescan started or ended
        drawn = seen; // remember it
        setDrawn(seen); // re-render, which reads the engine again
      } // end of the change
      fps?.frame(t); // count the frame
      request = requestAnimationFrame(frame); // and ask for the next
    }; // end of frame
    request = requestAnimationFrame(frame); // start
    return () => cancelAnimationFrame(request); // stop on unmount
  }, [conversation]); // once

  if (snap.mode === 'help') return ( // Help: what happened to its help request
    <View style={styles.screen}>{/* background */}
      <Text style={[styles.big, styles.helpText]}>{HELP_TEXT[snap.help!]}</Text>{/* always set in Help; a press dismisses it */}
    </View> // end of the screen
  ); // end of Help
  if (snap.mode === 'saying') return ( // Saying: the reply fills the screen for 2 s
    <View style={styles.screen}>{/* background */}
      <Text style={styles.big}>{snap.reply}</Text>{/* the committed reply, for the partner in the room */}
      <Text style={styles.hint}>{CANCEL}</Text>{/* a press now cancels it */}
    </View> // end of the screen
  ); // end of Saying
  if (snap.mode === 'idle') return ( // Idle: connected, between the server's questions; nothing lit or moving
    <View style={[styles.screen, styles.idle]}>{/* background, content centred */}
      <Text style={styles.name}>SvaVāk</Text>{/* the app's name */}
      <Text style={styles.waiting}>Waiting for a question</Text>{/* the state */}
      {snap.reply !== null && <Text style={styles.said}>You said: {snap.reply}</Text>}{/* the last reply that stood, if any */}
      {snap.hint && <Text style={styles.said}>{IDLE_HINT}</Text>}{/* for a few seconds after a short press, which sends nothing; in the reply's type */}
    </View> // end of the screen
  ); // end of Idle

  const scanning = snap.mode === 'asking'; // while waiting the engine still holds the previous scan, so it is not read
  const t = now(); // one time for this render
  const lit = scanning ? conversation.engine.highlighted(t) : -1; // the highlighted option; none while waiting
  const scanned = scanning ? conversation.engine.scanAt(t).items : null; // the options the running scan shows
  const look = (i: number) => [i === lit && styles.lit, scanned !== null && !scanned.includes(i) && styles.dim]; // lit, or out of a rescan
  const speaker = snap.question.id === undefined ? 'Practice' : `${snap.question.speaker} asks`; // a fixture only runs while the server cannot be reached
  return ( // Asking: the scan; Waiting: the same screen with nothing lit, and only the empty cards dimmed
    <View style={styles.screen}>{/* background; content inside the 5% safe area */}
      <View style={styles.column}>{/* the content column, as wide as the grid */}
        <Text style={styles.speaker}>{scanning ? speaker : `${speaker} · Finding replies…`}</Text>{/* speaker label; on one line, so nothing moves when the scan starts */}
        <Text style={styles.question}>{snap.question.text}</Text>{/* the question */}
        <View style={styles.grid}>{/* up to 2 x 4 reply cards, best guess first in reading order */}
          {cardsOf(snap.question).map((reply, i) => reply === null ? ( // an empty slot, until the model's replies fill it
            <View key={i} style={[styles.card, styles.dim]} /> // a card's size, dimmed, with no text: never lit or scanned
          ) : ( // one card per reply
            <View key={i} style={[styles.card, ...look(i)]} accessible accessibilityRole="button" accessibilityLabel={reply}>{/* card */}
              <Text style={styles.cardText} numberOfLines={2}>{reply}</Text>{/* two-line bold text */}
            </View> // end of the card
          ))}{/* end of the cards */}
        </View>{/* end of the grid */}
        <View style={styles.controls}>{/* the control bar, scanned after the cards */}
          {CONTROLS.map((label, c) => ( // one pill per control
            <View key={label} style={[styles.pill, ...look(snap.question.replies.length + c)]} accessible accessibilityRole="button" accessibilityLabel={label}>{/* the pill: its option follows the replies */}
              <Text style={[styles.pillText, label === 'Help' && styles.helpText]}>{label}</Text>{/* its name */}
            </View> // end of the pill
          ))}{/* end of the pills */}
        </View>{/* end of the control bar */}
        <Text style={styles.hint} numberOfLines={1}>{HINT}</Text>{/* one-line hint */}
      </View>{/* end of the column */}
    </View> // end of the screen
  ); // end of the render
} // end of ConversationScreen

const styles = StyleSheet.create({ // sizes are design pixels (1920 x 1080), scaled to the screen
  screen: { flex: 1, alignItems: 'center', backgroundColor: colors.bg, paddingHorizontal: px(90), paddingVertical: px(54) }, // safe
  column: { flex: 1, width: px(4 * 404 + 3 * 24) }, // four cards and three gaps
  speaker: { color: colors.text2, fontSize: px(28) }, // "Alex asks", or "Practice"
  idle: { justifyContent: 'center' }, // the idle screen's lines, centred both ways
  name: { color: colors.text2, fontSize: px(40) }, // "SvaVāk"
  waiting: { color: colors.text, fontSize: px(72), fontWeight: 'bold', marginTop: px(16) }, // "Waiting for a question"
  said: { color: colors.text2, fontSize: px(44), marginTop: px(32), textAlign: 'center' }, // "You said: ..."
  question: { color: colors.text, fontSize: px(52), fontWeight: 'bold', marginTop: px(8) }, // the question (about 50 px)
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: px(24), marginTop: px(40) }, // two rows of four
  card: { // a reply card, about 404 x 230
    width: px(404), // card width
    height: px(230), // card height
    justifyContent: 'center', // text vertically centred
    paddingHorizontal: px(20), // inner margin
    borderRadius: px(16), // rounded corners
    borderWidth: HIGHLIGHT, // room for the highlight, so lighting up never moves the text
    borderColor: 'transparent', // no outline until the highlight arrives, and no ring when dimmed
    backgroundColor: colors.surface, // card surface
  }, // end of card
  lit: { borderColor: colors.ring }, // the one highlight: a thick teal border
  dim: { opacity: 0.35 }, // not in the running top-two rescan, or an empty card
  cardText: { color: colors.text, fontSize: px(34), fontWeight: 'bold' }, // two-line bold reply
  controls: { flexDirection: 'row', gap: px(24), marginTop: px(48) }, // the control bar
  pill: { // a control pill, 120 px tall
    width: px(404), // as wide as a card
    height: px(120), // pill height
    justifyContent: 'center', // label vertically centred
    paddingHorizontal: px(20), // inner margin
    borderRadius: px(60), // fully rounded ends
    borderWidth: HIGHLIGHT, // room for the highlight
    borderColor: 'transparent', // no outline until the highlight arrives, and no ring when dimmed
    backgroundColor: colors.surface, // pill surface
  }, // end of pill
  pillText: { color: colors.text, fontSize: px(34), fontWeight: 'bold' }, // control name
  helpText: { color: colors.help }, // Help label
  hint: { marginTop: 'auto', color: colors.text2, fontSize: px(26), textAlign: 'center' }, // one line, at the bottom
  big: { flex: 1, color: colors.text, fontSize: px(140), fontWeight: 'bold', textAlign: 'center', textAlignVertical: 'center' }, // fills
}); // end of styles
