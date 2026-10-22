// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The screen state machine in scan mode: Asking -> Saying (2 s, cancellable) -> next question; controls; Help; K2; Idle.

import { nextOnset } from 'switchclock/sim/scan'; // when an option next lights up
import { BUDGET_MS, cardsOf, CONFIG, Conversation, HELP_TEXT, IDLE_HINT, IDLE_HINT_MS, MOCK_SCORES, REPLY_COUNT, SAY_MS, type Announce, type Reply, type Selection } from '../src/conversation'; // tested
import type { Question } from '../src/questions'; // question shape
import { QUESTIONS } from '../src/questions'; // the fixture
import { HOLD_MS, RELEASE_DEBOUNCE_MS, SwitchInput } from '../src/switchInput'; // the key handling the screen wires to it

const ENTER = { keyCode: 66 }; // KEYCODE_ENTER: the switch

const SOMETHING_ELSE = REPLY_COUNT; // option index of Something else, scanned after the replies
const HELP = REPLY_COUNT + 1; // option index of Help, scanned last

let time = 0; // the fake shared clock, in ms
let selections: Selection[] = []; // what the K2 hook received
let said: Reply[] = []; // what the reply hook received
let helps: { resolve: () => void; reject: (error: Error) => void }[] = []; // the help requests the help hook was asked to send, each settled by the test
let conversation: Conversation; // the instance under test
let input: SwitchInput; // the switch, wired to it as on screen

/** The help hook, as the screen's: one request per call, answered when the test settles it. */
const sendHelp = () => new Promise<void>((resolve, reject) => { helps.push({ resolve, reject }); }); // pending until settled

beforeEach(() => { // a fresh conversation at time 0
  jest.useFakeTimers(); // control the 2 s window
  time = 0; // the scan starts at 0
  selections = []; // nothing logged yet
  said = []; // nothing said yet
  helps = []; // no help requested yet
  input = new SwitchInput(() => time, (t) => conversation.press(t), (t) => conversation.help(t), (t) => conversation.down(t)); // as on screen
  conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), (r) => { said.push(r); }, sendHelp, () => input.held()); // under test
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

/** Moves the shared clock and the timers on together by `ms`, a millisecond at a time, for the switch input's timers. */
function wait(ms: number): void { // time passes
  for (let i = 0; i < ms; i++) { // each millisecond
    time += 1; // the clock the handlers read
    jest.advanceTimersByTime(1); // the timers they set
  } // end of the milliseconds
} // end of wait

