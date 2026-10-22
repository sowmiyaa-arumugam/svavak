// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The virtual TV (plan §4.7, drive mode): the TV's conversation screen in the browser, run by the TV's own state
// machine, scan engine, switch handling and stream client (apps/tv/src), connected to the server as the household's
// TV. The space bar is the switch. It draws the TV's layout on the 1920 x 1080 design grid, scaled to its frame.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'; // hooks
import { now } from '../../tv/src/clock'; // the TV's shared clock
import { cardsOf, CONFIG, CONTROLS, Conversation, HELP_TEXT, IDLE_HINT, type Reply } from '../../tv/src/conversation'; // the TV's state machine, scan rules, grid, and Help and idle screens' words
import { QUESTIONS } from '../../tv/src/questions'; // the TV's practice questions
import { StreamClient, type SocketLike } from '../../tv/src/stream'; // the TV's stream client: parsing and reconnects
import { RELEASE_DEBOUNCE_MS, SwitchInput } from '../../tv/src/switchInput'; // the TV's switch: press, hold for Help, debounce
import { DEVICE_TOKEN, SERVER_URL } from './config'; // where the server is, and the household TV's token

const ENTER = { keyCode: 66 }; // the space bar stands for the TV's Enter key (KEYCODE_ENTER)
const HINT = 'Press when your answer lights up. Hold for Help.'; // the TV's one-line hint
const CANCEL = 'Saying it — press to cancel'; // the TV's text under a committed reply

/** What the engine view draws after each press: one bar per option, and the commit threshold θ. */
export interface EngineState { labels: string[]; posterior: number[]; threshold: number } // labels in scan order

