// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The conversation screen's state machine (plan §5.2) in scan mode: Waiting (while a server question's announcement
// plays and its replies are found), Asking, Saying (2 s to cancel), Help (with its help request), and Idle (where a
// short press only shows how to ask for help).

import { DEFAULT_SCAN_CONFIG, ScanEngine, type Option, type ScanConfig } from 'switchclock'; // the scan engine
import type { Question } from './questions'; // fixture shape

/** The control options, scanned after the replies. */
export const CONTROLS = ['Something else', 'Help'] as const; // labels, in scan order

export const REPLY_COUNT = 8; // most replies per question: the 2 x 4 grid; a server question may have fewer
export const SAY_MS = 2000; // a committed reply fills the screen this long; a press in that time cancels it
export const BUDGET_MS = 3500; // the server's budget for the model's replies (plan §4.3): a server question's scan starts by then

/** Mock AI-like reply scores by rank: the fixture lists each question's replies best guess first. */
export const MOCK_SCORES = [0.35, 0.2, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04] as const; // as in gate K1-scan

/** Engine parameters: the scan defaults, with the 2% the mock scores leave split over the two controls. */
export const CONFIG: ScanConfig = { ...DEFAULT_SCAN_CONFIG, controlShare: 0.01 }; // so the priors equal the scores

/**
 * Plays a server question's spoken announcement (B9), a path on the server. Calls onEnd once, later (never during the
 * call), when it has finished or can't be played, and returns a function that stops it, after which onEnd is not called;
 * calling that function after the end does nothing.
 */
export type Announce = (path: string, onEnd: () => void) => () => void; // the TV's audio player, or the studio's

/** What happened to the help request sent when Help opened. */
export type HelpStatus = 'sending' | 'sent' | 'failed'; // on its way; the server confirmed it; it could not be sent

/** The Help screen's words for each state of its help request (both the TV and the studio's virtual TV show them). */
export const HELP_TEXT: Record<HelpStatus, string> = { // what really happened, never a promise
  sending: 'Asking for help…', // while it is sent
  sent: 'Help request sent.', // the server confirmed it
  failed: "Couldn't send the help request.", // no server, or it could not be reached (offline practice)
}; // end of HELP_TEXT

/** What the idle screen shows after a short press, which sends nothing (both the TV and the studio's virtual TV show it). */
export const IDLE_HINT = 'Hold the button for help.'; // only a 2 s hold or the Help card asks for help, so one accidental press alerts nobody
export const IDLE_HINT_MS = 3000; // how long the hint shows after the press

/** What the screen shows. Replaced as a whole on every change. */
export interface Snapshot { // the screen state
  mode: 'asking' | 'waiting' | 'saying' | 'help' | 'idle'; // scanning; a server question before its scan starts; the reply and its cancel window; Help; connected, between server questions
  question: Question; // the current question; when idle, the one last on screen (not shown)
  reply: string | null; // the committed reply, while it is being said; when idle, the last reply to a server question that stood, if any
  help?: HelpStatus; // in Help only: what happened to its help request
  hint?: boolean; // when idle only, for IDLE_HINT_MS after a short press: IDLE_HINT shows
} // end of Snapshot

/** A reply that stood through its cancel window, with its selection statistics, for POST /v1/utterances. */
export interface Reply { // handed to the screen, which posts it
  questionId: string | null; // the server question it answers; null for a fixture question
  questionText: string | null; // a fixture question's text, which the server has no record of; null for a server question
  text: string; // the words
  clicks: number; // presses that made the selection
  durationMs: number; // from the scan of the question starting to the commit
} // end of Reply

/** One committed selection, for the K2 log. */
export interface Selection { // reported on every commit
  label: string; // what was chosen
  offsetsMs: number[]; // each accepted press's offset from the chosen card's highlight onset, where the scan showed it
} // end of Selection

/** The engine options: the replies (8 on a fixture) at the server's priors (or the mock scores), then Something else and Help. */
export function optionsFor(question: Question): Option[] { // engine options for one question
  const replies = question.replies.map((_, i) => ({ id: `reply${i}`, score: question.scores?.[i] ?? MOCK_SCORES[i]! })); // best guess first
  const controls = CONTROLS.map((label) => ({ id: label.toLowerCase(), score: 0, control: true })); // 1% each
  return [...replies, ...controls]; // the grid's cards, then the pills
} // end of optionsFor

