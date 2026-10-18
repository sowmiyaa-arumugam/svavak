// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The conversation screen (plan §5.2, Figure 4): question band, 2 x 4 reply cards, four control pills and a hint.

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'; // hooks
import { StyleSheet, Text, View } from 'react-native'; // primitives
import KeyEvent from 'react-native-keyevent'; // Android key events, forwarded by plugins/withKeyEvent.js
import { DEFAULT_CONFIG } from 'switchclock'; // engine parameters (plan Table 11)
import { handTurns, now } from './clock'; // the shared clock and the dial angle
import { CONTROLS, Conversation, REPLY_COUNT } from './conversation'; // the state machine
import { Dial } from './Dial'; // one clock dial
import { FpsMeter, selectionLog } from './k2'; // K2 instrumentation (dev builds)
import { QUESTIONS } from './questions'; // mock questions
import { SwitchInput } from './switchInput'; // the single switch
import { colors, px } from './theme'; // tokens and scale

const HINT = "Press the switch when your option's hand reaches the amber mark."; // default hint (plan Figure 4)
const FPS_WINDOW_MS = 5000; // K2: frames per second, logged every 5 s
const CARD_DIAL = px(96); // reply-card dial (plan §5.2)
const PILL_DIAL = px(64); // control-pill dial

/** The only screen so far. Every dial is a clock option of one engine: 8 replies and 4 controls. */
export function ConversationScreen() { // the screen
  const conversation = useMemo( // one conversation for the screen's lifetime
    () => new Conversation(DEFAULT_CONFIG, now, QUESTIONS, __DEV__ ? selectionLog(console.log) : () => {}), // K2 log in dev
    [], // created once
  ); // end of the conversation
  const snap = useSyncExternalStore(conversation.subscribe, conversation.snapshot); // re-render on every change
  const hands = useRef<(View | null)[]>([]); // each dial's turning layer, by option index

  useEffect(() => { // the switch: Select presses go to the conversation
    const input = new SwitchInput(now, (t) => conversation.press(t)); // stamps at handler entry, drops auto-repeat
    KeyEvent.onKeyDownListener(input.keyDown); // key down, from MainActivity
    KeyEvent.onKeyUpListener(input.keyUp); // key up ends a press
    return () => { // on unmount
      KeyEvent.removeKeyDownListener(); // stop listening to key down
      KeyEvent.removeKeyUpListener(); // and key up
      conversation.dispose(); // cancel pending timers
    }; // end of clean-up
  }, [conversation]); // once

  useEffect(() => { // one animation clock: each frame turns every hand from the engine's t0 and phases
    const { engine } = conversation; // source of t0 and phases
    const fps = __DEV__ ? new FpsMeter(now(), FPS_WINDOW_MS, (f) => console.log(`[K2] fps ${f.toFixed(1)}`)) : null; // dev
    let request = 0; // pending frame request
    const frame = () => { // once per display frame
      const t = now(); // one time for every dial in this frame
      const phases = engine.phases(); // the current layout
      hands.current.forEach((hand, i) => { // each mounted hand
        const degrees = 360 * handTurns(t, engine.t0, DEFAULT_CONFIG.periodMs, phases[i]!); // its angle now
        hand?.setNativeProps({ style: { transform: [{ rotate: `${degrees}deg` }] } }); // straight to the native view
      }); // end of the hands
      fps?.frame(t); // count the frame
      request = requestAnimationFrame(frame); // and ask for the next
    }; // end of frame
    request = requestAnimationFrame(frame); // start
    return () => cancelAnimationFrame(request); // stop on unmount
  }, [conversation]); // once

  const leader = snap.posterior.indexOf(Math.max(...snap.posterior)); // the leading option (first on a tie)
  const dial = (i: number, size: number) => ( // the dial of option i
    <Dial // a clock option
      size={size} // card or pill size
      posterior={i === leader ? snap.posterior[i]! : null} // only the leading option shows its ring
      handRef={(hand) => { // register its turning layer
        hands.current[i] = hand; // for the frame loop
      }} // end of handRef
    /> // end of the dial
  ); // end of dial

  return ( // the screen
    <View style={styles.screen}>{/* background; content inside the 5% safe area */}
      <View style={styles.column}>{/* the content column, as wide as the grid */}
        <Text style={styles.speaker}>{snap.question.speaker} asks</Text>{/* speaker label */}
        <Text style={styles.question}>{snap.question.text}</Text>{/* the question */}
        {snap.mode === 'speaking' ? ( // Speaking: the reply in very large text, for the partner in the room
          <Text style={styles.reply}>{snap.reply}</Text> // the committed reply
        ) : ( // Asking: replies, controls and the hint
          <>{/* the options */}
            <View style={styles.grid}>{/* 2 x 4 reply cards */}
              {snap.question.replies.map((reply, i) => ( // one card per reply
                <View key={i} style={[styles.card, i === leader && styles.leading, snap.flash[i] && styles.flash]}>{/* card */}
                  {dial(i, CARD_DIAL)}{/* its clock */}
                  <Text style={styles.cardText} numberOfLines={2}>{reply}</Text>{/* two-line bold text */}
                </View> // end of the card
              ))}{/* end of the cards */}
            </View>{/* end of the grid */}
            <View style={styles.controls}>{/* the control bar, always present */}
              {CONTROLS.map((label, c) => ( // one pill per control
                <View // the pill
                  key={label} // stable identity
                  style={[ // pill styles, later entries win
                    styles.pill, // pill shape
                    label === 'Help' && styles.helpPill, // Help in its alert colour
                    REPLY_COUNT + c === leader && styles.leading, // the leading option
                    snap.flash[REPLY_COUNT + c] && styles.flash, // its dial just jumped
                  ]}>{/* end of the pill style */}
                  {dial(REPLY_COUNT + c, PILL_DIAL)}{/* its clock */}
                  <Text style={[styles.pillText, label === 'Help' && styles.helpText]}>{label}</Text>{/* its name */}
                </View> // end of the pill
              ))}{/* end of the pills */}
            </View>{/* end of the control bar */}
            <Text style={styles.hint} numberOfLines={1}>{snap.hint ?? HINT}</Text>{/* one-line hint */}
          </> // end of the options
        )}{/* end of the state's content */}
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
    flexDirection: 'row', // dial, then text
    alignItems: 'center', // vertically centred
    gap: px(16), // between dial and text
    paddingHorizontal: px(20), // inner margin
    borderRadius: px(16), // rounded corners
    borderWidth: px(3), // room for the outline
    borderColor: colors.surface, // no visible outline by default
    backgroundColor: colors.surface, // card surface
  }, // end of card
  leading: { backgroundColor: colors.surfaceFocus, borderColor: colors.ring }, // the leading option
  flash: { borderColor: colors.accent }, // its dial's phase just changed
  cardText: { flex: 1, color: colors.text, fontSize: px(34), fontWeight: 'bold' }, // two-line bold reply
  controls: { flexDirection: 'row', gap: px(24), marginTop: px(48) }, // the control bar
  pill: { // a control pill, 120 px tall
    width: px(404), // as wide as a card
    height: px(120), // pill height
    flexDirection: 'row', // dial, then label
    alignItems: 'center', // vertically centred
    gap: px(12), // between dial and label
    paddingHorizontal: px(20), // inner margin
    borderRadius: px(60), // fully rounded ends
    borderWidth: px(3), // room for the outline
    borderColor: colors.surface, // no visible outline by default
    backgroundColor: colors.surface, // pill surface
  }, // end of pill
  pillText: { color: colors.text, fontSize: px(34), fontWeight: 'bold' }, // control name
  helpPill: { borderColor: colors.help }, // Help outline
  helpText: { color: colors.help }, // Help label
  hint: { marginTop: 'auto', color: colors.text2, fontSize: px(26), textAlign: 'center' }, // one line, at the bottom
  reply: { flex: 1, color: colors.text, fontSize: px(140), fontWeight: 'bold', textAlign: 'center', textAlignVertical: 'center' }, // big
}); // end of styles