/** Posts a reply that stood through its cancel window, as the TV does; the studio plays no audio. */
function post(reply: Reply): void { // the conversation's reply hook
  const body = JSON.stringify({ question_id: reply.questionId, question_text: reply.questionText, text: reply.text, clicks: reply.clicks, duration_ms: reply.durationMs }); // the TV's wire format
  const headers = { Authorization: `Bearer ${DEVICE_TOKEN}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }; // the device token in a header
  void fetch(`${SERVER_URL}/v1/utterances`, { method: 'POST', headers, body }).catch(() => {}); // offline: the reply was shown, nothing more
} // end of post

/** Sends the help request of one opening of Help, as the TV does but without its timeout and retry; rejects when the server can't be reached or refuses it. */
async function help(): Promise<void> { // the conversation's help hook
  const headers = { Authorization: `Bearer ${DEVICE_TOKEN}`, 'Idempotency-Key': crypto.randomUUID() }; // the device token in a header; no body
  const res = await fetch(`${SERVER_URL}/v1/alerts`, { method: 'POST', headers }); // offline: rejects, and the screen says so
  if (!res.ok) throw new Error(`POST /v1/alerts answered ${res.status}`); // refused: the screen says so too
} // end of help

/** The browser's WebSocket with the token in the subprotocol list (browsers cannot set its headers); the server picks "bearer". */
function connect(url: string): SocketLike { // the stream client's socket factory
  return new WebSocket(url, ['bearer', DEVICE_TOKEN]) as unknown as SocketLike; // the same four members the TV's socket has
} // end of connect

/** True when a key event is typing into a text field, where the space bar is a space. */
function typing(event: KeyboardEvent): boolean { // the caregiver panel's text box
  return event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLInputElement && event.target.type === 'text'); // text fields only
} // end of typing

export function VirtualTv({ onEngine }: { onEngine: (state: EngineState | null) => void }) { // mounted only while drive mode is on, so it never competes with the emulator: connects, and hangs up when switched off
  const { conversation, input } = useMemo(() => { // one conversation and its switch while drive mode is on
    const input = new SwitchInput(now, (t) => conversation.press(t), (t) => conversation.help(t), (t) => conversation.down(t)); // stamps at key-down
    const conversation = new Conversation(CONFIG, now, QUESTIONS, () => {}, post, help, () => input.held(), true); // online from the start, as a TV with a server
    return { conversation, input }; // each calls the other only later, from key events and timers
  }, []); // created once
  const snap = useSyncExternalStore(conversation.subscribe, conversation.snapshot); // re-render on every change
  const [online, setOnline] = useState(false); // whether the stream is open, for tests and the recording
  const [, setDrawn] = useState(''); // the highlight the frame loop last saw

  useEffect(() => { // the engine view: after every change and every press
    const report = () => { // what the engine holds now
      const { mode, question } = conversation.snapshot(); // the screen's state
      if (mode !== 'asking' && mode !== 'saying') return; // only then does the engine hold this question's scan; otherwise the last bars stay
      onEngine({ labels: [...question.replies, ...CONTROLS], posterior: conversation.engine.posterior(), threshold: CONFIG.threshold }); // one bar per option
    }; // end of report
    report(); // the priors, once a question is scanned
    const unsubscribe = conversation.subscribe(report); // a new question, a commit, a rescan
    let later: ReturnType<typeof setTimeout> | undefined; // the report after the switch hands a press over
    const up = (e: KeyboardEvent) => { if (e.code === 'Space' && !typing(e)) { clearTimeout(later); later = setTimeout(report, RELEASE_DEBOUNCE_MS); } }; // the posterior moves once the key has stayed up, after the switch's own timer (set first, below); one report pending at a time
    window.addEventListener('keyup', up); // after the switch's own handler (added first, below)
    return () => { clearTimeout(later); unsubscribe(); window.removeEventListener('keyup', up); onEngine(null); }; // off: no engine to show
  }, [conversation, onEngine]); // once

  useEffect(() => { // the switch: the space bar, except while typing
    const down = (e: KeyboardEvent) => { // key down
      if (e.code !== 'Space' || typing(e)) return; // another key, or a space typed in a text box
      e.preventDefault(); // no page scroll, no button or checkbox activation
      if (!e.repeat) input.keyDown(ENTER); // auto-repeat is ignored, as on the TV
    }; // end of down
    const up = (e: KeyboardEvent) => { // key up: a press once the key stays up, the end of a hold
      if (e.code !== 'Space') return; // another key
      if (!typing(e)) e.preventDefault(); // as above
      input.keyUp(ENTER); // a press once the key stays up, or the end of a hold; nothing for a key-down it never took (a space typed in the box)
    }; // end of up
    const release = () => input.keyUp(ENTER); // the window lost focus with the key down: its key-up will never come
    window.addEventListener('keydown', down, true); // capture: before any focused control sees it
    window.addEventListener('keyup', up, true); // likewise
    window.addEventListener('blur', release); // switching to the emulator or a recorder mid-press
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', release); }; // off
  }, [input]); // once

  useEffect(() => { // the server's stream, as the household's TV
    const stream = new StreamClient(SERVER_URL, DEVICE_TOKEN, (event) => { // connects now, reconnects with back-off
      if (event.type === 'connected') { conversation.setOnline(true); setOnline(true); } // the server is reachable: idle between questions
      else if (event.type === 'disconnected') { conversation.setOnline(false); setOnline(false); } // not reachable: practice questions
      else if (event.type === 'question.created') conversation.receive(event.question); // a new question, or the open one again
      else conversation.update(event.questionId, event.replies, event.scores); // its final replies
    }, connect); // the subprotocol socket
    stream.start(); // connect
    return () => { stream.stop(); input.dispose(); conversation.dispose(); }; // hang up and cancel timers
  }, [conversation, input]); // once

  useEffect(() => { // one animation clock: each frame checks what the engine highlights now
    const { engine } = conversation; // the highlight's source
    let request = 0; // the pending frame
    let drawn = ''; // what is on screen
    const frame = () => { // once per display frame
      const t = now(); // this frame's time
      const seen = `${engine.highlighted(t)}|${engine.scanAt(t).items.join()}`; // what should be on screen
      if (seen !== drawn) { drawn = seen; setDrawn(seen); } // a step or a rescan: re-render
      request = requestAnimationFrame(frame); // the next frame
    }; // end of frame
    request = requestAnimationFrame(frame); // start
    return () => cancelAnimationFrame(request); // stop
  }, [conversation]); // once

  return ( // the frame, with the TV's 1920 x 1080 canvas scaled inside
    <div className="tv-frame" data-testid="tv" data-mode={snap.mode} data-online={online ? 'true' : 'false'}>{/* the mode and the connection, for tests */}
      <div className="tv-canvas">{/* design pixels */}
        <Screen conversation={conversation} snap={snap} />{/* what the TV shows */}
      </div>{/* end of the canvas */}
    </div> // end of the frame
  ); // end of the render
} // end of VirtualTv

function Screen({ conversation, snap }: { conversation: Conversation; snap: ReturnType<Conversation['snapshot']> }) { // the TV's screens
  if (snap.mode === 'help') return <div className="tv-screen"><p className="tv-big tv-help" data-testid="tv-help">{HELP_TEXT[snap.help!]}</p></div>; // what happened to its help request (always set in Help); a press dismisses it
  if (snap.mode === 'saying') return ( // the reply fills the screen for 2 s
    <div className="tv-screen">{/* background */}
      <p className="tv-big" data-testid="tv-saying">{snap.reply}</p>{/* the committed reply */}
      <p className="tv-hint">{CANCEL}</p>{/* a press now cancels it */}
    </div> // end of the screen
  ); // end of Saying
  if (snap.mode === 'idle') return ( // between caregiver questions
    <div className="tv-screen tv-idle">{/* calm: nothing lit or moving */}
      <p className="tv-name">SvaVāk</p>{/* the product */}
      <p className="tv-waiting">Waiting for a question</p>{/* what the screen is doing */}
      {snap.reply !== null && <p className="tv-said">You said: {snap.reply}</p>}{/* the last reply to a caregiver question */}
      {snap.hint && <p className="tv-said" data-testid="tv-idle-hint">{IDLE_HINT}</p>}{/* for a few seconds after a short press, which sends nothing; in the reply's type, as on the TV */}
    </div> // end of the screen
  ); // end of idle
  const scanning = snap.mode === 'asking'; // while waiting the engine still holds the previous scan
  const t = now(); // one time for this render
  const lit = scanning ? conversation.engine.highlighted(t) : -1; // the lit option
  const scanned = scanning ? conversation.engine.scanAt(t).items : null; // the options the running scan shows
  const look = (i: number) => `${i === lit ? ' lit' : ''}${scanned !== null && !scanned.includes(i) ? ' dim' : ''}`; // lit, or out of a rescan
  const q = snap.question; // the question on screen
  const label = q.id === undefined ? 'Practice' : `${q.speaker} asks${snap.mode === 'waiting' ? ' · Finding replies…' : ''}`; // as the TV labels it
  return ( // Asking, or Waiting with nothing lit
    <div className="tv-screen">{/* background */}
      <p className="tv-speaker">{label}</p>{/* who asks, or Practice */}
      <p className="tv-question" data-testid="tv-question">{q.text}</p>{/* the question */}
      <div className="tv-grid">{/* up to 2 x 4 cards */}
        {cardsOf(q).map((reply, i) => reply === null ? <div key={i} className="tv-card dim" data-testid="tv-slot" /> : <div key={i} className={`tv-card${look(i)}`} data-testid="tv-card" data-label={reply} data-lit={i === lit ? 'true' : 'false'}>{reply}</div>)}{/* one card per reply, then the empty slots the model's replies will fill */}
      </div>{/* end of the grid */}
      <div className="tv-controls">{/* scanned after the cards */}
        {CONTROLS.map((name, c) => <div key={name} className={`tv-pill${look(q.replies.length + c)}${name === 'Help' ? ' tv-help' : ''}`} data-testid="tv-pill" data-label={name} data-lit={q.replies.length + c === lit ? 'true' : 'false'}>{name}</div>)}{/* Something else, Help */}
      </div>{/* end of the controls */}
      <p className="tv-hint">{HINT}</p>{/* one-line hint */}
    </div> // end of the screen
  ); // end of the render
} // end of Screen
