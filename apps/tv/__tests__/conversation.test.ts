// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The screen state machine in scan mode: Asking -> Saying (2 s, cancellable) -> next question; controls; Help; K2.

import { nextOnset } from 'switchclock/sim/scan'; // when an option next lights up
import { CONFIG, Conversation, MOCK_SCORES, REPLY_COUNT, SAY_MS, type Selection } from '../src/conversation'; // tested
import { QUESTIONS } from '../src/questions'; // the fixture
import { HOLD_MS, SwitchInput } from '../src/switchInput'; // the key handling the screen wires to it

const ENTER = { keyCode: 66 }; // KEYCODE_ENTER: the switch

const SOMETHING_ELSE = REPLY_COUNT; // option index of Something else, scanned after the replies
const HELP = REPLY_COUNT + 1; // option index of Help, scanned last

let time = 0; // the fake shared clock, in ms
let selections: Selection[] = []; // what the K2 hook received
let conversation: Conversation; // the instance under test

beforeEach(() => { // a fresh conversation at time 0
  jest.useFakeTimers(); // control the 2 s window
  time = 0; // the scan starts at 0
  selections = []; // nothing logged yet
  conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s)); // under test
}); // end of set-up

afterEach(() => { // tidy up
  conversation.dispose(); // no timer left behind
  jest.useRealTimers(); // back to real timers
}); // end of tidy-up

const AIM_MS = 500; // presses come 500 ms into a window, plus the reaction delay: clear of both edges of every window
const BOUNDARY = 2050; // 50 ms after "Tea, please" lights up and "Coffee, please" goes dark: a press too close to call