describe('Conversation', () => { // the state machine
  it('uses a fixture of questions with eight replies each', () => { // the 2 x 4 grid
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(5); // about five questions
    for (const q of QUESTIONS) expect(q.replies).toHaveLength(REPLY_COUNT); // eight replies each
  }); // end of the case

  it('ends no practice reply in a full stop, as the server ends none', () => { // consistent punctuation on the cards
    expect(QUESTIONS.flatMap((q) => q.replies).filter((r) => r.endsWith('.'))).toEqual([]); // "?" and "!" would be fine
  }); // end of the case

  it("puts each practice question's basic answers among its first four replies, as the server does", () => { // the first row is scanned first
    const BASIC: [question: string, answers: string[]][] = [ // each practice question, in order, and the basic answers its first four must include
      ['Would you like tea or coffee?', ['Tea, please', 'Coffee, please']], // a choice: each option
      ['Shall we watch something tonight?', ['Yes, a film', 'No, not tonight']], // yes/no: a yes and a no
      ['How are you feeling today?', []], // open: none
      ['What would you like for lunch?', []], // open: none
      ['Shall I open the window?', ['Yes, please', 'No, thanks']], // yes/no: a yes and a no
    ]; // end of the basic answers
    expect(QUESTIONS.map((q) => q.text)).toEqual(BASIC.map(([text]) => text)); // every practice question is listed
    expect(BASIC.map(([text, answers], i) => [text, answers.filter((a) => !QUESTIONS[i]!.replies.slice(0, 4).includes(a))])).toEqual(BASIC.map(([text]) => [text, []])); // none missing from a first row
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
    wait(SAY_MS - 50); // 50 ms before the window closes
    input.keyDown(ENTER); // the key goes down
    wait(50); // the window's end, passed with the key still down
    wait(100); // later
    input.keyUp(ENTER); // the key comes up
    wait(RELEASE_DEBOUNCE_MS); // stayed up: the press is handed over, stamped at key-down
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
    expect(conversation.snapshot().mode).toBe('help'); // Help, with its help request
    time += 1000; // later
    conversation.press(time); // a press dismisses it
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the same question
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // scanned again from the top
  }); // end of the case

  it('opens Help on a hold while Asking; another hold changes nothing and a press dismisses it', () => { // Help by hold
    time = 700; // the hold's key-down
    conversation.help(time); // handed over once it has lasted 2 s
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'sending' }); // Help
    const listener = jest.fn(); // the screen's re-render callback
    conversation.subscribe(listener); // subscribed from here on
    conversation.help((time += 3000)); // another hold
    expect(listener).not.toHaveBeenCalled(); // changes nothing
    conversation.press((time += 1000)); // dismiss
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // scanned again
  }); // end of the case

  it('cancels at the key-down of a hold that starts in the Saying window, and opens Help on its question at 2 s, before the key comes up', () => { // hold
    select(0); // "Coffee, please": Saying from `time`
    wait(300); // 300 ms into the window
    input.keyDown(ENTER); // the hold starts
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the reply is cancelled
    wait(HOLD_MS); // held for 2 s, past the cancelled window's end
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'sending' }); // Help on that question, the key still down
    input.keyUp(ENTER); // released
    wait(RELEASE_DEBOUNCE_MS); // the hold's final release
    expect(conversation.snapshot().mode).toBe('help'); // does nothing
    expect(said).toEqual([]); // the reply was never posted
    wait(1000); // later
    input.keyDown(ENTER); // a press goes down
    expect(conversation.snapshot().mode).toBe('help'); // a key-down outside the window decides nothing
    wait(100); // a short press
    input.keyUp(ENTER); // up
    wait(RELEASE_DEBOUNCE_MS); // handed over: dismisses Help
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // that question again
  }); // end of the case

  it('cancels at the key-down in the Saying window, before the key comes up', () => { // early cancel
    select(2); // "Coffee with milk": Saying
    time += 500; // half a second into the window
    input.keyDown(ENTER); // the key goes down
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // cancelled at once
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // its scan restarted from the key-down
    const asking = conversation.snapshot(); // the restarted scan
    wait(120); // a short press
    input.keyUp(ENTER); // up
    wait(RELEASE_DEBOUNCE_MS); // stayed up: the same press, handed over again, is debounced away
    expect(conversation.snapshot()).toBe(asking); // nothing more happened
    expect(conversation.engine.scanAt(time).items).toHaveLength(10); // and no rescan started
    jest.advanceTimersByTime(SAY_MS); // past the cancelled window's end
    expect(said).toEqual([]); // nothing posted
  }); // end of the case

  it('cancels at once when the key goes down again just after the press was handed over', () => { // a bounce after the commit
    time = nextOnset(conversation.engine, CONFIG, 0, time) + AIM_MS + CONFIG.biasMs; // aimed at "Coffee, please"
    input.keyDown(ENTER); // the committing press goes down
    wait(100); // a short press
    input.keyUp(ENTER); // up
    expect(conversation.snapshot().mode).toBe('asking'); // not handed over yet: a key-down now would continue it
    wait(RELEASE_DEBOUNCE_MS); // stayed up: handed over, committed with one press
    expect(conversation.snapshot().mode).toBe('saying'); // Saying
    wait(20); // 20 ms later
    input.keyDown(ENTER); // a contact bounce: a new press, so a key-down notice
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // cancelled at once
    wait(20); // a short bounce
    input.keyUp(ENTER); // it ends
    wait(SAY_MS); // past the cancelled window's end; the bounce was handed over as the same press as the cancel, and debounced away
    expect(said).toEqual([]); // not posted
    expect(conversation.snapshot().mode).toBe('asking'); // still Asking
  }); // end of the case

  it("cancels when a switch key is still down at the window's end", () => { // held at the end, the input's other guard
    let held = false; // the screen's switch state, set by hand here
    conversation.dispose(); // the set-up's conversation is not used
    conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), (r) => { said.push(r); }, sendHelp, () => held); // under test
    select(0); // "Coffee, please": Saying
    held = true; // a switch key is down without a key-down notice in the window
    jest.advanceTimersByTime(SAY_MS); // the window's end
    expect(said).toEqual([]); // not posted
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the same question again
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

  it('scans a server question with fewer than eight replies, then Something else and Help right after them', () => { // a question asked with options
    const options = { id: 'q1', speaker: 'Alex', text: 'Would you like tea or coffee?', replies: ['Tea', 'Coffee', 'Not now', 'Not sure'], scores: [0.366, 0.366, 0.146, 0.122] }; // four replies
    conversation.receive(options); // question.created
    conversation.update('q1', options.replies, options.scores); // question.candidates, sent at once: the scan starts
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: options, reply: null }); // Asking
    expect(conversation.engine.scanAt(time).items).toEqual([0, 1, 2, 3, 4, 5]); // four replies, then the two controls
    select(4); // the option right after the replies
    expect(selections.map((s) => s.label)).toEqual(['Something else']); // a control, not a missing reply
    conversation.press((time += 500)); // cancelled in its window
    select(0); // "Tea"
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(said).toEqual([expect.objectContaining({ questionId: 'q1', text: 'Tea' })]); // posted
  }); // end of the case

  it("keeps the grid's size while a server question waits: its defaults, then empty slots up to eight, filled in place by the model's replies", () => { // no jump in the grid
    const open = { id: 'q1', speaker: 'Alex', text: 'What shall we watch tonight?', replies: ['You decide', 'Not sure', 'Tell me more', 'Not now'], scores: [0.278, 0.333, 0.222, 0.167], slots: REPLY_COUNT }; // question.created: four defaults, as the server sends them
    conversation.receive(open); // shown, waiting
    expect(conversation.snapshot().mode).toBe('waiting'); // nothing lit yet
    expect(cardsOf(conversation.snapshot().question)).toEqual(['You decide', 'Not sure', 'Tell me more', 'Not now', null, null, null, null]); // eight cards, four of them empty
    time = 1000; // the model's replies, inside the budget
    conversation.update('q1', LIVE.replies, LIVE.scores!); // question.candidates: eight replies
    expect(conversation.snapshot().mode).toBe('asking'); // the scan starts
    expect(cardsOf(conversation.snapshot().question)).toEqual(LIVE.replies); // the same eight cards, filled
    expect(conversation.engine.scanAt(time).items).toHaveLength(REPLY_COUNT + 2); // the empty slots were never options
  }); // end of the case

  it("keeps eight slots when the model's final list is shorter, shown or queued", () => { // the model gave too few usable replies
    const open = { id: 'q1', speaker: 'Alex', text: 'What shall we watch tonight?', replies: ['You decide', 'Not sure', 'Tell me more', 'Not now'], scores: [0.278, 0.333, 0.222, 0.167], slots: REPLY_COUNT }; // question.created: four defaults, as the server sends them
    const six = { replies: LIVE.replies.slice(0, 6), scores: LIVE.scores!.slice(0, 6) }; // question.candidates: six replies
    conversation.receive(open); // shown, waiting
    conversation.update('q1', six.replies, six.scores); // the final list
    expect(cardsOf(conversation.snapshot().question)).toEqual([...six.replies, null, null]); // still eight cards
    expect(conversation.engine.scanAt(time).items).toHaveLength(6 + 2); // six replies, then the two controls
    select(0); // a reply: "Saying it" for 2 s
    conversation.receive({ ...open, id: 'q2' }); // queued until the window ends
    conversation.update('q2', six.replies, six.scores); // its final list, while queued
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed: q2 is shown and scanned at once
    expect(cardsOf(conversation.snapshot().question)).toEqual([...six.replies, null, null]); // eight cards here too
  }); // end of the case

  it("keeps the empty slots, unlit and unscanned, when the budget ends on the defaults; a question with options keeps its own size", () => { // no jump either way
    conversation.receive({ id: 'q1', speaker: 'Alex', text: 'What shall we watch tonight?', replies: ['You decide', 'Not sure'], scores: [0.45, 0.55], slots: REPLY_COUNT }); // two replies, eight slots
    time = BUDGET_MS; // the budget's end, with no model replies
    jest.advanceTimersByTime(BUDGET_MS); // passed
    expect(cardsOf(conversation.snapshot().question)).toEqual(['You decide', 'Not sure', null, null, null, null, null, null]); // the grid stays as it was
    expect(conversation.engine.scanAt(time).items).toEqual([0, 1, 2, 3]); // two replies, then Something else and Help
    const options = { id: 'q2', speaker: 'Alex', text: 'Would you like tea or coffee?', replies: ['Tea', 'Coffee', 'Not now', 'Not sure'], scores: [0.37, 0.37, 0.14, 0.12], slots: 4 }; // question.created of a question asked with options
    conversation.receive(options); // shown
    expect(cardsOf(conversation.snapshot().question)).toEqual(options.replies); // four cards, no empty slot
    conversation.update('q2', options.replies, options.scores); // question.candidates, at once
    expect(cardsOf(conversation.snapshot().question)).toEqual(options.replies); // still four
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
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: LIVE, reply: null, help: 'sending' }); // kept for later
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
    conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), (r) => { said.push(r); }, sendHelp, () => input.held()); // fresh
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
    conversation.press(down); // handed over once the key has stayed up
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // nothing happened
    expect(conversation.engine.scanAt(time).items).toHaveLength(10); // no rescan started
  }); // end of the case
}); // end of the server cases