/**
 * The grid's cards: the replies, in the server's order, then null for each empty slot up to the question's size, so the grid
 * never changes size when the model's replies arrive. Empty slots are no options: never lit, never scanned.
 */
export function cardsOf(question: Question): (string | null)[] { // replies, then empty slots
  return Array.from({ length: Math.max(question.replies.length, question.slots ?? 0) }, (_, i) => question.replies[i] ?? null); // a fixture has no slots: just its replies
} // end of cardsOf

/** Text of option i: a reply, or a control after the replies. */
function labelOf(question: Question, i: number): string { // option index to label
  const n = question.replies.length; // the controls follow the replies, however many there are
  return (i < n ? question.replies[i] : CONTROLS[i - n])!; // i is always a valid option index
} // end of labelOf

/**
 * Runs the screen: owns the engine, turns presses and holds into states and reports each committed selection.
 * While the server can be reached the screen is idle between its questions; otherwise fixture questions rotate as
 * practice. A question from the server takes over at once while scanning, waiting or idle, or as soon as "Saying it"
 * or Help ends, and the idle screen (or practice, offline) follows it. Its scan starts when the model's replies arrive
 * or its budget ends, whichever comes first, so the list never changes while the highlight moves; if it has a spoken
 * announcement, not before that has finished or failed. A press during the announcement stops it and starts the scan
 * at once, choosing nothing; Help stops it too.
 */
export class Conversation { // one per screen
  readonly engine: ScanEngine; // the screen reads its highlight on every frame
  private readonly now: () => number; // the shared clock
  private readonly debounceMs: number; // the engine's debounce, applied here too so it survives setOptions
  private readonly questions: readonly Question[]; // the fixture
  private readonly onSelection: (selection: Selection) => void; // K2 log hook
  private readonly onSay: (reply: Reply) => void; // receives each reply once its cancel window has passed
  private readonly onHelp: () => Promise<unknown>; // sends one help request each time Help opens; settles when the server confirms it or it fails
  private readonly held: () => boolean; // whether a switch key is down now
  private readonly announce: Announce | null; // plays a server question's announcement; null in a build that can't
  private readonly listeners = new Set<() => void>(); // the screen's change callbacks
  private index = 0; // the fixture question shown last
  private online: boolean; // whether the stream is connected: then no practice question is asked
  private last: string | null = null; // the last reply to a server question that stood, for the idle screen
  private idleHelp = false; // Help was opened from the idle screen, so dismissing it goes back there
  private pending: Question | null = null; // a server question that arrived during "Saying it" or Help
  private helps = 0; // how often Help has opened, so a late answer to an earlier help request changes nothing
  private readonly budgets = new Map<string, number>(); // server questions whose scan has not started: when their budget ends
  private readonly announcements = new Map<string, string>(); // server questions not shown yet: their announcement's path, played once when shown
  private silence: (() => void) | null = null; // stops the announcement playing now; null while none is
  private heard = { from: Infinity, until: Infinity }; // the shown question's announcement: when it started and ended (until is Infinity while it plays; from is Infinity without one)
  private askedAt = 0; // when the current selection's scan started
  private lastPress = -Infinity; // key-down time of the last press that was not debounced, in any state
  private presses: (number | null)[][] = []; // accepted presses of this selection: offsets from each option's onset
  private timer: ReturnType<typeof setTimeout> | undefined; // the pending end of the "Saying it" window, of a budget, or of the idle screen's hint
  private snap: Snapshot; // what the screen shows now

  constructor(config: ScanConfig, now: () => number, questions: readonly Question[], onSelection: (s: Selection) => void, onSay: (r: Reply) => void, onHelp: () => Promise<unknown>, held: () => boolean, online = false, announce: Announce | null = null) { // start
    this.engine = new ScanEngine(config, now); // engine on the shared clock
    this.now = now; // the clock
    this.debounceMs = config.debounceMs; // 150 ms by default
    this.questions = questions; // fixture
    this.onSelection = onSelection; // log hook
    this.onSay = onSay; // reply hook
    this.onHelp = onHelp; // help hook
    this.held = held; // the switch's state
    this.announce = announce; // the announcement player, if any
    this.online = online; // a build with a server counts as connected until its first attempt fails
    this.snap = this.ask(questions[0]!); // Asking the first question; the engine holds a scan from the start
    if (online) { // a build with a server: idle from the start, so no practice question flashes up
      this.index = -1; // no fixture shown yet: practice, if the server cannot be reached, starts at the first
      this.snap = this.idle(); // waiting for a question
    } // end of the online start
  } // end of constructor

