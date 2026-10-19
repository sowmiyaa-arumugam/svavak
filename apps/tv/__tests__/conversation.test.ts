// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The screen state machine in scan mode: Asking -> Saying (2 s, cancellable) -> next question; controls; Help; K2.

import { nextOnset } from 'switchclock/sim/scan'; // when an option next lights up
import { BUDGET_MS, CONFIG, Conversation, MOCK_SCORES, REPLY_COUNT, SAY_MS, type Reply, type Selection } from '../src/conversation'; // tested
import type { Question } from '../src/questions'; // question shape
import { QUESTIONS } from '../src/questions'; // the fixture
import { HOLD_MS, SwitchInput } from '../src/switchInput'; // the key handling the screen wires to it

const ENTER = { keyCode: 66 }; // KEYCODE_ENTER: the switch

const SOMETHING_ELSE = REPLY_COUNT; // option index of Something else, scanned after the replies
const HELP = REPLY_COUNT + 1; // option index of Help, scanned last

let time = 0; // the fake shared clock, in ms
let selections: Selection[] = []; // what the K2 hook received
let said: Reply[] = []; // what the reply hook received
let conversation: Conversation; // the instance under test
let input: SwitchInput; // the switch, wired to it as on screen

beforeEach(() => { // a fresh conversation at time 0
  jest.useFakeTimers(); // control the 2 s window
  time = 0; // the scan starts at 0
  selections = []; // nothing logged yet
  said = []; // nothing said yet
  input = new SwitchInput(() => time, (t) => conversation.press(t), (t) => conversation.help(t), (t) => conversation.down(t)); // as on screen
  conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), (r) => said.push(r), () => input.held()); // under test
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

  it('cancels when the key went down inside the window but came up after it closed, and posts nothing', () => { // straddling press
    select(0); // "Coffee, please": Saying
    time += SAY_MS - 50; // 50 ms before the window closes
    input.keyDown(ENTER); // the key goes down
    time += 50; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed, with the key still down
    time += 100; // key-up, when the press is handed over
    input.keyUp(ENTER); // stamped at key-down
    expect(said).toEqual([]); // the reply never left the TV
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the same question again
    expect(selections).toHaveLength(1); // and nothing was chosen after it
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

  it('cancels at the key-down of a hold that starts in the Saying window, and opens Help on its question at key-up', () => { // hold
    select(0); // "Coffee, please": Saying from `time`
    time += 300; // 300 ms into the window
    input.keyDown(ENTER); // the hold starts
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the reply is cancelled
    time += HOLD_MS; // released after 2 s
    jest.advanceTimersByTime(SAY_MS); // past the cancelled window's end
    input.keyUp(ENTER); // a hold
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null }); // Help on that question
    expect(said).toEqual([]); // the reply was never posted
    time += 1000; // later
    input.keyDown(ENTER); // a press goes down
    expect(conversation.snapshot().mode).toBe('help'); // a key-down outside the window decides nothing
    time += 100; // a short press
    input.keyUp(ENTER); // handed over: dismisses Help
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // that question again
  }); // end of the case

  it('cancels at the key-down in the Saying window, before the key comes up', () => { // early cancel
    select(2); // "Coffee with milk": Saying
    time += 500; // half a second into the window
    input.keyDown(ENTER); // the key goes down
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // cancelled at once
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // its scan restarted from the key-down
    const asking = conversation.snapshot(); // the restarted scan
    time += 120; // a short press
    input.keyUp(ENTER); // the same press, handed over again: debounced away
    expect(conversation.snapshot()).toBe(asking); // nothing more happened
    expect(conversation.engine.scanAt(time).items).toHaveLength(10); // and no rescan started
    jest.advanceTimersByTime(SAY_MS); // past the cancelled window's end
    expect(said).toEqual([]); // nothing posted
  }); // end of the case

  it("cancels when a switch key is still down at the window's end, even a bounce", () => { // held at the end
    time = nextOnset(conversation.engine, CONFIG, 0, time) + AIM_MS + CONFIG.biasMs; // aimed at "Coffee, please"
    input.keyDown(ENTER); // the committing press goes down
    expect(conversation.snapshot().mode).toBe('asking'); // decided at key-up, as ever
    time += 100; // a short press
    input.keyUp(ENTER); // handed over: committed with one press
    expect(conversation.snapshot().mode).toBe('saying'); // Saying
    time += 20; // 20 ms after the release
    input.keyDown(ENTER); // a contact bounce: no key-down notice, but a switch key is down
    expect(conversation.snapshot().mode).toBe('saying'); // no cancel yet
    time += SAY_MS; // the window's end, the key still down
    jest.advanceTimersByTime(SAY_MS); // reached
    expect(said).toEqual([]); // not posted
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the same question again
    input.keyUp(ENTER); // the bounce ends: neither a press nor a hold
    expect(conversation.snapshot().mode).toBe('asking'); // still Asking
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

/** A server question: the mock model's replies for the demo question, with priors that sum to 1, best guess first. */
const LIVE: Question = { // as parsed from question.created and question.candidates
  id: 'q1', // server id
  speaker: 'Alex', // asked_by
  text: 'Would you like tea or coffee?', // the question
  replies: ['Tea, please', 'Coffee, please', 'Neither, thanks', 'Not right now', 'Both, please', "I'm not sure", 'Ask me later', 'Tell me more'], // the model's
  scores: [0.3, 0.28, 0.1, 0.08, 0.07, 0.07, 0.05, 0.05], // priors
}; // end of LIVE
const DEFAULTS = { replies: ['Yes, please', 'No, thanks', 'Not now', "I'm not sure", 'Ask me later', 'Tell me more', 'Thank you', 'Maybe'], scores: [0.3, 0.25, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04] }; // pushed first

describe('Conversation with the server', () => { // questions from the stream, replies to POST /v1/utterances
  it("shows a server question at once while scanning, and starts its scan when the model's replies arrive, at their priors", () => { // stable list
    time = 700; // mid-scan of the first fixture
    conversation.receive({ ...LIVE, ...DEFAULTS }); // question.created with the defaults
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: { ...LIVE, ...DEFAULTS }, reply: null }); // shown, nothing lit
    time = 1900; // 1.2 s later, inside the budget
    conversation.update('q1', LIVE.replies, LIVE.scores!); // question.candidates
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // the model's replies
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // the highlight starts now, on the final list
    const p = conversation.engine.posterior(); // the priors
    LIVE.scores!.forEach((x, i) => expect(p[i]).toBeCloseTo(0.98 * x, 12)); // the server's, after the controls' 2%
  }); // end of the case

  it("starts the scan on the default replies when the budget passes without the model's, and ignores them after that", () => { // no replies
    time = 700; // mid-scan of the first fixture
    conversation.receive({ ...LIVE, ...DEFAULTS }); // question.created with the defaults
    const waiting = conversation.snapshot(); // shown, nothing lit
    time += BUDGET_MS - 1; // just inside the budget
    jest.advanceTimersByTime(BUDGET_MS - 1); // reached
    expect(conversation.snapshot()).toBe(waiting); // still waiting
    time += 1; // the budget's end
    jest.advanceTimersByTime(1); // reached
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: { ...LIVE, ...DEFAULTS }, reply: null }); // the defaults
    expect(conversation.engine.scanAt(time).epoch).toBe(700 + BUDGET_MS); // the highlight starts exactly then
    const p = conversation.engine.posterior(); // the priors
    DEFAULTS.scores.forEach((x, i) => expect(p[i]).toBeCloseTo(0.98 * x, 12)); // the server's defaults
    const asking = conversation.snapshot(); // the scan
    time += 300; // later
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the model's replies, too late
    expect(conversation.snapshot()).toBe(asking); // the list stays as it is
    expect(conversation.engine.scanAt(time).epoch).toBe(700 + BUDGET_MS); // and so does the scan
  }); // end of the case

  it("ignores the model's replies after the scan started, and replies for a question not shown", () => { // late replies
    conversation.receive({ ...LIVE, ...DEFAULTS }); // question.created with the defaults
    time = 900; // later
    conversation.update('q1', LIVE.replies, LIVE.scores!); // question.candidates: the scan starts
    const asking = conversation.snapshot(); // on the model's replies
    time = 1500; // later
    conversation.update('q1', DEFAULTS.replies, DEFAULTS.scores); // more replies for it
    conversation.update('q9', DEFAULTS.replies, DEFAULTS.scores); // replies for a question not on screen
    time = BUDGET_MS; // the budget's end
    jest.advanceTimersByTime(BUDGET_MS); // passed
    expect(conversation.snapshot()).toBe(asking); // unchanged
    expect(asking.question).toEqual(LIVE); // the model's replies
    expect(conversation.engine.scanAt(time).epoch).toBe(900); // the same scan
  }); // end of the case

  it('ignores a press while a server question waits, since nothing is lit', () => { // no highlight yet
    conversation.receive(LIVE); // shown at 0, waiting
    const waiting = conversation.snapshot(); // nothing lit
    conversation.press((time = 1000)); // a press
    expect(conversation.snapshot()).toBe(waiting); // nothing happened
    time = 1050; // 50 ms later
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the model's replies: the scan starts
    conversation.press((time = 1100)); // 100 ms after the ignored press
    expect(conversation.engine.scanAt(time).items).toHaveLength(10); // debounced against it all the same: no rescan
    expect(selections).toEqual([]); // and no commit
  }); // end of the case

  it('hands over a reply only when its 2 s window has passed, with its statistics; then the fixtures resume at once', () => { // post timing
    conversation.receive(LIVE); // shown at 0
    conversation.update('q1', LIVE.replies, LIVE.scores!); // its replies: the scan starts at 0
    const presses = select(1); // "Coffee, please"
    const committedAt = time; // the commit
    jest.advanceTimersByTime(SAY_MS - 1); // inside the window
    expect(said).toEqual([]); // not yet
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(1); // reached
    expect(said).toEqual([{ questionId: 'q1', questionText: null, text: 'Coffee, please', clicks: presses, durationMs: Math.round(committedAt) }]); // posted now
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[1], reply: null }); // the fixture after the one it replaced
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // a fixture scans at once
  }); // end of the case

  it('answers a server question with Something else, through the Saying window like any reply', () => { // Something else
    conversation.receive(LIVE); // shown at 0
    conversation.update('q1', LIVE.replies, LIVE.scores!); // its replies: the scan starts at 0
    const presses = select(SOMETHING_ELSE); // chosen
    const committedAt = time; // the commit
    expect(conversation.snapshot()).toEqual({ mode: 'saying', question: LIVE, reply: 'Something else' }); // said like a reply
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(said).toEqual([{ questionId: 'q1', questionText: null, text: 'Something else', clicks: presses, durationMs: Math.round(committedAt) }]); // its answer
    const newer = { ...LIVE, id: 'q2' }; // the next server question
    conversation.receive(newer); // shown
    conversation.update('q2', LIVE.replies, LIVE.scores!); // scanned
    select(SOMETHING_ELSE); // chosen again
    conversation.press((time += 500)); // cancelled in the window
    jest.advanceTimersByTime(SAY_MS); // past its end
    expect(said).toHaveLength(1); // nothing more handed over
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: newer, reply: null }); // the same question again
  }); // end of the case

  it("never hands over a cancelled reply, and hands over fixture replies with the question's text instead of an id", () => { // fixtures
    select(0); // "Coffee, please" on the first fixture
    conversation.press((time += 500)); // cancelled in the window
    jest.advanceTimersByTime(SAY_MS); // past its end
    expect(said).toEqual([]); // nothing
    select(1); // "Tea, please"
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(said).toEqual([expect.objectContaining({ questionId: null, questionText: QUESTIONS[0]!.text, text: 'Tea, please' })]); // a fixture reply
  }); // end of the case

  it('holds a server question asked during Saying or Help until it ends, then waits out its budget; the newest comes first', () => { // queueing
    select(0); // Saying
    const arrived = time; // the question arrives during the window
    conversation.receive(LIVE); // queued
    expect(conversation.snapshot().mode).toBe('saying'); // the reply keeps the screen
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: LIVE, reply: null }); // shown, 1.5 s of its budget left
    time = arrived + BUDGET_MS; // its budget's end
    jest.advanceTimersByTime(BUDGET_MS - SAY_MS); // reached
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // its scan starts
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // from then
    conversation.help((time += 100)); // a hold: Help
    const newer = { ...LIVE, id: 'q2', text: 'Shall I open the window?' }; // asked while Help shows
    conversation.receive(newer); // queued
    expect(conversation.snapshot().mode).toBe('help'); // Help stays
    conversation.press((time += 1000)); // dismissed 1 s into its budget
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: newer, reply: null }); // the newer question, waiting
  }); // end of the case

  it('scans a queued server question at once when it is shown, if its replies came meanwhile', () => { // candidates while queued
    select(0); // Saying
    conversation.receive({ ...LIVE, ...DEFAULTS }); // queued, with the defaults
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the model's replies arrive
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // shown with them, scanning
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // from the window's end
  }); // end of the case

  it('scans a queued server question on its defaults when its budget ended during Help, ignoring later replies', () => { // late, queued
    conversation.help((time = 100)); // a hold: Help
    conversation.receive({ ...LIVE, ...DEFAULTS }); // queued at 100
    time = 100 + BUDGET_MS; // its budget's end
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the model's replies, too late
    conversation.press((time += 1000)); // Help dismissed
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: { ...LIVE, ...DEFAULTS }, reply: null }); // the defaults, at once
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // from the dismissal
  }); // end of the case

  it('opens Help while a question waits; replies that arrive meanwhile start its scan when Help is dismissed', () => { // Help while waiting
    conversation.receive({ ...LIVE, ...DEFAULTS }); // shown at 0, waiting
    conversation.help((time = 500)); // a hold
    time = 1000; // inside the budget
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the model's replies
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: LIVE, reply: null }); // kept for later
    time = 2 * BUDGET_MS; // long after the budget's end
    jest.advanceTimersByTime(2 * BUDGET_MS); // passed
    expect(conversation.snapshot().mode).toBe('help'); // Help stays
    conversation.press(time); // dismissed
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // the scan starts on them
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // now
  }); // end of the case

  it('waits out the rest of the budget when Help, opened while waiting, is dismissed inside it', () => { // Help inside the budget
    conversation.receive(LIVE); // shown at 0, waiting
    conversation.help((time = 500)); // a hold
    conversation.press((time = 1500)); // dismissed 1.5 s into the budget
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: LIVE, reply: null }); // waiting again
    time = BUDGET_MS - 1; // just inside the budget
    jest.advanceTimersByTime(BUDGET_MS - 1500 - 1); // the rest of it, timed from the dismissal
    expect(conversation.snapshot().mode).toBe('waiting'); // still waiting
    time = BUDGET_MS; // the budget's end
    jest.advanceTimersByTime(1); // reached
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // the scan starts
    expect(conversation.engine.scanAt(time).epoch).toBe(BUDGET_MS); // exactly at the budget's end
  }); // end of the case

  it('ignores a replay of the question on screen while its scan runs, as after a reconnect', () => { // replay while scanning
    conversation.receive({ ...LIVE, ...DEFAULTS }); // shown at 0
    time = 900; // its replies arrive
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the scan starts at 900
    const asking = conversation.snapshot(); // scanning
    time = 1500; // the stream reconnects
    conversation.receive(LIVE); // the server sends the open question again
    expect(conversation.snapshot()).toBe(asking); // nothing changed
    expect(conversation.engine.scanAt(time).epoch).toBe(900); // the scan runs on
  }); // end of the case

  it("starts the scan on the model's replies carried by a replay while the question waits", () => { // replay while waiting
    conversation.receive({ ...LIVE, ...DEFAULTS }); // shown at 0, waiting
    time = 1200; // the stream reconnects; the model's replies reached the server meanwhile
    conversation.receive(LIVE); // the replay carries them
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // the scan starts on them
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // now
  }); // end of the case

  it("keeps waiting on a replay that carries the defaults again, and starts the scan when the model's replies arrive", () => { // replay of the defaults
    conversation.receive({ ...LIVE, ...DEFAULTS }); // shown at 0, waiting
    const waiting = conversation.snapshot(); // nothing lit
    time = 1000; // the stream reconnects before the model's replies reached the server
    conversation.receive({ ...LIVE, ...DEFAULTS }); // the replay carries the defaults
    expect(conversation.snapshot()).toBe(waiting); // still waiting
    time = 2000; // inside the budget
    conversation.update('q1', LIVE.replies, LIVE.scores!); // question.candidates
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // the model's replies
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // the highlight starts now
  }); // end of the case

  it('takes a replay of the queued question as its replies, not as a new question', () => { // replay while queued
    select(0); // Saying
    conversation.receive({ ...LIVE, ...DEFAULTS }); // queued, with the defaults
    conversation.receive(LIVE); // sent again after a reconnect, with the model's replies
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // scanned at once on them
  }); // end of the case

  it('shows the open question again after an app reload', () => { // a fresh screen
    conversation.receive(LIVE); // shown before the reload
    conversation.update('q1', LIVE.replies, LIVE.scores!); // and scanned
    conversation.dispose(); // the app reloads
    conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), (r) => said.push(r), () => input.held()); // fresh
    time = 5000; // it connects
    conversation.receive(LIVE); // the server sends the open question
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: LIVE, reply: null }); // shown
    time += BUDGET_MS; // its budget's end
    jest.advanceTimersByTime(BUDGET_MS); // reached
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // and scanned
  }); // end of the case

  it("ignores a press whose key went down before a server question's scan started", () => { // stale press
    const down = 500; // key-down on the fixture's scan
    time = 600; // the server question arrives before the key comes up
    conversation.receive(LIVE); // shown, waiting
    time = 700; // its replies arrive
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the scan starts
    conversation.press(down); // handed over at key-up
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // nothing happened
    expect(conversation.engine.scanAt(time).items).toHaveLength(10); // no rescan started
  }); // end of the case
}); // end of the server cases