/** Replaces the conversation with one built with a server, as the screen makes it: it starts connected. */
function connected(): void { // a build with a server
  conversation.dispose(); // the one from the set-up, built without
  conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), (r) => { said.push(r); }, sendHelp, () => input.held(), true); // online
} // end of connected

/** Answers LIVE with "Coffee, please" and lets the reply stand through its window. */
function answerLive(): void { // a server question, answered
  conversation.receive(LIVE); // shown, waiting
  conversation.update('q1', LIVE.replies, LIVE.scores!); // its replies: the scan starts
  select(1); // "Coffee, please"
  time += SAY_MS; // the window's end
  jest.advanceTimersByTime(SAY_MS); // passed: the reply stands
} // end of answerLive

describe('Conversation online and offline', () => { // the idle screen while connected; practice only while the server cannot be reached
  it('starts on the idle screen when built with a server, with no reply yet', () => { // no practice question flashes up
    connected(); // a build with a server
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null }); // idle
  }); // end of the case

  it("shows the idle screen with the reply once a server question's reply stands", () => { // between caregiver questions
    connected(); // a build with a server
    answerLive(); // "Coffee, please" stands
    expect(said).toEqual([expect.objectContaining({ questionId: 'q1', text: 'Coffee, please' })]); // handed over
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: LIVE, reply: 'Coffee, please' }); // idle, with the last reply
  }); // end of the case

  it('never shows a practice reply as the last reply', () => { // practice replies cannot reach the server
    select(1); // "Tea, please" on the first fixture
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed: the next fixture
    conversation.setOnline(true); // the server can be reached
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[1], reply: null }); // idle, no reply
  }); // end of the case

  it('opens Help on a hold while idle, and a press dismisses it back to the idle screen', () => { // Help from idle
    connected(); // a build with a server
    answerLive(); // idle, with a reply
    const idle = conversation.snapshot(); // the idle screen
    conversation.help((time += 1000)); // a hold
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: LIVE, reply: null, help: 'sending' }); // Help
    conversation.press((time += 3000)); // dismissed
    expect(conversation.snapshot()).toEqual(idle); // idle again, with the reply
  }); // end of the case

  it('shows "Hold the button for help." for 3 s on a press while idle, keeping the reply; a second press starts the 3 s again', () => { // no Help, so no alert
    connected(); // a build with a server
    answerLive(); // idle, with a reply
    const idle = conversation.snapshot(); // the idle screen
    conversation.press((time += 1000)); // a short press
    expect(conversation.snapshot()).toEqual({ ...idle, hint: true }); // the same idle screen, with the hint
    expect(IDLE_HINT).toBe('Hold the button for help.'); // what the screen shows then
    expect(IDLE_HINT_MS).toBe(3000); // for a few seconds
    time += 1000; // 1 s later
    jest.advanceTimersByTime(1000); // the hint still shows
    conversation.press(time); // a second press
    time += IDLE_HINT_MS - 1; // 1 ms before its 3 s end, 4 s after the first press
    jest.advanceTimersByTime(IDLE_HINT_MS - 1); // passed
    expect(conversation.snapshot()).toEqual({ ...idle, hint: true }); // still shown
    time += 1; // its 3 s are over
    jest.advanceTimersByTime(1); // passed
    expect(conversation.snapshot()).toEqual(idle); // the idle screen as it was
    expect(helps).toEqual([]); // no help request at any point
    expect(selections).toHaveLength(1); // and nothing logged for K2 beyond the answer
  }); // end of the case

  it("shows a server question that arrives while the hint shows at once, and the hint's end changes nothing", () => { // the hint never holds a question back
    connected(); // a build with a server
    conversation.press((time = 1000)); // the hint
    conversation.receive(LIVE); // a question
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: LIVE, reply: null }); // shown at once, without the hint
    conversation.update('q1', LIVE.replies, LIVE.scores!); // its replies: the scan starts
    const asking = conversation.snapshot(); // scanning
    time += IDLE_HINT_MS; // past the hint's end
    jest.advanceTimersByTime(IDLE_HINT_MS); // passed
    expect(conversation.snapshot()).toBe(asking); // still scanning
  }); // end of the case

  it('shows a server question asked during Help, opened while idle, first when Help is dismissed', () => { // queued over idle
    connected(); // a build with a server
    conversation.help((time = 1000)); // a hold: Help from the idle screen
    conversation.receive(LIVE); // queued
    expect(conversation.snapshot().mode).toBe('help'); // Help stays
    conversation.press((time += 1000)); // dismissed 1 s into its budget
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: LIVE, reply: null }); // the question, waiting
  }); // end of the case

  it("shows a server question received while idle at once, and starts its scan on the model's replies", () => { // idle -> waiting -> asking
    connected(); // a build with a server
    expect(conversation.snapshot().mode).toBe('idle'); // idle
    time = 700; // a while later
    conversation.receive({ ...LIVE, ...DEFAULTS }); // question.created with the defaults
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: { ...LIVE, ...DEFAULTS }, reply: null }); // shown, nothing lit
    time = 1900; // inside the budget
    conversation.update('q1', LIVE.replies, LIVE.scores!); // question.candidates
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: LIVE, reply: null }); // the model's replies
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // the highlight starts now
  }); // end of the case

  it('asks the next fixture when the connection drops while idle; the first one if none was shown yet', () => { // practice resumes
    conversation.setOnline(true); // the first fixture gives way to the idle screen
    time = 1000; // later
    conversation.setOnline(false); // the connection drops
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[1], reply: null }); // the next fixture
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // scanned from now
    connected(); // a build with a server, idle from the start
    conversation.setOnline(false); // its first attempt fails
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // practice from the first
  }); // end of the case

  it('asks the next fixture when Help, opened while idle, is dismissed after the connection dropped', () => { // no idle screen offline
    connected(); // a build with a server
    conversation.help((time = 1000)); // a hold: Help from the idle screen
    conversation.setOnline(false); // the connection drops
    expect(conversation.snapshot().mode).toBe('help'); // Help stays
    conversation.press((time += 1000)); // dismissed
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // practice
  }); // end of the case

  it('goes idle at once when the connection comes while a practice question is asked', () => { // practice ends
    time = 700; // mid-scan of the first fixture
    conversation.setOnline(true); // connected
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null }); // idle
  }); // end of the case

  it("lets a practice reply in its window stand when the connection comes, then goes idle", () => { // practice ends after the window
    select(0); // "Coffee, please": Saying
    const saying = conversation.snapshot(); // the window
    conversation.setOnline(true); // connected
    expect(conversation.snapshot()).toBe(saying); // nothing changes now
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(said).toEqual([expect.objectContaining({ questionId: null, text: 'Coffee, please' })]); // still handed over
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null }); // idle, no reply
  }); // end of the case

  it('goes idle on a cancel of a practice reply after the connection came, and hands over nothing', () => { // no practice once online
    select(0); // "Coffee, please": Saying
    conversation.setOnline(true); // connected
    conversation.press((time += 500)); // cancelled in the window
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null }); // idle, not the practice question
    jest.advanceTimersByTime(SAY_MS); // past the cancelled window's end
    expect(said).toEqual([]); // nothing handed over
  }); // end of the case

  it('shows a server question queued during practice when the connection comes back, not the idle screen', () => { // queued over practice
    select(0); // "Coffee, please" on the first fixture: Saying
    conversation.setOnline(true); // connected: nothing changes in the window
    conversation.receive(LIVE); // queued until the window ends
    conversation.setOnline(false); // the connection drops
    conversation.press((time += 500)); // cancelled in the window
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the practice question again, offline
    conversation.setOnline(true); // the connection comes back
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: LIVE, reply: null }); // the queued question, within its budget
  }); // end of the case

  it('keeps Help open when the connection comes, and goes idle when it is dismissed', () => { // Help over practice
    conversation.help((time = 700)); // a hold: Help over the first fixture
    const help = conversation.snapshot(); // Help
    conversation.setOnline(true); // connected
    expect(conversation.snapshot()).toBe(help); // nothing changes now
    conversation.press((time += 1000)); // dismissed
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null }); // idle
  }); // end of the case

  it('never interrupts a server question on screen; after it, practice when offline, and the reply on the idle screen later', () => { // server question kept
    connected(); // a build with a server
    conversation.receive(LIVE); // shown, waiting
    const waiting = conversation.snapshot(); // nothing lit
    conversation.setOnline(false); // the connection drops
    conversation.setOnline(true); // and comes back
    expect(conversation.snapshot()).toBe(waiting); // still waiting
    conversation.update('q1', LIVE.replies, LIVE.scores!); // its replies: the scan starts
    const asking = conversation.snapshot(); // scanning
    conversation.setOnline(false); // the connection drops while scanning
    conversation.setOnline(true); // and comes back
    expect(conversation.snapshot()).toBe(asking); // never interrupted
    conversation.setOnline(false); // the connection drops again
    expect(conversation.snapshot()).toBe(asking); // still scanning: it can still be answered
    select(1); // "Coffee, please"
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(said).toEqual([expect.objectContaining({ questionId: 'q1', text: 'Coffee, please' })]); // handed over
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // practice
    conversation.setOnline(true); // the connection comes back
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: 'Coffee, please' }); // idle, with the reply
  }); // end of the case

  it('changes nothing when told the connection state it already has', () => { // no re-render, no new snapshot
    const listener = jest.fn(); // the screen's re-render callback
    conversation.subscribe(listener); // subscribed
    const asking = conversation.snapshot(); // the first fixture
    conversation.setOnline(false); // offline already
    expect(conversation.snapshot()).toBe(asking); // the same snapshot
    connected(); // a build with a server
    conversation.subscribe(listener); // subscribed
    const idle = conversation.snapshot(); // the idle screen
    conversation.setOnline(true); // online already
    expect(conversation.snapshot()).toBe(idle); // the same snapshot
    expect(listener).not.toHaveBeenCalled(); // and no re-render
  }); // end of the case
}); // end of the online and offline cases

