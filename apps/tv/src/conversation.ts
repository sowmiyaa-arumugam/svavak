// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The conversation screen's state machine (plan §5.2) in scan mode: Asking, Saying (2 s to cancel), and Help.

import { DEFAULT_SCAN_CONFIG, ScanEngine, type Option, type ScanConfig } from 'switchclock'; // the scan engine
import type { Question } from './questions'; // fixture shape

/** The control options, scanned after the eight replies. */
export const CONTROLS = ['Something else', 'Help'] as const; // labels, in scan order

export const REPLY_COUNT = 8; // replies per question: the 2 x 4 grid
export const SAY_MS = 2000; // a committed reply fills the screen this long; a press in that time cancels it

/** Mock AI-like reply scores by rank: the fixture lists each question's replies best guess first. */
export const MOCK_SCORES = [0.35, 0.2, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04] as const; // as in gate K1-scan

/** Engine parameters: the scan defaults, with the 2% the mock scores leave split over the two controls. */
export const CONFIG: ScanConfig = { ...DEFAULT_SCAN_CONFIG, controlShare: 0.01 }; // so the priors equal the scores

/** What the screen shows. Replaced as a whole on every change. */
export interface Snapshot { // the screen state
  mode: 'asking' | 'saying' | 'help'; // scanning the options; the reply and its cancel window; the Help screen
  question: Question; // the current question
  reply: string | null; // the committed reply, while it is being said
} // end of Snapshot

/** A reply that stood through its cancel window, with its selection statistics, for POST /v1/utterances. */
export interface Reply { // handed to the screen, which posts it
  questionId: string | null; // the server question it answers; null for a fixture question
  text: string; // the words
  clicks: number; // presses that made the selection
  durationMs: number; // from the scan of the question starting to the commit
} // end of Reply

/** One committed selection, for the K2 log. */
export interface Selection { // reported on every commit
  label: string; // what was chosen
  offsetsMs: number[]; // each accepted press's offset from the chosen card's highlight onset, where the scan showed it
} // end of Selection

/** The 10 engine options: 8 replies at the server's priors (or the mock scores), then Something else and Help. */
export function optionsFor(question: Question): Option[] { // engine options for one question
  const replies = question.replies.map((_, i) => ({ id: `reply${i}`, score: question.scores?.[i] ?? MOCK_SCORES[i]! })); // best guess first
  const controls = CONTROLS.map((label) => ({ id: label.toLowerCase(), score: 0, control: true })); // 1% each
  return [...replies, ...controls]; // the grid's cards, then the pills
} // end of optionsFor

/** Text of option i: a reply, or a control after the replies. */
function labelOf(question: Question, i: number): string { // option index to label
  return (i < REPLY_COUNT ? question.replies[i] : CONTROLS[i - REPLY_COUNT])!; // i is always a valid option index
} // end of labelOf

/**
 * Runs the screen: owns the engine, turns presses and holds into states and reports each committed selection.
 * Fixture questions rotate; a question from the server takes over at once while scanning, or as soon as "Saying it"
 * or Help ends, and the fixtures resume after it.
 */
export class Conversation { // one per screen
  readonly engine: ScanEngine; // the screen reads its highlight on every frame
  private readonly now: () => number; // the shared clock
  private readonly debounceMs: number; // the engine's debounce, applied here too so it survives setOptions
  private readonly questions: readonly Question[]; // the fixture
  private readonly onSelection: (selection: Selection) => void; // K2 log hook
  private readonly onSay: (reply: Reply) => void; // receives each reply once its cancel window has passed
  private readonly listeners = new Set<() => void>(); // the screen's change callbacks
  private index = 0; // the fixture question shown last
  private pending: Question | null = null; // a server question that arrived during "Saying it" or Help
  private previous: Question | null = null; // the question whose reply was just said, while a late press may cancel it
  private askedAt = 0; // when the current selection's scan started
  private lastPress = -Infinity; // key-down time of the last press that was not debounced, in any state
  private presses: (number | null)[][] = []; // accepted presses of this selection: offsets from each option's onset
  private timer: ReturnType<typeof setTimeout> | undefined; // the pending end of the "Saying it" window
  private snap: Snapshot; // what the screen shows now

