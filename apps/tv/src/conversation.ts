// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The conversation screen's state machine (plan §5.2): Asking, then Speaking for 3 s, then Asking the next question.

import { Engine, offsetMs, type EngineConfig, type Option } from 'switchclock'; // the engine and its clock model
import type { Question } from './questions'; // fixture shape

/** The control options, always on screen after the eight replies (plan §5.1, principle 3). */
export const CONTROLS = ['Undo', 'More', 'Spell', 'Help'] as const; // labels, in pill order

export const REPLY_COUNT = 8; // replies per question: the 2 x 4 grid
export const SPEAK_MS = 3000; // a committed reply stays on screen this long
export const FLASH_MS = 150; // dials whose phase changed keep their outline flash this long

/** What the screen shows. Replaced as a whole on every change. */
export interface Snapshot { // the screen state
  mode: 'asking' | 'speaking'; // the state of plan §5.2
  question: Question; // the current question
  reply: string | null; // the committed reply, while speaking
  hint: string | null; // the last committed control's name, until the next question
  posterior: readonly number[]; // P(option) in option order: 8 replies, then 4 controls
  flash: readonly boolean[]; // options whose dial just jumped (empty or all false when none)
} // end of Snapshot

/** One committed selection, for the K2 log. */
export interface Selection { // reported on every commit
  label: string; // what was chosen
  offsetsMs: number[]; // each accepted press's offset from the chosen dial's nearest noon
} // end of Selection

const NO_FLASH: readonly boolean[] = []; // no dial is flashing

/** The 12 engine options: 8 replies with equal scores and 4 controls, exactly as in gate K1. */
export function optionsFor(question: Question): Option[] { // engine options for one question
  const replies = question.replies.map((_, i) => ({ id: `reply${i}`, score: 0.5 })); // uniform reply priors
  const controls = CONTROLS.map((label) => ({ id: label.toLowerCase(), score: 0, control: true })); // 3% each
  return [...replies, ...controls]; // the grid's cards, then the pills
} // end of optionsFor

/** Text of option i: a reply, or a control after the replies. */
function labelOf(question: Question, i: number): string { // option index to label
  return (i < REPLY_COUNT ? question.replies[i] : CONTROLS[i - REPLY_COUNT])!; // i is always a valid option index
} // end of labelOf

/** Runs the screen: owns the engine, turns presses into states and reports each committed selection. */
export class Conversation { // one per screen
  readonly engine: Engine; // the dials read its phases and t0 on every frame
  private readonly periodMs: number; // T, for the offset log
  private readonly debounceMs: number; // the engine's debounce, applied here too so it survives setOptions
  private readonly questions: readonly Question[]; // the fixture
  private readonly onSelection: (selection: Selection) => void; // K2 log hook
  private readonly listeners = new Set<() => void>(); // the screen's change callbacks
  private index = 0; // current question
  private lastPress = -Infinity; // time of the last press that was not debounced, in any state
  private presses: { t: number; phases: number[] }[] = []; // accepted presses of this selection, with their phases
  private timer: ReturnType<typeof setTimeout> | undefined; // pending flash end or speaking time-out
  private snap: Snapshot; // what the screen shows now

  constructor(config: EngineConfig, now: () => number, questions: readonly Question[], onSelection: (s: Selection) => void) { // start
    this.engine = new Engine(config, now); // engine on the shared clock
    this.periodMs = config.periodMs; // T
    this.debounceMs = config.debounceMs; // 150 ms by default
    this.questions = questions; // fixture
    this.onSelection = onSelection; // log hook
    this.snap = this.ask(0, null); // Asking the first question
  } // end of constructor

  /** The current snapshot: the same object until something changes (for useSyncExternalStore). */
  readonly snapshot = (): Snapshot => this.snap; // read access

  /** Registers a change callback and returns the function that removes it. */
  readonly subscribe = (listener: () => void): (() => void) => { // for useSyncExternalStore
    this.listeners.add(listener); // start notifying
    return () => this.listeners.delete(listener); // stop notifying
  }; // end of subscribe

  /**
   * A switch press at time t on the shared clock. The engine's debounce restarts with every setOptions, so it is
   * applied here as well: a press within debounceMs of the last one is ignored even across a new selection or a
   * question change. The engine's own check then always passes.
   */
  press(t: number): void { // from the key handler
    if (t - this.lastPress < this.debounceMs) return; // debounced: tremor or a bounce
    this.lastPress = t; // the next press is debounced against this one
    if (this.snap.mode !== 'asking') return; // nothing to choose while a reply is shown
    const before = this.engine.phases(); // the phases this press is scored against
    const result = this.engine.click(t); // Bayes update, commit check, re-phasing
    this.presses.push({ t, phases: before }); // keep it for the offset log
    if (result.committed !== null) return this.commit(result.committed); // a selection was made
    this.show({ ...this.snap, posterior: result.posterior }, before); // new posterior and layout, with a flash
  } // end of press

  /** Cancels the pending timer; the screen calls this when it unmounts. */
  dispose(): void { // clean-up
    clearTimeout(this.timer); // nothing fires after the screen is gone
  } // end of dispose

  private commit(id: string): void { // option `id` was chosen
    const question = this.snap.question; // the question it answers
    const chosen = optionsFor(question).findIndex((o) => o.id === id); // its option index
    const label = labelOf(question, chosen); // its text
    const offsetsMs = this.presses.map((p) => offsetMs(p.t, this.engine.t0, this.periodMs, p.phases[chosen]!)); // from its noon
    this.onSelection({ label, offsetsMs }); // K2 log
    // A control shows only its name, in the hint. Its new selection restarts the clocks, so every dial jumps.
    if (chosen >= REPLY_COUNT) return this.show(this.ask(this.index, label), []); // an empty "before" flashes them all
    this.set({ ...this.snap, mode: 'speaking', reply: label, flash: NO_FLASH }); // a reply: very large text
    this.later(SPEAK_MS, () => this.set(this.ask((this.index + 1) % this.questions.length, null))); // then the next question
  } // end of commit

  private ask(index: number, hint: string | null): Snapshot { // a new selection on question `index`
    const question = this.questions[index]!; // the question
    this.index = index; // remember it
    this.engine.setOptions(optionsFor(question)); // priors; clocks restart now; phases by prior rank
    this.presses = []; // no presses yet
    return { mode: 'asking', question, reply: null, hint, posterior: this.engine.posterior(), flash: NO_FLASH }; // Asking
  } // end of ask

  private show(next: Snapshot, before: readonly number[]): void { // a state whose dials may have jumped
    const after = this.engine.phases(); // the new layout, applied instantly
    this.set({ ...next, flash: after.map((p, i) => p !== before[i]) }); // with t0 unchanged, a new phase is a jump
    this.later(FLASH_MS, () => this.set({ ...this.snap, flash: NO_FLASH })); // then end the flash
  } // end of show

  private later(ms: number, action: () => void): void { // one pending timer at a time
    clearTimeout(this.timer); // a newer timer replaces an older one
    this.timer = setTimeout(action, ms); // schedule
  } // end of later

  private set(next: Snapshot): void { // replace the snapshot and notify
    this.snap = next; // the new state
    this.listeners.forEach((listener) => listener()); // let the screen re-render
  } // end of set
} // end of Conversation