/** Holds the switch as the emulator turns a held PC key into input (K3, test-results/k3): press/release pairs about 46 ms apart. */
function chatter(pairs = 57): void { // 57 pairs, 2.6 s in all, as captured
  for (let pair = 0; pair < pairs; pair++) { // one pair each
    input.keyDown(ENTER); // down
    wait(45); // for about 45 ms
    input.keyUp(ENTER); // up
    wait(1); // for under a millisecond in the capture, here 1 ms
  } // end of the pairs
} // end of chatter

describe('Help requests', () => { // B8: Help sends one help request, and the screen says what really happened
  it('sends one help request on a 2 s hold, shows "Asking for help…", then "Help request sent." once the server confirms', async () => { // a hold, and success
    input.keyDown(ENTER); // the hold starts at 0
    wait(HOLD_MS - 1); // 1999 ms
    expect(helps).toHaveLength(0); // nothing yet
    wait(1); // 2 s held
    expect(helps).toHaveLength(1); // one request, while the key is still down
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'sending' }); // while it is sent
    expect(HELP_TEXT.sending).toBe('Asking for help…'); // what the screen shows then
    wait(1000); // held on
    input.keyUp(ENTER); // released
    wait(RELEASE_DEBOUNCE_MS); // the hold's final release does nothing
    expect(helps).toHaveLength(1); // still one request
    helps[0]!.resolve(); // the server confirms it
    await Promise.resolve(); // its answer is handled
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'sent' }); // the same Help screen
    expect(HELP_TEXT.sent).toBe('Help request sent.'); // what the screen shows now
  }); // end of the case

  it('shows "Couldn\'t send the help request." when the request fails, as in offline practice', async () => { // failure
    conversation.help((time = 700)); // a hold, handed over at 2 s
    helps[0]!.reject(new Error('Network request failed')); // the server cannot be reached
    await Promise.resolve(); // the failure is handled
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'failed' }); // still Help
    expect(HELP_TEXT.failed).toBe("Couldn't send the help request."); // what the screen shows
  }); // end of the case

  it('takes the K3 key chatter as one hold: Help at 2 s and one request, and its releases close nothing', () => { // the emulator's held key
    chatter(); // from 0 to about 2.6 s
    expect(helps).toHaveLength(1); // one request
    expect(conversation.snapshot().mode).toBe('help'); // Help stays open after the chatter
    wait(RELEASE_DEBOUNCE_MS); // the final release, then nothing
    expect(helps).toHaveLength(1); // still one
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'sending' }); // and still Help
  }); // end of the case

  it('opens Help at 2 s under the K3 chatter, while the keys are still coming', () => { // not at the end of the hold
    chatter(43); // 1978 ms of chatter
    expect(helps).toHaveLength(0); // not yet
    expect(conversation.snapshot().mode).toBe('asking'); // still scanning
    chatter(1); // to 2024 ms: the 2 s mark fell in this pair, with the key down
    expect(helps).toHaveLength(1); // the request went at 2 s
    expect(conversation.snapshot().mode).toBe('help'); // Help is open
  }); // end of the case

  it('sends nothing more on a second hold while Help is open', () => { // Help already open
    conversation.help((time = 700)); // Help, its request sent
    input.keyDown(ENTER); // a new hold
    wait(HOLD_MS); // 2 s held: handed over again
    expect(helps).toHaveLength(1); // still the one request
    expect(conversation.snapshot()).toMatchObject({ mode: 'help', help: 'sending' }); // the same Help screen
  }); // end of the case

  it('sends one help request when Help is chosen in the scan', () => { // the Help card
    select(HELP); // committed
    expect(helps).toHaveLength(1); // one request
    expect(conversation.snapshot()).toMatchObject({ mode: 'help', help: 'sending' }); // Help, sending
  }); // end of the case

  it('sends nothing on a short press on the idle screen, which shows the hint for 3 s instead', () => { // one accidental press alerts nobody
    connected(); // a build with a server: idle
    input.keyDown(ENTER); // a short press of the switch
    wait(100); // for 100 ms
    input.keyUp(ENTER); // released
    wait(RELEASE_DEBOUNCE_MS); // stayed up: handed over
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null, hint: true }); // the hint
    wait(IDLE_HINT_MS); // its 3 s
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null }); // the idle screen as it was
    expect(helps).toEqual([]); // no help request
  }); // end of the case

  it('sends one help request on a 2 s hold on the idle screen, and its release sends nothing more', () => { // the hold still asks
    connected(); // a build with a server: idle
    input.keyDown(ENTER); // the hold starts
    wait(HOLD_MS - 1); // 1999 ms
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null }); // nothing yet, no hint either
    wait(1); // 2 s held
    expect(helps).toHaveLength(1); // one request, while the key is still down
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'sending' }); // Help
    input.keyUp(ENTER); // released
    wait(RELEASE_DEBOUNCE_MS); // the hold's final release does nothing
    expect(helps).toHaveLength(1); // still one
    expect(conversation.snapshot().mode).toBe('help'); // and still Help
  }); // end of the case

  it('takes the K3 key chatter on the idle screen as one hold: one request, Help at 2 s, and no hint', () => { // the emulator's held key, between questions
    connected(); // a build with a server: idle
    chatter(43); // 1978 ms of chatter
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null }); // no press handed over, so no hint
    chatter(1); // to 2024 ms: the 2 s mark fell in this pair, with the key down
    expect(helps).toHaveLength(1); // the request went at 2 s
    chatter(13); // the rest of the 57 pairs
    wait(RELEASE_DEBOUNCE_MS); // the final release, then nothing
    expect(helps).toHaveLength(1); // one request
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'sending' }); // Help, without the hint
  }); // end of the case

  it('opens Help without the hint on a 2 s hold while the hint shows, with one request', () => { // a press, then the hold it hinted at
    connected(); // a build with a server: idle
    input.keyDown(ENTER); // a short press
    wait(100); // for 100 ms
    input.keyUp(ENTER); // released
    wait(RELEASE_DEBOUNCE_MS + 500); // handed over
    expect(conversation.snapshot()).toEqual({ mode: 'idle', question: QUESTIONS[0], reply: null, hint: true }); // the hint shows
    input.keyDown(ENTER); // the hold starts
    wait(HOLD_MS); // 2 s held
    expect(helps).toHaveLength(1); // one request
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: QUESTIONS[0], reply: null, help: 'sending' }); // Help, without the hint
    wait(IDLE_HINT_MS); // past the hint's end
    expect(conversation.snapshot().mode).toBe('help'); // still Help
  }); // end of the case

  it('closes Help on a short press whatever its request did, and an answer that comes later changes nothing', async () => { // a press still closes Help
    conversation.help((time = 700)); // Help, request 1
    conversation.press((time += 1000)); // a short press closes it
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // the question again, nothing about help
    helps[0]!.resolve(); // request 1 is confirmed after all
    await Promise.resolve(); // handled
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // still asking
  }); // end of the case

  it('sends a new request each time Help opens, and shows only the latest one\'s answer', async () => { // one per opening
    conversation.help((time = 700)); // Help, request 1
    conversation.press((time += 1000)); // closed
    conversation.help((time += 1000)); // Help again, request 2
    expect(helps).toHaveLength(2); // one per opening
    helps[0]!.reject(new Error('timeout')); // request 1 fails late
    await Promise.resolve(); // handled
    expect(conversation.snapshot()).toMatchObject({ mode: 'help', help: 'sending' }); // this Help screen is about request 2
    helps[1]!.resolve(); // request 2 is confirmed
    await Promise.resolve(); // handled
    expect(conversation.snapshot()).toMatchObject({ mode: 'help', help: 'sent' }); // its answer
  }); // end of the case
}); // end of the Help requests

