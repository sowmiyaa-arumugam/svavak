// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The conversation screen (plan §5.2) in scan mode: question band, 2 x 4 reply cards, two control pills and a hint.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'; // hooks
import { StyleSheet, Text, View } from 'react-native'; // primitives
import KeyEvent from 'react-native-keyevent'; // Android key events, forwarded by plugins/withKeyEvent.js
import { now } from './clock'; // the shared clock
import { CONFIG, CONTROLS, Conversation, REPLY_COUNT } from './conversation'; // the state machine
import { FpsMeter, selectionLog } from './k2'; // K2 instrumentation (dev builds)
import { QUESTIONS } from './questions'; // mock questions
import { SwitchInput } from './switchInput'; // the single switch
import { colors, px } from './theme'; // tokens and scale

const HINT = 'Press when your answer lights up. Hold for Help.'; // the one-line hint
const CANCEL = 'Saying it — press to cancel'; // under a committed reply
const FPS_WINDOW_MS = 5000; // K2: frames per second, logged every 5 s
const HIGHLIGHT = px(12); // the scan highlight's border width

/** The only screen so far. Every card and pill is an option of one scan engine: 8 replies and 2 controls. */
export function ConversationScreen() { // the screen
  const conversation = useMemo( // one conversation for the screen's lifetime
    () => new Conversation(CONFIG, now, QUESTIONS, __DEV__ ? selectionLog(console.log) : () => {}), // K2 log in dev
    [], // created once
  ); // end of the conversation
  const snap = useSyncExternalStore(conversation.subscribe, conversation.snapshot); // re-render on every change
  const [, setDrawn] = useState(''); // the highlight the frame loop last saw; a change re-renders the screen

  useEffect(() => { // the switch: presses and holds go to the conversation
    const input = new SwitchInput(now, (t) => conversation.press(t), (t) => conversation.help(t)); // stamps at key-down
    KeyEvent.onKeyDownListener(input.keyDown); // key down, from MainActivity
    KeyEvent.onKeyUpListener(input.keyUp); // key up decides between a press and a hold
    return () => { // on unmount
      KeyEvent.removeKeyDownListener(); // stop listening to key down
      KeyEvent.removeKeyUpListener(); // and key up
      conversation.dispose(); // cancel pending timers
    }; // end of clean-up
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

  if (snap.mode === 'help') return ( // Help: a placeholder until P1
    <View style={styles.screen}>{/* background */}
      <Text style={[styles.big, styles.helpText]}>Help is coming</Text>{/* a press dismisses it */}
    </View> // end of the screen
  ); // end of Help
  if (snap.mode === 'saying') return ( // Saying: the reply fills the screen for 2 s
    <View style={styles.screen}>{/* background */}
      <Text style={styles.big}>{snap.reply}</Text>{/* the committed reply, for the partner in the room */}
      <Text style={styles.hint}>{CANCEL}</Text>{/* a press now cancels it */}
    </View> // end of the screen
  ); // end of Saying

  const t = now(); // one time for this render
  const lit = conversation.engine.highlighted(t); // the highlighted option
  const scanned = conversation.engine.scanAt(t).items; // the options the running scan shows
  const look = (i: number) => [i === lit && styles.lit, !scanned.includes(i) && styles.dim]; // lit, or out of a rescan
  return ( // Asking: the scan
    <View style={styles.screen}>{/* background; content inside the 5% safe area */}
      <View style={styles.column}>{/* the content column, as wide as the grid */}
        <Text style={styles.speaker}>{snap.question.speaker} asks</Text>{/* speaker label */}
        <Text style={styles.question}>{snap.question.text}</Text>{/* the question */}
        <View style={styles.grid}>{/* 2 x 4 reply cards, best guess first in reading order */}
          {snap.question.replies.map((reply, i) => ( // one card per reply
            <View key={i} style={[styles.card, ...look(i)]} accessible accessibilityRole="button" accessibilityLabel={reply}>{/* card */}
              <Text style={styles.cardText} numberOfLines={2}>{reply}</Text>{/* two-line bold text */}
            </View> // end of the card
          ))}{/* end of the cards */}
        </View>{/* end of the grid */}
        <View style={styles.controls}>{/* the control bar, scanned after the cards */}
          {CONTROLS.map((label, c) => ( // one pill per control
            <View key={label} style={[styles.pill, ...look(REPLY_COUNT + c)]} accessible accessibilityRole="button" accessibilityLabel={label}>{/* the pill */}
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
  speaker: { color: colors.text2, fontSize: px(28) }, // "Alex asks"
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
  dim: { opacity: 0.35 }, // not in the running top-two rescan
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