/** Presses while option i is next lit (plus `lateMs`), until something is committed. */
function select(i: number, lateMs = 0): number { // a simulated selection; returns the number of presses
  const logged = selections.length; // commits so far
  for (let presses = 1; presses <= 10; presses++) { // an aimed press commits, or rescans with i in the pair
    time = nextOnset(conversation.engine, CONFIG, i, time) + AIM_MS + CONFIG.biasMs + lateMs; // aim at its next window
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

  it('starts Asking the first question: a full scan of 10 options, best guess first, at the mock priors', () => { // start
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // Asking
    expect(conversation.engine.scanAt(0)).toEqual({ items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], epoch: 0, end: Infinity }); // all
    const p = conversation.engine.posterior(); // the priors
    [...MOCK_SCORES, 0.01, 0.01].forEach((x, i) => expect(p[i]).toBeCloseTo(x, 12)); // the scores, then 1% per control
  }); // end of the case

  it('commits a reply, fills the screen with it for 2 s, then asks the next question', () => { // Asking -> Saying -> Asking
    select(1); // "Tea, please"
    const saying = conversation.snapshot(); // after the commit
    expect(saying).toEqual({ mode: 'saying', question: QUESTIONS[0], reply: QUESTIONS[0]!.replies[1] }); // Saying
    jest.advanceTimersByTime(SAY_MS - 1); // just under 2 s
    expect(conversation.snapshot()).toBe(saying); // still saying it
    time += SAY_MS; // the clock at the switch-over
    jest.advanceTimersByTime(1); // 2 s reached
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[1], reply: null }); // the next question
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // a fresh scan from the top
  }); // end of the case

  it('cancels the reply with a press in its 2 s window and scans the same question again', () => { // cancel
    select(2); // "Coffee with milk": Saying
    time += 500; // half a second into the window
    conversation.press(time); // a press cancels
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the same question
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // its scan restarted from the top
    jest.advanceTimersByTime(SAY_MS); // past the cancelled window's end
    expect(conversation.snapshot().question).toBe(QUESTIONS[0]); // it did not move on
  }); // end of the case

  it('cancels when the key went down inside the window but came up after it closed', () => { // straddling press
    select(0); // "Coffee, please": Saying
    const down = time + SAY_MS - 50; // key-down 50 ms before the window closes
    time += SAY_MS; // the window closes
    jest.advanceTimersByTime(SAY_MS); // and the next question appears
    expect(conversation.snapshot().question).toBe(QUESTIONS[1]); // before the key came up
    time += 100; // key-up, when the press is handed over
    conversation.press(down); // stamped at key-down
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the reply is cancelled
    expect(selections).toHaveLength(1); // and nothing was chosen on the next question
  }); // end of the case

  it('loads the next fixture set when Something else is chosen, and wraps after the last', () => { // Something else
    select(SOMETHING_ELSE); // choose it
    expect(selections[0]!.label).toBe('Something else'); // it was committed
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[1], reply: null }); // straight to the next set
    for (let q = 1; q < QUESTIONS.length; q++) select(SOMETHING_ELSE); // through the rest
    expect(conversation.snapshot().question).toBe(QUESTIONS[0]); // the first again
  }); // end of the case

  it('opens Help when Help is chosen, and a press dismisses it', () => { // Help by scan
    expect(select(HELP)).toBe(2); // at 1%, the first press leaves Help short of theta; its rescan settles it
    expect(selections[0]!.label).toBe('Help'); // it was committed
    expect(conversation.snapshot().mode).toBe('help'); // "Help is coming"
    time += 1000; // later
    conversation.press(time); // a press dismisses it
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the same question
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // scanned again from the top
  }); // end of the case

  it('opens Help on a hold while Asking; another hold changes nothing and a press dismisses it', () => { // Help by hold
    time = 700; // the hold's key-down
    conversation.help(time); // handed over at its key-up
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null }); // Help
    const listener = jest.fn(); // the screen's re-render callback
    conversation.subscribe(listener); // subscribed from here on
    conversation.help((time += 3000)); // another hold
    expect(listener).not.toHaveBeenCalled(); // changes nothing
    conversation.press((time += 1000)); // dismiss
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // scanned again
  }); // end of the case

  it('drops the reply and opens Help on its question when a hold starts in the Saying window', () => { // hold across its end
    const input = new SwitchInput(() => time, (t) => conversation.press(t), (t) => conversation.help(t)); // wired as on screen
    select(0); // "Coffee, please": Saying from `time`
    time += 300; // 300 ms into the window
    input.keyDown(ENTER); // the hold starts
    time += SAY_MS - 300; // the window closes while the key is down
    jest.advanceTimersByTime(SAY_MS); // and the next question appears
    expect(conversation.snapshot().question).toBe(QUESTIONS[1]); // before the key came up
    time += HOLD_MS; // released well after 2 s
    input.keyUp(ENTER); // a hold
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null }); // on the reply's question
    conversation.press((time += 1000)); // dismiss
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // that question again
  }); // end of the case

  it("rescans the top two after a press that does not commit, and logs offsets from the chosen card's onsets", () => { // rescan
    time = BOUNDARY; // between the two best guesses: about 0.76 and 0.22
    conversation.press(time); // no commit
    expect(selections).toHaveLength(0); // nothing chosen
    expect(conversation.engine.scanAt(time)).toEqual({ items: [0, 1], epoch: time, end: time + 3000 }); // the two best guesses
    expect(select(1)).toBe(2); // the second best guess, chosen in its rescan window (0.94, then above theta)
    expect(selections[0]!.label).toBe(QUESTIONS[0]!.replies[1]); // "Tea, please"
    const aimed = expect.closeTo(AIM_MS + CONFIG.biasMs, 6); // an aimed press's offset
    expect(selections[0]!.offsetsMs).toEqual([expect.closeTo(50, 6), aimed, aimed]); // 50 ms after its onset, then aimed
  }); // end of the case

  it('logs offsets only for the presses whose scan showed the chosen card', () => { // K2 log during rescans
    time = BOUNDARY; // too close to call
    conversation.press(time); // a rescan of the two best guesses
    time += BOUNDARY; // at the same boundary inside the rescan
    conversation.press(time); // the same two again; reply 5 is not shown
    const presses = select(5); // reply 5, once the full scan is back
    expect(selections[0]!.offsetsMs).toHaveLength(1 + presses); // every press but the one in the rescan without it
    expect(selections[0]!.offsetsMs[0]).toBeCloseTo(BOUNDARY - 6000, 6); // the first: before reply 5's onset at 6 s
  }); // end of the case

  it("logs each selection's own presses only, also after a cancel", () => { // K2 log across selections
    const aimed = expect.closeTo(AIM_MS + CONFIG.biasMs, 6); // an aimed press's offset
    time = BOUNDARY; // too close to call
    conversation.press(time); // a press that does not commit
    select(1); // committed in its rescans
    conversation.press((time += 500)); // cancel in the window
    const second = select(2); // presses on the restarted scan
    expect(selections[1]!.offsetsMs).toEqual(Array(second).fill(aimed)); // its own presses only
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // the next question
    const third = select(3); // presses there
    expect(selections[2]!.offsetsMs).toEqual(Array(third).fill(aimed)); // again only its own
  }); // end of the case

  it("reports each accepted press's offset from the chosen card's highlight onset", () => { // K2 log
    select(1, 30); // every press 30 ms later than aimed
    expect(selections[0]!.label).toBe(QUESTIONS[0]!.replies[1]); // the intended reply
    expect(selections[0]!.offsetsMs).toEqual([expect.closeTo(AIM_MS + CONFIG.biasMs + 30, 6)]); // one press, 680 ms in
  }); // end of the case

  it('ignores a press within 150 ms of the last one, in any state', () => { // the engine's debounce
    select(0); // committed at `time`: Saying
    const s = conversation.snapshot(); // the window
    conversation.press(time + CONFIG.debounceMs - 1); // a bounce
    expect(conversation.snapshot()).toBe(s); // is not a cancel
    time += CONFIG.debounceMs; // 150 ms after the committing press
    conversation.press(time); // cancels; the scan restarts from it
    expect(conversation.snapshot().mode).toBe('asking'); // Asking again
    conversation.press(time + CONFIG.debounceMs - 1); // a bounce on the restarted scan
    expect(conversation.engine.scanAt(time + CONFIG.debounceMs).items).toHaveLength(10); // is ignored: still the full scan
    conversation.press(time + CONFIG.debounceMs); // 150 ms after the cancel
    expect(conversation.engine.scanAt(time + CONFIG.debounceMs).items).toEqual([0, 1]); // counts: a rescan of the two
  }); // end of the case

  it('notifies the screen of every change and only then', () => { // useSyncExternalStore contract
    const listener = jest.fn(); // the screen's re-render callback
    const unsubscribe = conversation.subscribe(listener); // subscribe
    time = BOUNDARY; // a press that does not commit
    conversation.press(time); // a rescan: the frame loop draws it, the snapshot stays
    expect(listener).not.toHaveBeenCalled(); // no re-render needed
    select(1); // a commit: Saying
    expect(listener).toHaveBeenCalledTimes(1); // one re-render
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // the next question
    expect(listener).toHaveBeenCalledTimes(2); // one more
    unsubscribe(); // the screen unmounts
    select(0); // another commit
    expect(listener).toHaveBeenCalledTimes(2); // not delivered after unsubscribing
  }); // end of the case
}); // end of Conversation