describe('Announcements', () => { // B9: a server question is read aloud, and its scan waits for that and for its replies
  let played: { path: string; end: () => void; stopped: boolean }[] = []; // what the hook was asked to play, oldest first
  const announce: Announce = (path, onEnd) => { const a = { path, end: onEnd, stopped: false }; played.push(a); return () => { a.stopped = true; }; }; // a fake player: the test ends it
  const ANNOUNCED: Question = { ...LIVE, ...DEFAULTS, announcement: '/v1/questions/q1/announcement' }; // question.created: the defaults, and its announcement
  const READY: Question = { ...ANNOUNCED, replies: LIVE.replies, scores: LIVE.scores }; // after question.candidates: the model's replies
  const OPTIONS: Question = { id: 'q2', speaker: 'Alex', text: 'Would you like tea or coffee?', replies: ['Tea', 'Coffee', 'Not now', 'Not sure'], scores: [0.37, 0.37, 0.14, 0.12], slots: 4, announcement: '/v1/questions/q2/announcement' }; // asked with options

  /** Shows OPTIONS with its final replies, as the server sends them at once: only its announcement holds the scan back. */
  const askOptions = () => { conversation.receive(OPTIONS); conversation.update('q2', OPTIONS.replies, OPTIONS.scores!); }; // question.created, then question.candidates

  /** A short press of the switch, handed over once the key has stayed up. */
  const press = () => { input.keyDown(ENTER); wait(80); input.keyUp(ENTER); wait(RELEASE_DEBOUNCE_MS); }; // 80 ms down

  beforeEach(() => { // a TV built with a server and an audio player, connected: idle
    played = []; // nothing played yet
    conversation.dispose(); // the one from the set-up, built without
    conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), (r) => { said.push(r); }, sendHelp, () => input.held(), true, announce); // under test
  }); // end of set-up

  it('plays the announcement when a question is shown, and starts the scan only once it has finished and the replies are ready', () => { // replies first
    time = 100; // the question arrives
    conversation.receive(ANNOUNCED); // question.created
    expect(played.map((a) => a.path)).toEqual(['/v1/questions/q1/announcement']); // playing
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: ANNOUNCED, reply: null }); // shown, nothing lit
    time = 1100; // the model's replies, while it plays
    conversation.update('q1', LIVE.replies, LIVE.scores!); // question.candidates
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: READY, reply: null }); // shown, still nothing lit
    time = 2600; // it has finished
    played[0]!.end(); // the player says so
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: READY, reply: null }); // the scan starts
    expect(conversation.engine.scanAt(time).epoch).toBe(2600); // now, on the final list
  }); // end of the case

  it('waits for the replies when the announcement finishes first, then scans at once', () => { // announcement first
    conversation.receive(ANNOUNCED); // at 0
    time = 800; // finished before the model's replies came
    played[0]!.end(); // the player says so
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: ANNOUNCED, reply: null }); // still waiting
    time = 1500; // the model's replies
    conversation.update('q1', LIVE.replies, LIVE.scores!); // question.candidates
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: READY, reply: null }); // the scan starts
    expect(conversation.engine.scanAt(time).epoch).toBe(1500); // with them
  }); // end of the case

  it('scans the defaults once the announcement ends after the budget passed without the replies, and ignores replies after that', () => { // a long announcement
    conversation.receive(ANNOUNCED); // at 0
    time = BUDGET_MS; // the budget ends while it plays
    jest.advanceTimersByTime(BUDGET_MS); // passed
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: ANNOUNCED, reply: null }); // the announcement goes on
    time = BUDGET_MS + 1000; // it ends
    played[0]!.end(); // the player says so
    const asking = conversation.snapshot(); // the scan
    expect(asking).toEqual({ mode: 'asking', question: ANNOUNCED, reply: null }); // on the defaults
    expect(conversation.engine.scanAt(time).epoch).toBe(BUDGET_MS + 1000); // from the end of the announcement
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the model's replies, too late
    expect(conversation.snapshot()).toBe(asking); // the list stays as it is
  }); // end of the case

  it('stops the announcement on a press and starts the scan at once, without selecting anything', () => { // skip
    askOptions(); // at 0: replies final, announcement playing
    expect(conversation.snapshot().mode).toBe('waiting'); // nothing lit while it plays
    press(); // a short press during the announcement
    expect(played[0]!.stopped).toBe(true); // stopped
    const asking = conversation.snapshot(); // the scan
    expect(asking).toEqual({ mode: 'asking', question: OPTIONS, reply: null }); // started
    expect(conversation.engine.scanAt(time)).toEqual({ items: [0, 1, 2, 3, 4, 5], epoch: time, end: Infinity }); // a full scan from now: the press chose nothing
    expect([selections, said]).toEqual([[], []]); // nothing selected, nothing said
    played[0]!.end(); // a late end from the stopped player
    expect(conversation.snapshot()).toBe(asking); // changes nothing
    expect(select(0)).toBe(1); // the next aimed press answers Tea
    expect(selections.map((s) => s.label)).toEqual(['Tea']); // as usual
  }); // end of the case

  it('ignores a press whose key went down before the announcement started', () => { // a tap begun on the idle screen
    time = 100; // the question arrives
    conversation.receive(ANNOUNCED); // its announcement starts
    conversation.press(50); // a press whose key went down at 50, handed over now
    expect(played[0]!.stopped).toBe(false); // still playing
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: ANNOUNCED, reply: null }); // nothing changed
  }); // end of the case

  it('starts the scan at once on a press whose key went down during the announcement, though it ended before the press was handed over', () => { // a short tone
    conversation.receive(ANNOUNCED); // at 0, the replies not final yet
    time = 250; // the announcement ends
    played[0]!.end(); // the player says so
    expect(conversation.snapshot().mode).toBe('waiting'); // waiting for the replies
    time = 330; // a press whose key went down at 100 is handed over
    conversation.press(100); // pressed during the announcement
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: ANNOUNCED, reply: null }); // the scan starts at once, on the defaults
    expect([selections, said]).toEqual([[], []]); // nothing chosen
  }); // end of the case

  it("starts the scan at once on the defaults on a press during the announcement, before the model's replies", () => { // skip before the replies
    conversation.receive(ANNOUNCED); // at 0, waiting for the replies too
    press(); // a short press during the announcement
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: ANNOUNCED, reply: null }); // the scan on the defaults
    const asking = conversation.snapshot(); // the scan
    conversation.update('q1', LIVE.replies, LIVE.scores!); // the model's replies, after the scan started
    expect(conversation.snapshot()).toBe(asking); // ignored, as for any running scan
  }); // end of the case

  it('opens Help on a 2 s hold during the announcement, stops it and sends one help request; a press then starts the scan, without announcing again', () => { // Help at any time
    askOptions(); // at 0: announcement playing
    input.keyDown(ENTER); // the hold starts
    wait(HOLD_MS); // 2 s held
    expect(helps).toHaveLength(1); // one request
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: OPTIONS, reply: null, help: 'sending' }); // Help
    expect(played[0]!.stopped).toBe(true); // the announcement stopped
    wait(500); // held on
    input.keyUp(ENTER); // released
    wait(RELEASE_DEBOUNCE_MS); // the hold's final release does nothing
    expect([helps.length, conversation.snapshot().mode]).toEqual([1, 'help']); // still one request, still Help
    conversation.press((time += 1000)); // a press dismisses it
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: OPTIONS, reply: null }); // the scan starts
    expect(played).toHaveLength(1); // not announced again
  }); // end of the case

  it('takes the K3 key chatter during the announcement as one hold: Help at 2 s and one request', () => { // the emulator's held key
    askOptions(); // at 0: announcement playing
    chatter(); // 57 press/release pairs about 46 ms apart
    wait(RELEASE_DEBOUNCE_MS); // the final release, then nothing
    expect(helps).toHaveLength(1); // one request
    expect(conversation.snapshot()).toEqual({ mode: 'help', question: OPTIONS, reply: null, help: 'sending' }); // Help, not a skipped announcement
    expect(played[0]!.stopped).toBe(true); // stopped
  }); // end of the case

  it('does not hold the scan back when the announcement cannot be played', () => { // a failed announcement
    askOptions(); // at 0: replies final
    time = 40; // the player gives up
    played[0]!.end(); // can't be played
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: OPTIONS, reply: null }); // the scan starts as soon as that is known
    expect(conversation.engine.scanAt(time).epoch).toBe(40); // now
    conversation.receive({ ...ANNOUNCED, id: 'q3', announcement: '/v1/questions/q3/announcement' }); // the next question, at 40
    time = 140; // its announcement fails too
    played[1]!.end(); // can't be played
    expect(conversation.snapshot().mode).toBe('waiting'); // waiting for its replies, as without an announcement
    time = 40 + BUDGET_MS; // the budget ends without them
    jest.advanceTimersByTime(BUDGET_MS); // passed
    expect(conversation.snapshot().mode).toBe('asking'); // the scan starts on the defaults
    expect(conversation.engine.scanAt(time).epoch).toBe(40 + BUDGET_MS); // exactly when it would without an announcement
  }); // end of the case

  it('scans as before in a build that cannot play announcements', () => { // no player
    connected(); // a build with a server, without an announcement hook
    askOptions(); // at 0: replies final
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: OPTIONS, reply: null }); // the scan starts at once
    expect(played).toEqual([]); // nothing to play it with
  }); // end of the case

  it('never announces a practice question offline', () => { // fixtures have no announcement
    conversation.dispose(); // the online one
    conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), (r) => { said.push(r); }, sendHelp, () => input.held(), false, announce); // offline: practice
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[0], reply: null }); // practice, scanning at once
    select(SOMETHING_ELSE); // the next practice question
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: QUESTIONS[1], reply: null }); // scanning at once
    expect(played).toEqual([]); // nothing announced
  }); // end of the case

  it("stops the announcement when a newer question replaces it, and plays the newer one's", () => { // two questions in a row
    conversation.receive(ANNOUNCED); // q1 at 0
    time = 500; // q2 replaces it
    conversation.receive(OPTIONS); // question.created
    expect([played.map((a) => a.path), played.map((a) => a.stopped)]).toEqual([['/v1/questions/q1/announcement', '/v1/questions/q2/announcement'], [true, false]]); // q1's stopped, q2's playing
    played[0]!.end(); // a late end of q1's
    conversation.update('q2', OPTIONS.replies, OPTIONS.scores!); // q2's final replies
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: OPTIONS, reply: null }); // still waiting for q2's own announcement
    played[1]!.end(); // q2's ends
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: OPTIONS, reply: null }); // now the scan starts
  }); // end of the case

  it('scans once the announcement has ended, when the budget timer fires a little before the clock reads its end', () => { // timers and the clock may disagree by a fraction of a millisecond
    conversation.receive(ANNOUNCED); // at 0
    time = 800; // the announcement ends; no replies yet
    played[0]!.end(); // the player says so
    time = BUDGET_MS - 1; // the clock still reads just inside the budget
    jest.advanceTimersByTime(BUDGET_MS); // but the budget timer fires
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: ANNOUNCED, reply: null }); // the scan starts on the defaults, not stuck waiting
  }); // end of the case

  it('waits for the announcement of a queued question whose replies are already final', () => { // a question asked with options during "Saying it"
    conversation.receive(ANNOUNCED); // q1 at 0
    played[0]!.end(); // announced
    conversation.update('q1', LIVE.replies, LIVE.scores!); // its replies: the scan starts
    select(0); // "Tea, please": Saying
    askOptions(); // q2 and its final replies arrive during the window: queued
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed: q2 is shown
    expect(played.map((a) => a.path)).toEqual(['/v1/questions/q1/announcement', '/v1/questions/q2/announcement']); // its announcement plays
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: OPTIONS, reply: null }); // nothing lit while it plays, though its replies are final
    time += 300; // it ends
    played[1]!.end(); // the player says so
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: OPTIONS, reply: null }); // the scan starts
    expect(conversation.engine.scanAt(time).epoch).toBe(time); // now
  }); // end of the case

  it('plays the announcement of a question that arrived during "Saying it" when it is shown', () => { // queued
    askOptions(); // at 0
    played[0]!.end(); // announced: the scan starts
    select(0); // "Tea": Saying
    conversation.receive(ANNOUNCED); // q1 arrives during the window
    expect(played).toHaveLength(1); // not yet: the reply keeps the screen
    time += SAY_MS; // the window's end
    jest.advanceTimersByTime(SAY_MS); // passed
    expect(played.map((a) => a.path)).toEqual(['/v1/questions/q2/announcement', '/v1/questions/q1/announcement']); // now
    expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: ANNOUNCED, reply: null }); // shown, waiting for it
  }); // end of the case

  it('announces a question once: not for its replay after a reconnect, nor when its scan restarts after a cancel', () => { // once per question
    askOptions(); // at 0
    played[0]!.end(); // announced: the scan starts
    conversation.receive(OPTIONS); // the replay after a reconnect
    select(0); // "Tea": Saying
    conversation.press((time += 500)); // cancelled: the same question again
    expect(conversation.snapshot()).toEqual({ mode: 'asking', question: OPTIONS, reply: null }); // scanned at once
    expect(played).toHaveLength(1); // announced once
  }); // end of the case

  it('stops the announcement when the screen goes away', () => { // unmount
    conversation.receive(ANNOUNCED); // playing
    conversation.dispose(); // the screen unmounts
    expect(played[0]!.stopped).toBe(true); // silent
  }); // end of the case

  describe("and Sam's own speech", () => { // B9.1: Amy never talks over Sam
    let speeches: { done: () => void; failed: () => void }[] = []; // each reply's speech, settled by the test, oldest first

    /** Rebuilds the conversation with a reply hook whose speech lasts until the test settles it, as the TV's does. */
    beforeEach(() => { // a TV that speaks its replies
      speeches = []; // none yet
      conversation.dispose(); // the one from the set-up above
      const speak = (r: Reply) => { said.push(r); return new Promise<void>((done, failed) => { speeches.push({ done, failed: () => failed(new Error('no audio')) }); }); }; // posted, then spoken until settled
      conversation = new Conversation(CONFIG, () => time, QUESTIONS, (s) => selections.push(s), speak, sendHelp, () => input.held(), true, announce); // under test
    }); // end of set-up

    /** Answers OPTIONS with "Tea": announced, scanned and chosen; leaves the reply in its "Saying it" window. */
    const chooseTea = () => { askOptions(); played[0]!.end(); select(0); }; // Saying

    /** Lets the promise callbacks run. */
    const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); }; // a few microtask turns

    it("announces a question that arrived in the reply's cancel window only once Sam's reply has been spoken", async () => { // queued
      chooseTea(); // "Tea": Saying
      conversation.receive(ANNOUNCED); // q1 arrives in the window: queued
      time += SAY_MS; // the window's end
      jest.advanceTimersByTime(SAY_MS); // passed: the reply is posted and spoken, and q1 is shown
      expect(said.map((r) => r.text)).toEqual(['Tea']); // handed over
      expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: ANNOUNCED, reply: null }); // q1 shown, nothing lit
      await settle(); // nothing more happens while Sam speaks
      expect(played).toHaveLength(1); // q1 not announced yet: only q2's, earlier
      speeches[0]!.done(); // Sam's reply has been spoken
      await settle(); // its end is handled
      expect(played.map((a) => a.path)).toEqual(['/v1/questions/q2/announcement', '/v1/questions/q1/announcement']); // now Amy speaks
      conversation.update('q1', LIVE.replies, LIVE.scores!); // q1's replies, while she speaks
      played[1]!.end(); // she has finished
      expect(conversation.snapshot().mode).toBe('asking'); // the scan starts
    }); // end of the case

    it('announces a question that arrives while the reply is being spoken once the speech has finished, or failed', async () => { // after the window
      chooseTea(); // "Tea": Saying
      time += SAY_MS; // the window's end
      jest.advanceTimersByTime(SAY_MS); // the reply stands: idle, Sam's speech on its way
      conversation.receive(ANNOUNCED); // q1 arrives while it is spoken
      await settle(); // nothing more happens
      expect([conversation.snapshot().mode, played.length]).toEqual(['waiting', 1]); // shown, not announced
      speeches[0]!.failed(); // the speech could not be played
      await settle(); // handled as its end
      expect(played.map((a) => a.path)).toEqual(['/v1/questions/q2/announcement', '/v1/questions/q1/announcement']); // announced now
    }); // end of the case

    it('announces at once after a cancel, since nothing is spoken', () => { // a cancelled reply never leaves the TV
      chooseTea(); // "Tea": Saying
      conversation.press((time += 500)); // cancelled: OPTIONS is scanned again
      conversation.receive(ANNOUNCED); // q1 arrives
      expect(said).toEqual([]); // nothing was posted or spoken
      expect(played.map((a) => a.path)).toEqual(['/v1/questions/q2/announcement', '/v1/questions/q1/announcement']); // announced at once
    }); // end of the case

    it("plays only the newer question's announcement when it replaced one waiting for Sam's speech", async () => { // the wait is part of the announcement
      chooseTea(); // "Tea": Saying
      time += SAY_MS; // the window's end
      jest.advanceTimersByTime(SAY_MS); // the reply stands; Sam's speech on its way
      conversation.receive(ANNOUNCED); // q1: waits for the speech
      conversation.receive({ ...ANNOUNCED, id: 'q3', announcement: '/v1/questions/q3/announcement' }); // q3 replaces it, and waits too
      speeches[0]!.done(); // the speech is over
      await settle(); // handled
      expect(played.map((a) => a.path)).toEqual(['/v1/questions/q2/announcement', '/v1/questions/q3/announcement']); // q3's alone
    }); // end of the case

    it("never plays an announcement that Help replaced while it waited for Sam's speech", async () => { // Help at any time
      chooseTea(); // "Tea": Saying
      time += SAY_MS; // the window's end
      jest.advanceTimersByTime(SAY_MS); // the reply stands; Sam's speech on its way
      conversation.receive(ANNOUNCED); // q1: waits for the speech
      conversation.help((time += 100)); // a 2 s hold: Help
      speeches[0]!.done(); // the speech is over
      await settle(); // handled
      expect(played).toHaveLength(1); // q1's announcement never played
      expect(helps).toHaveLength(1); // the one help request
    }); // end of the case

    it("keeps an announcement from playing on a press while it waits for Sam's speech, and selects nothing", async () => { // a press during the announcement, its wait included
      chooseTea(); // "Tea": Saying
      time += SAY_MS; // the window's end
      jest.advanceTimersByTime(SAY_MS); // the reply stands; Sam's speech on its way
      conversation.receive(ANNOUNCED); // q1: waits for the speech
      conversation.update('q1', LIVE.replies, LIVE.scores!); // its final replies
      conversation.press((time += 300)); // a press during the wait
      expect(conversation.snapshot().mode).toBe('asking'); // the scan starts
      expect([selections.length, said.length]).toEqual([1, 1]); // nothing more chosen or said than Tea
      speeches[0]!.done(); // the speech is over
      await settle(); // handled
      expect(played).toHaveLength(1); // q1's announcement never played
    }); // end of the case

    it("waits for the latest reply's speech even when an earlier reply's speech ends first", async () => { // two replies in a row
      chooseTea(); // "Tea": Saying
      time += SAY_MS; // the window's end
      jest.advanceTimersByTime(SAY_MS); // "Tea" stands: its speech on its way
      conversation.receive({ ...OPTIONS, id: 'q4', announcement: undefined }); // q4, with no announcement
      conversation.update('q4', OPTIONS.replies, OPTIONS.scores!); // and final replies: scanned at once
      select(1); // "Coffee": Saying
      time += SAY_MS; // the window's end
      jest.advanceTimersByTime(SAY_MS); // "Coffee" stands: its speech on its way
      speeches[0]!.done(); // "Tea"'s speech ends first
      await settle(); // handled
      conversation.receive(ANNOUNCED); // q1 arrives while "Coffee" is still spoken
      await settle(); // nothing more happens
      expect(played).toHaveLength(1); // q1 waits
      speeches[1]!.done(); // "Coffee" has been spoken
      await settle(); // handled
      expect(played.map((a) => a.path)).toEqual(['/v1/questions/q2/announcement', '/v1/questions/q1/announcement']); // now
    }); // end of the case

    it('shows and announces at once a question that arrived in the window when the reply is cancelled', () => { // right after a cancel
      chooseTea(); // "Tea": Saying
      conversation.receive(ANNOUNCED); // q1 arrives in the window: queued
      time += 500; // half a second into the window
      input.keyDown(ENTER); // a key-down cancels the reply
      expect(said).toEqual([]); // nothing posted or spoken
      expect(conversation.snapshot()).toEqual({ mode: 'waiting', question: ANNOUNCED, reply: null }); // q1 takes over, not q2 again
      expect(played.map((a) => a.path)).toEqual(['/v1/questions/q2/announcement', '/v1/questions/q1/announcement']); // announced at once
    }); // end of the case
  }); // end of Sam's own speech
}); // end of the announcements
