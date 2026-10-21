// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The caregiver panel (plan §4.7): the simulated Alexa+. A typed turn goes to the sim agent's POST /agent/turn; each
// tool call shows as a chip while the turn runs, and the agent's final speech is shown large and spoken by the browser.

import { useState, type FormEvent } from 'react'; // state and the form's submit event
import { AGENT_URL } from './config'; // where the agent listens
import { readSse } from './sse'; // the agent's event stream
import type { LocalHop } from './TraceStrip'; // lights the caregiver and agent hops of the trace

/** One tool call of the turn: running until its result comes back. */
interface Chip { name: string; state: 'running' | 'ok' | 'failed' } // name and state

/** The turn on screen. */
interface Turn { said: string; chips: Chip[]; speech: string | null; error: string | null; running: boolean } // the caregiver's words, the calls, the answer

/** Speaks the agent's answer with the browser's own voice, replacing anything still being said. */
function speak(text: string): void { // the panel's voice output
  if (!('speechSynthesis' in window)) return; // a browser without speech synthesis: the answer is shown only
  window.speechSynthesis.cancel(); // stop the previous answer
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); // say this one
} // end of speak

export function CaregiverPanel({ onHop }: { onHop: LocalHop }) { // the left panel
  const [text, setText] = useState(''); // the text box
  const [turn, setTurn] = useState<Turn | null>(null); // the latest turn

  async function send(event: FormEvent): Promise<void> { // Send, or Enter in the text box
    event.preventDefault(); // no page reload
    const said = text.trim(); // the caregiver's words
    if (said === '' || turn?.running) return; // nothing to send, or a turn still running
    setText(''); // clear the box
    let current: Turn = { said, chips: [], speech: null, error: null, running: true }; // the new turn
    const show = (next: Turn) => { current = next; setTurn(next); }; // keep the latest copy for the stream's callbacks
    show(current); // on screen at once
    const started = performance.now(); // for the hops' durations
    try { // the turn
      const res = await fetch(`${AGENT_URL}/agent/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: said }) }); // the agent's only route
      if (!res.ok || !res.body) throw new Error(`the agent answered ${res.status}`); // refused (400, 403, 413)
      onHop('caregiver', 'POST /agent/turn', Math.round(performance.now() - started)); // the caregiver hop: until the agent's stream opened
      for await (const frame of readSse(res.body)) { // tool_call, tool_result, speech, error, done
        const data = JSON.parse(frame.data) as { name?: string; ok?: boolean; text?: string; message?: string }; // the event's fields
        if (frame.event === 'tool_call') show({ ...current, chips: [...current.chips, { name: data.name ?? '?', state: 'running' }] }); // a new chip
        else if (frame.event === 'tool_result') show({ ...current, chips: settle(current.chips, data.name ?? '?', data.ok === true) }); // its result
        else if (frame.event === 'speech' && data.text) { show({ ...current, speech: data.text }); speak(data.text); } // the answer, shown and spoken
        else if (frame.event === 'error') show({ ...current, error: data.message ?? 'The agent could not finish this turn.' }); // a failed turn
      } // end of the stream
    } catch { // the agent is not running, or the stream broke
      show({ ...current, error: 'The agent could not be reached. Is it running on 127.0.0.1:8790?' }); // say so
    } // end of the turn
    onHop('agent', 'turn', Math.round(performance.now() - started)); // the agent hop, with the whole turn's time
    show({ ...current, running: false }); // ready for the next turn
  } // end of send

  return ( // the panel
    <section className="panel caregiver" aria-label="Caregiver panel">{/* a device-like frame */}
      <div className="banner" data-testid="sim-banner">Simulated Alexa+ experience</div>{/* permanent */}
      <div className="transcript" aria-live="polite">{/* the turn: words, calls, answer */}
        {turn === null && <p className="muted">Ask Sam something, for example "Ask Sam if he wants tea or coffee".</p>}{/* before the first turn */}
        {turn !== null && <p className="bubble" data-testid="caregiver-said">{turn.said}</p>}{/* the caregiver's words */}
        {turn !== null && turn.chips.length > 0 && ( // the tool calls
          <ul className="chips">{/* one chip per call, in order */}
            {turn.chips.map((chip, i) => <li key={i} className={`chip ${chip.state}`} data-testid="tool-chip" data-tool={chip.name} data-state={chip.state}>{chip.name}</li>)}{/* name and state */}
          </ul> // end of the chips
        )}{/* end of the tool calls */}
        {turn?.speech && <p className="speech" data-testid="speech">{turn.speech}</p>}{/* the answer, large */}
        {turn?.error && <p className="error" data-testid="caregiver-error">{turn.error}</p>}{/* a failed turn */}
      </div>{/* end of the turn */}
      <form className="ask" onSubmit={send}>{/* the input row */}
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type to the simulated Alexa+" aria-label="Caregiver's words" maxLength={500} data-testid="caregiver-input" />{/* the agent takes up to 500 characters */}
        <button type="submit" disabled={turn?.running === true || text.trim() === ''} data-testid="caregiver-send">Send</button>{/* one turn at a time */}
      </form>{/* end of the input row */}
    </section> // end of the panel
  ); // end of the render
} // end of CaregiverPanel

function settle(chips: Chip[], name: string, ok: boolean): Chip[] { // the oldest running chip of that name gets its result
  const i = chips.findIndex((c) => c.name === name && c.state === 'running'); // results come in call order
  return chips.map((c, j) => (j === i ? { ...c, state: ok ? 'ok' : 'failed' } : c)); // a new list, one chip changed
} // end of settle
