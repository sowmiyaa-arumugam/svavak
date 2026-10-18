// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The screen state machine: Asking -> Speaking (3 s) -> next question; controls; the outline flash; K2 offsets.

import { DEFAULT_CONFIG } from 'switchclock'; // engine parameters
import { CONTROLS, Conversation, FLASH_MS, REPLY_COUNT, SPEAK_MS, type Selection } from '../src/conversation'; // tested
import { QUESTIONS } from '../src/questions'; // the fixture

const T = DEFAULT_CONFIG.periodMs; // clock period

let time = 0; // the fake shared clock, in ms
let selections: Selection[] = []; // what the K2 hook received
let conversation: Conversation; // the instance under test

beforeEach(() => { // a fresh conversation at time 0
  jest.useFakeTimers(); // control the 3 s and 150 ms timers
  time = 0; // clocks start at 0
  selections = []; // nothing logged yet
  conversation = new Conversation(DEFAULT_CONFIG, () => time, QUESTIONS, (s) => selections.push(s)); // under test
}); // end of set-up

afterEach(() => { // tidy up
  conversation.dispose(); // no timer left behind
  jest.useRealTimers(); // back to real timers
}); // end of tidy-up

/** Time of option i's first noon at least 500 ms from now (the simulator's reaction lead). */
function nextNoon(i: number): number { // noon finder on the engine's clock
  const { engine } = conversation; // t0 and phases
  const phase = engine.phases()[i]!; // option i's phase
  return engine.t0 + (Math.ceil((time + 500 - engine.t0) / T + phase) - phase) * T; // whole turns back to time
} // end of nextNoon

/** Presses at option i's noon (plus `lateMs`) until something is committed; returns the number of presses. */
function select(i: number, lateMs = 0): number { // a simulated selection
  const logged = selections.length; // commits so far
  for (let presses = 1; presses <= 10; presses++) { // the engine commits within K_max + 1 presses
    time = nextNoon(i) + lateMs; // aim at the noon
    conversation.press(time); // press
    if (selections.length > logged) return presses; // committed
  } // end of the presses
  throw new Error('no commit within 10 presses'); // fails the test
} // end of select