  constructor(config: ScanConfig, now: () => number, questions: readonly Question[], onSelection: (s: Selection) => void, onSay: (r: Reply) => void) { // start
    this.engine = new ScanEngine(config, now); // engine on the shared clock
    this.now = now; // the clock
    this.debounceMs = config.debounceMs; // 150 ms by default
    this.questions = questions; // fixture
    this.onSelection = onSelection; // log hook
    this.onSay = onSay; // reply hook
    this.snap = this.ask(questions[0]!); // Asking the first question
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
  press(t: number): void { // from the switch input, at key-up
    if (t - this.lastPress < this.debounceMs) return; // debounced: tremor or a bounce
    this.lastPress = t; // the next press is debounced against this one
    if (this.snap.mode === 'help' && this.pending) return this.set(this.next()); // closes Help: a server question asked meanwhile comes first
    if (this.snap.mode !== 'asking') return this.set(this.ask(this.snap.question)); // cancels "Saying it" or closes Help: scan again
    if (t < this.askedAt) { // the key went down before this scan started
      if (this.previous) this.set(this.ask(this.previous)); // inside the "Saying it" window: cancel that reply
      return; // otherwise its scan was replaced by a server question or new candidates: the press meant nothing here
    } // end of the early press
    const offsets = this.engine.offsets(t); // where this press falls against each option's highlight, for K2
    const result = this.engine.click(t); // Bayes update; commit, or a rescan of the top two that the screen draws
    this.presses.push(offsets); // keep it for the offset log
    if (result.committed !== null) this.commit(result.committed); // a selection was made
  } // end of press

  /** A hold of 2 s or more whose key went down at time t, in any state: the Help screen. */
  help(t: number): void { // from the switch input, at key-up
    if (this.snap.mode === 'help') return; // already shown
    clearTimeout(this.timer); // a reply still in its "Saying it" window is not said
    if (t < this.askedAt && this.previous) this.snap = this.ask(this.previous); // the hold began in "Saying it": back to that question
    this.set({ ...this.snap, mode: 'help', reply: null }); // "Help is coming"
  } // end of help

  /** A question from the server: asked at once while scanning, otherwise when "Saying it" ends or Help is dismissed. */
  receive(question: Question): void { // from the stream's question.created
    if (this.snap.mode === 'asking') this.set(this.ask(question)); // replaces the current scan
    else this.pending = question; // the next question, ahead of the fixtures
  } // end of receive

  /** The model's candidates for server question `id`: they replace its replies wherever it is. */
  update(id: string, replies: readonly string[], scores: readonly number[]): void { // from the stream's question.candidates
    if (this.pending?.id === id) this.pending = { ...this.pending, replies, scores }; // not shown yet
    if (this.snap.question.id !== id) return; // not on screen: answered, replaced, or a fixture
    const question = { ...this.snap.question, replies, scores }; // the new replies, best guess first
    if (this.snap.mode === 'asking') this.set(this.ask(question)); // a fresh scan over them
    else this.set({ ...this.snap, question }); // during "Saying it" or Help: used if this question is scanned again
  } // end of update

  /** Cancels the pending timer; the screen calls this when it unmounts. */
  dispose(): void { // clean-up
    clearTimeout(this.timer); // nothing fires after the screen is gone
  } // end of dispose

  private commit(id: string): void { // option `id` was chosen
    const question = this.snap.question; // the question it answers
    const chosen = optionsFor(question).findIndex((o) => o.id === id); // its option index
    const label = labelOf(question, chosen); // its text
    const offsetsMs = this.presses.map((p) => p[chosen]).filter((d): d is number => typeof d === 'number'); // where shown
    this.onSelection({ label, offsetsMs }); // K2 log
    if (label === 'Help') return this.set({ ...this.snap, mode: 'help' }); // the same screen as a hold
    if (label === 'Something else') return this.set(this.next()); // the next question
    const reply: Reply = { questionId: question.id ?? null, text: label, clicks: this.presses.length, durationMs: Math.round(this.now() - this.askedAt) }; // stats
    this.set({ ...this.snap, mode: 'saying', reply: label }); // the reply fills the screen
    this.timer = setTimeout(() => { // the window passed without a cancel: the reply stands
      this.onSay(reply); // posted (and spoken) only now, so a cancelled reply never leaves the TV
      this.set(this.next()); // the next question
      this.previous = question; // a press whose key went down inside the window still cancels it on screen
    }, SAY_MS); // 2 s
  } // end of commit

  private next(): Snapshot { // the question after the current one: a waiting server question first, else the next fixture
    const waiting = this.pending; // arrived during "Saying it" or Help
    this.pending = null; // taken
    if (waiting) return this.ask(waiting); // ask it now
    this.index = this.nearby(1); // the fixture after the last one shown
    return this.ask(this.questions[this.index]!); // ask it
  } // end of next

  private nearby(step: number): number { // index of the fixture question `step` places from the last one, wrapping round
    return (this.index + step + this.questions.length) % this.questions.length; // after the last comes the first
  } // end of nearby

  private ask(question: Question): Snapshot { // a new selection on `question`
    clearTimeout(this.timer); // a pending "Saying it" window is over
    this.previous = null; // a press from before this scan cancels nothing (the "Saying it" timer sets it after asking)
    this.engine.setOptions(optionsFor(question)); // priors from the server or the mock scores; a full scan from now
    this.askedAt = this.now(); // presses whose key went down before this belong to the state before
    this.presses = []; // no presses yet
    return { mode: 'asking', question, reply: null }; // Asking
  } // end of ask

  private set(next: Snapshot): void { // replace the snapshot and notify
    this.snap = next; // the new state
    this.listeners.forEach((listener) => listener()); // let the screen re-render
  } // end of set
} // end of Conversation