  /** The current snapshot: the same object until something changes (for useSyncExternalStore). */
  readonly snapshot = (): Snapshot => this.snap; // read access

  /** Registers a change callback and returns the function that removes it. */
  readonly subscribe = (listener: () => void): (() => void) => { // for useSyncExternalStore
    this.listeners.add(listener); // start notifying
    return () => this.listeners.delete(listener); // stop notifying
  }; // end of subscribe

  /**
   * A short press whose key went down at time t on the shared clock. The engine's debounce restarts with every
   * setOptions, so it is applied here as well: a press within debounceMs of the last one is ignored in any state.
   */
  press(t: number): void { // from the switch input, once the key has stayed up for 150 ms
    if (t - this.lastPress < this.debounceMs) return; // debounced: tremor or a bounce
    this.lastPress = t; // the next press is debounced against this one
    if (this.snap.mode === 'waiting') return this.skip(t); // its key went down during the announcement: it stops and the scan starts; otherwise nothing is lit yet
    if (this.snap.mode === 'idle') return this.hint(); // nothing to answer: say how to ask for help, and send nothing
    if (this.snap.mode === 'help' && (this.pending || this.idleHelp)) return this.set(this.next()); // closes Help: a server question asked meanwhile comes first, then the idle screen
    if (this.snap.mode !== 'asking') return this.set(this.show(this.snap.question)); // cancels "Saying it" or closes Help: the same question
    if (t < this.askedAt) return; // a key-down before this scan started: the press meant nothing here
    const offsets = this.engine.offsets(t); // where this press falls against each option's highlight, for K2
    const result = this.engine.click(t); // Bayes update; commit, or a rescan of the top two that the screen draws
    this.presses.push(offsets); // keep it for the offset log
    if (result.committed !== null) this.commit(result.committed); // a selection was made
  } // end of press

  /**
   * A switch key went down at time t. In the "Saying it" window that cancels the reply at once, so a reply is only
   * posted when its window ends with no key-down; in any other state the press is handled once the key has stayed up.
   */
  down(t: number): void { // from the switch input, at key-down
    if (this.snap.mode !== 'saying' || t - this.lastPress < this.debounceMs) return; // not in the window, or debounced
    this.lastPress = t; // the same press, handed over again once the key has stayed up, is debounced away
    this.set(this.show(this.snap.question)); // cancels "Saying it": scan the same question again
  } // end of down

  /** A hold of 2 s or more whose key went down at time _t (not needed here), in any state: the Help screen, and one help request. */
  help(_t: number): void { // from the switch input, as soon as the hold reaches 2 s
    if (this.snap.mode === 'help') return; // already shown, its request already sent
    clearTimeout(this.timer); // a reply still in its "Saying it" window is not said; a waiting scan waits for Help to close
    this.quiet(); // an announcement playing stops, and is not played again
    this.idleHelp = this.snap.mode === 'idle'; // where dismissing it goes back to
    const opening = ++this.helps; // this opening of Help
    this.set({ mode: 'help', question: this.snap.question, reply: null, help: 'sending' }); // "Asking for help…"; the idle screen's hint, if shown, goes
    this.onHelp().then(() => this.helped(opening, 'sent'), () => this.helped(opening, 'failed')); // the one request, and what happened to it
  } // end of help

  /**
   * Whether the stream is connected. Once it is, a practice question gives way to a queued server question or the idle
   * screen: at once while it is asked, else when its reply's window ends or Help is dismissed. Once it is not, the idle screen gives way to practice.
   * A server question on screen is never interrupted.
   */
  setOnline(online: boolean): void { // from the stream's connected and disconnected
    if (online === this.online) return; // no change: no new snapshot
    this.online = online; // the new state
    if (online && this.snap.mode === 'asking' && this.snap.question.id === undefined) this.set(this.next()); // practice is over: a queued server question first, else the idle screen
    if (!online && this.snap.mode === 'idle') this.set(this.next()); // practice, with the next fixture
  } // end of setOnline

