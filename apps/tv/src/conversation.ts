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

/** One committed selection, for the K2 log. */
export interface Selection { // reported on every commit
  label: string; // what was chosen
  offsetsMs: number[]; // each accepted press's offset from the chosen card's highlight onset, where the scan showed it
} // end of Selection

/** The 10 engine options: 8 replies at the mock scores, then Something else and Help, in scan order. */
export function optionsFor(question: Question): Option[] { // engine options for one question
  const replies = question.replies.map((_, i) => ({ id: `reply${i}`, score: MOCK_SCORES[i]! })); // best guess first
  const controls = CONTROLS.map((label) => ({ id: label.toLowerCase(), score: 0, control: true })); // 1% each
  return [...replies, ...controls]; // the grid's cards, then the pills
} // end of optionsFor

/** Text of option i: a reply, or a control after the replies. */
function labelOf(question: Question, i: number): string { // option index to label
  return (i < REPLY_COUNT ? question.replies[i] : CONTROLS[i - REPLY_COUNT])!; // i is always a valid option index
} // end of labelOf

/** Runs the screen: owns the engine, turns presses and holds into states and reports each committed selection. */
export class Conversation { // one per screen
  readonly engine: ScanEngine; // the screen reads its highlight on every frame
  private readonly now: () => number; // the shared clock
  private readonly debounceMs: number; // the engine's debounce, applied here too so it survives setOptions
  private readonly questions: readonly Question[]; // the fixture
  private readonly onSelection: (selection: Selection) => void; // K2 log hook
  private readonly listeners = new Set<() => void>(); // the screen's change callbacks
  private index = 0; // current question
  private askedAt = 0; // when the current selection's scan started
  private lastPress = -Infinity; // key-down time of the last press that was not debounced, in any state
  private presses: (number | null)[][] = []; // accepted presses of this selection: offsets from each option's onset
  private timer: ReturnType<typeof setTimeout> | undefined; // the pending end of the "Saying it" window
  private snap: Snapshot; // what the screen shows now

  constructor(config: ScanConfig, now: () => number, questions: readonly Question[], onSelection: (s: Selection) => void) { // start
    this.engine = new ScanEngine(config, now); // engine on the shared clock
    this.now = now; // the clock
    this.debounceMs = config.debounceMs; // 150 ms by default
    this.questions = questions; // fixture
    this.onSelection = onSelection; // log hook
    this.snap = this.ask(0); // Asking the first question
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
    if (this.snap.mode !== 'asking') return this.set(this.ask(this.index)); // cancels "Saying it" or closes Help: scan again
    if (t < this.askedAt) return this.set(this.ask(this.nearby(-1))); // the key went down before "Saying it" ended: cancel
    const offsets = this.engine.offsets(t); // where this press falls against each option's highlight, for K2
    const result = this.engine.click(t); // Bayes update; commit, or a rescan of the top two that the screen draws
    this.presses.push(offsets); // keep it for the offset log
    if (result.committed !== null) this.commit(result.committed); // a selection was made
  } // end of press

  /** A hold of 2 s or more whose key went down at time t, in any state: the Help screen. */
  help(t: number): void { // from the switch input, at key-up
    if (this.snap.mode === 'help') return; // already shown
    clearTimeout(this.timer); // a reply still in its "Saying it" window is not said
    if (t < this.askedAt) this.snap = this.ask(this.nearby(-1)); // the hold began in "Saying it": back to that question
    this.set({ ...this.snap, mode: 'help', reply: null }); // "Help is coming"
  } // end of help

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
    if (label === 'Something else') return this.set(this.ask(this.nearby(1))); // the next fixture set
    this.set({ ...this.snap, mode: 'saying', reply: label }); // the reply fills the screen
    this.timer = setTimeout(() => this.set(this.ask(this.nearby(1))), SAY_MS); // then the next question, unless cancelled
  } // end of commit

  private nearby(step: number): number { // index of the question `step` places from the current one, wrapping round
    return (this.index + step + this.questions.length) % this.questions.length; // after the last comes the first
  } // end of nearby

  private ask(index: number): Snapshot { // a new selection on question `index`
    clearTimeout(this.timer); // a pending "Saying it" window is over
    const question = this.questions[index]!; // the question
    this.index = index; // remember it
    this.engine.setOptions(optionsFor(question)); // priors from the mock scores; a full scan from now
    this.askedAt = this.now(); // presses whose key went down before this belong to the state before
    this.presses = []; // no presses yet
    return { mode: 'asking', question, reply: null }; // Asking
  } // end of ask

  private set(next: Snapshot): void { // replace the snapshot and notify
    this.snap = next; // the new state
    this.listeners.forEach((listener) => listener()); // let the screen re-render
  } // end of set
} // end of Conversation