describe('Conversation', () => { // the state machine
  it('uses a fixture of questions with eight replies each', () => { // the 2 x 4 grid
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(5); // about five questions
    for (const q of QUESTIONS) expect(q.replies).toHaveLength(REPLY_COUNT); // eight replies each
  }); // end of the case

  it('starts Asking the first question, with 12 options in one engine and no hint', () => { // initial state
    const s = conversation.snapshot(); // the first snapshot
    expect(s.mode).toBe('asking'); // Asking
    expect(s.question).toBe(QUESTIONS[0]); // the first question
    expect(s.hint).toBeNull(); // default hint
    expect(s.posterior).toHaveLength(REPLY_COUNT + CONTROLS.length); // 8 replies and 4 controls
    expect(s.posterior.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12); // a distribution
  }); // end of the case

  it('commits a reply, shows it for 3 s, then asks the next question', () => { // Asking -> Speaking -> Asking
    select(1); // "Tea, please"
    const speaking = conversation.snapshot(); // after the commit
    expect(speaking.mode).toBe('speaking'); // Speaking
    expect(speaking.reply).toBe(QUESTIONS[0]!.replies[1]); // the chosen reply
    const listener = jest.fn(); // the screen's re-render callback
    conversation.subscribe(listener); // subscribed from here on
    conversation.press(time + 1000); // a press while speaking
    expect(conversation.snapshot()).toBe(speaking); // is ignored
    jest.advanceTimersByTime(SPEAK_MS - 1); // just under 3 s
    expect(conversation.snapshot().mode).toBe('speaking'); // still speaking
    expect(listener).not.toHaveBeenCalled(); // no change so far, so no re-render
    time += SPEAK_MS; // the clock at the switch-over
    jest.advanceTimersByTime(1); // 3 s reached
    expect(listener).toHaveBeenCalledTimes(1); // the screen is told about the next question
    const next = conversation.snapshot(); // after the time-out
    expect(next.mode).toBe('asking'); // Asking again
    expect(next.question).toBe(QUESTIONS[1]); // the next question
    expect(next.reply).toBeNull(); // no reply shown
    expect(conversation.engine.t0).toBe(time); // the clocks restarted for it
  }); // end of the case

  it('comes back to the first question after the last', () => { // wrap-around
    for (let q = 0; q < QUESTIONS.length; q++) { // answer every question
      select(0); // the first reply
      jest.advanceTimersByTime(SPEAK_MS); // let it be shown
    } // end of the questions
    expect(conversation.snapshot().question).toBe(QUESTIONS[0]); // the first again
  }); // end of the case

  it('shows a committed control only by name in the hint and restarts the selection', () => { // controls
    const help = REPLY_COUNT + CONTROLS.indexOf('Help'); // the Help option
    select(help); // choose it
    const s = conversation.snapshot(); // after the commit
    expect(selections[0]!.label).toBe('Help'); // Help was committed
    expect(s.mode).toBe('asking'); // still Asking
    expect(s.question).toBe(QUESTIONS[0]); // the same question
    expect(s.hint).toBe('Help'); // its name in the hint line
    expect(conversation.engine.t0).toBe(time); // a new selection started at the commit
    expect(s.posterior[help]).toBeCloseTo(DEFAULT_CONFIG.controlShare, 12); // back to the prior
    expect(s.flash).toEqual(s.posterior.map(() => true)); // the clocks restarted, so every dial flashes
    const presses = select(3, 20); // a reply on the same question, every press 20 ms late
    expect(selections[1]!.offsetsMs).toHaveLength(presses); // only this selection's presses are logged
    for (const d of selections[1]!.offsetsMs) expect(d).toBeCloseTo(20, 6); // against its own t0 and phases
    jest.advanceTimersByTime(SPEAK_MS); // shown, then the next question
    expect(conversation.snapshot().hint).toBeNull(); // the hint is back to the default
  }); // end of the case

  it('flashes exactly the dials whose phase changed, for 150 ms', () => { // phase changes
    const before = conversation.engine.phases(); // layout before the press
    time = nextNoon(5); // one press at option 5's noon
    conversation.press(time); // press
    expect(selections).toHaveLength(0); // one press does not commit from uniform priors
    const after = conversation.engine.phases(); // new layout, applied at once
    const s = conversation.snapshot(); // after the press
    expect(s.flash).toEqual(after.map((p, i) => p !== before[i])); // flash marks the changed dials
    expect(s.flash).toContain(true); // and some did change
    jest.advanceTimersByTime(FLASH_MS - 1); // just under 150 ms
    expect(conversation.snapshot().flash).toEqual(s.flash); // still flashing
    jest.advanceTimersByTime(1); // 150 ms reached
    expect(conversation.snapshot().flash.some(Boolean)).toBe(false); // the flash is over
  }); // end of the case

  it('notifies the screen of every change and only then', () => { // useSyncExternalStore contract
    const listener = jest.fn(); // the screen's re-render callback
    const unsubscribe = conversation.subscribe(listener); // subscribe
    time = nextNoon(5); // a press
    conversation.press(time); // new posterior and flash
    expect(listener).toHaveBeenCalledTimes(1); // one re-render
    conversation.press(time + 10); // debounced
    expect(listener).toHaveBeenCalledTimes(1); // no re-render
    jest.advanceTimersByTime(FLASH_MS); // the flash ends
    expect(listener).toHaveBeenCalledTimes(2); // one more re-render
    unsubscribe(); // the screen unmounts
    time = nextNoon(5); // another press
    conversation.press(time); // a change
    expect(listener).toHaveBeenCalledTimes(2); // not delivered after unsubscribing
  }); // end of the case

  it('ignores a press within 150 ms of the last one', () => { // the engine's debounce
    time = nextNoon(2); // a press
    conversation.press(time); // accepted
    const s = conversation.snapshot(); // after it
    conversation.press(time + DEFAULT_CONFIG.debounceMs - 1); // too soon
    expect(conversation.snapshot()).toBe(s); // nothing changed
  }); // end of the case

  it('keeps the debounce across the new selection a control starts', () => { // setOptions resets the engine's own
    select(REPLY_COUNT + CONTROLS.indexOf('Undo')); // a committed control restarts the selection
    const s = conversation.snapshot(); // the new selection
    conversation.press(time + 50); // a bounce 50 ms after the committing press
    expect(conversation.snapshot()).toBe(s); // ignored
    conversation.press(time + DEFAULT_CONFIG.debounceMs); // 150 ms after it
    expect(conversation.snapshot()).not.toBe(s); // accepted
  }); // end of the case

  it('debounces the first press on a new question against a press made while speaking', () => { // straddling presses
    select(0); // a reply: Speaking
    time += SPEAK_MS - 20; // just before the next question
    conversation.press(time); // ignored while speaking, but it counts for the debounce
    jest.advanceTimersByTime(SPEAK_MS); // the next question appears
    const s = conversation.snapshot(); // Asking again
    expect(s.mode).toBe('asking'); // on the next question
    conversation.press(time + 50); // a bounce 50 ms after that press
    expect(conversation.snapshot()).toBe(s); // ignored
  }); // end of the case

  it("reports each accepted press's offset from the chosen dial's noon", () => { // K2 log
    const presses = select(2, 30); // every press 30 ms late
    expect(selections).toHaveLength(1); // one selection
    expect(selections[0]!.label).toBe(QUESTIONS[0]!.replies[2]); // the intended reply
    expect(selections[0]!.offsetsMs).toHaveLength(presses); // one offset per accepted press
    for (const d of selections[0]!.offsetsMs) expect(d).toBeCloseTo(30, 6); // each 30 ms after noon
  }); // end of the case
}); // end of Conversation