  /**
   * A question from the server: shown at once while scanning, waiting or idle, otherwise when "Saying it" ends or Help is
   * dismissed. Its budget for the model's replies runs from now. After a reconnect the server sends the open question
   * again: for the question on screen or the queued one, new replies are only an update, which never restarts a running
   * scan, and the same replies (the defaults again, before the model's arrive) change nothing.
   */
  receive(question: Question): void { // from the stream's question.created
    const id = question.id!; // a server question always has an id
    const known = [this.snap.question, this.pending].find((q) => q?.id === id); // the screen's copy, if this is a replay
    if (known && known.replies.join('\n') === question.replies.join('\n')) return; // the same replies: nothing new
    if (known) return this.update(id, question.replies, question.scores ?? []); // the model's replies: an update
    this.budgets.set(id, this.now() + BUDGET_MS); // a new question: its budget runs from its arrival here
    if (question.announcement !== undefined) this.announcements.set(id, question.announcement); // played when it is shown
    if (this.snap.mode !== 'saying' && this.snap.mode !== 'help') this.set(this.show(question)); // replaces the current question, or the idle screen
    else this.pending = question; // the next question, ahead of the fixtures and the idle screen
  } // end of receive

  /** The final candidates for server question `id` (the model's, or its options): they replace its replies only within its budget, before its scan. */
  update(id: string, replies: readonly string[], scores: readonly number[]): void { // from the stream's question.candidates
    const end = this.budgets.get(id); // when its budget ends; none once its scan has started
    if (end === undefined || this.now() >= end) return; // too late: the list stays as it is
    this.budgets.delete(id); // the final list: its scan may start
    if (this.pending?.id === id) this.pending = { ...this.pending, replies, scores }; // not shown yet: scanned at once when it is
    if (this.snap.question.id !== id) return; // not on screen: replaced, or queued
    const question = { ...this.snap.question, replies, scores }; // the new replies, in the server's order; its slots stay
    if (this.snap.mode === 'waiting' && this.silence === null) this.set(this.ask(question)); // the highlight starts now, on the final list
    else this.set({ ...this.snap, question }); // Help, opened while waiting, or the announcement still playing: scanned when it ends
  } // end of update

  /** Cancels the pending timer and stops an announcement; the screen calls this when it unmounts. */
  dispose(): void { // clean-up
    clearTimeout(this.timer); // nothing fires after the screen is gone
    this.quiet(); // and nothing is heard
  } // end of dispose

  private commit(id: string): void { // option `id` was chosen
    const question = this.snap.question; // the question it answers
    const chosen = optionsFor(question).findIndex((o) => o.id === id); // its option index
    const label = labelOf(question, chosen); // its text
    const offsetsMs = this.presses.map((p) => p[chosen]).filter((d): d is number => typeof d === 'number'); // where shown
    this.onSelection({ label, offsetsMs }); // K2 log
    if (label === 'Help') return this.help(this.now()); // the same screen as a hold
    if (label === 'Something else' && question.id === undefined) return this.set(this.next()); // on a fixture: the next question
    const reply: Reply = { questionId: question.id ?? null, questionText: question.id ? null : question.text, text: label, clicks: this.presses.length, durationMs: Math.round(this.now() - this.askedAt) }; // stats
    this.set({ ...this.snap, mode: 'saying', reply: label }); // the reply fills the screen
    this.timer = setTimeout(() => { // the window passed without a key-down notice
      if (this.held()) return this.set(this.show(question)); // a switch key is still down: cancel
      this.onSay(reply); // the reply stands: posted (and spoken) only now, so a cancelled reply never leaves the TV
      if (question.id !== undefined) this.last = label; // for the idle screen; a practice reply cannot reach the server
      this.set(this.next()); // the next question, or the idle screen
    }, SAY_MS); // 2 s
  } // end of commit

  private helped(opening: number, help: HelpStatus): void { // the help request of Help opening `opening` was confirmed or failed
    if (opening === this.helps && this.snap.mode === 'help') this.set({ ...this.snap, help }); // still that Help screen: show what happened
  } // end of helped

  private next(): Snapshot { // after the current question: a waiting server question first, else the idle screen when online, else the next fixture
    const waiting = this.pending; // arrived during "Saying it" or Help
    this.pending = null; // taken
    if (waiting) return this.show(waiting); // show it now
    if (this.online) return this.idle(); // connected: wait for the next server question
    this.index = this.nearby(1); // the fixture after the last one shown
    return this.ask(this.questions[this.index]!); // ask it
  } // end of next

  private nearby(step: number): number { // index of the fixture question `step` places from the last one, wrapping round
    return (this.index + step + this.questions.length) % this.questions.length; // after the last comes the first
  } // end of nearby

  private show(question: Question): Snapshot { // a server question waits for its announcement and, within its budget, its replies; others are asked
    this.quiet(); // an announcement still playing is over: this question replaces it
    if (this.online && question.id === undefined) return this.next(); // a practice question again (after a cancel or Help), now connected: what comes next instead
    const id = question.id ?? ''; // fixtures have none
    this.heard = { from: Infinity, until: Infinity }; // no announcement heard for this question yet
    const path = this.announcements.get(id); // its announcement, if it has not been played
    this.announcements.delete(id); // played once: now, or never
    if (path !== undefined && this.announce) this.listen(path); // it plays while the replies are found
    const end = this.budgets.get(id); // when its budget ends; fixtures have none
    if (this.silence === null && (end === undefined || this.now() >= end)) return this.ask(question); // nothing to wait for: the scan starts now
    clearTimeout(this.timer); // one pending timer at a time
    if (end !== undefined && this.now() < end) this.timer = setTimeout(() => { this.budgets.delete(id); this.proceed(); }, end - this.now()); // the budget ends: what is shown is final, scanned once the announcement is over
    return { mode: 'waiting', question, reply: null }; // the question and its replies, nothing lit
  } // end of show

  private listen(path: string): void { // plays the shown question's announcement; its scan waits for the end
    this.heard = { from: this.now(), until: Infinity }; // playing from now
    const stop = this.announce!(path, () => { if (this.silence !== stop) return; this.quiet(); this.proceed(); }); // finished or can't be played: ignored once stopped
    this.silence = stop; // playing now
  } // end of listen

  private quiet(): void { // stops the announcement playing now, if one is
    if (this.silence === null) return; // none is
    this.silence(); // the player stops (a no-op once it has ended)
    this.silence = null; // none playing
    this.heard = { ...this.heard, until: this.now() }; // it ended now
  } // end of quiet

  private skip(t: number): void { // a press whose key went down at t, while waiting
    if (t < this.heard.from || t > this.heard.until) return; // not during the announcement: nothing is lit yet, so the press means nothing
    this.quiet(); // the announcement stops, if it still plays
    this.set(this.ask(this.snap.question)); // and the scan starts at once, on the replies shown; the press chose nothing
  } // end of skip

  private proceed(): void { // the announcement or the budget ended: scan once the announcement is over and the replies are final or out of budget
    if (this.snap.mode !== 'waiting' || this.silence !== null) return; // not waiting, or the announcement still plays
    const end = this.budgets.get(this.snap.question.id ?? ''); // none once the replies are final or the budget has ended
    if (end === undefined || this.now() >= end) this.set(this.ask(this.snap.question)); // the scan starts now, on what is shown
  } // end of proceed

  private ask(question: Question): Snapshot { // a new selection on `question`
    clearTimeout(this.timer); // a pending "Saying it" window or budget is over
    this.budgets.delete(question.id ?? ''); // its scan starts: later replies are ignored
    this.engine.setOptions(optionsFor(question)); // priors from the server or the mock scores; a full scan from now
    this.askedAt = this.now(); // presses whose key went down before this belong to the state before
    this.presses = []; // no presses yet
    return { mode: 'asking', question, reply: null }; // Asking
  } // end of ask

  private idle(): Snapshot { // connected, between server questions: nothing lit or moving
    clearTimeout(this.timer); // a cancelled reply's "Saying it" window is over, and so is a hint's time
    return { mode: 'idle', question: this.snap.question, reply: this.last }; // the last reply that stood, if any
  } // end of idle

  private hint(): void { // a short press on the idle screen: IDLE_HINT for IDLE_HINT_MS, counted from the latest press
    this.set({ ...this.idle(), hint: true }); // the idle screen with the hint
    this.timer = setTimeout(() => this.set(this.idle()), IDLE_HINT_MS); // then the idle screen as it was; anything else that comes first clears this timer
  } // end of hint

  private set(next: Snapshot): void { // replace the snapshot and notify
    this.snap = next; // the new state
    this.listeners.forEach((listener) => listener()); // let the screen re-render
  } // end of set
} // end of Conversation
