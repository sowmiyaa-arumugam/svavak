// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The single switch: Select, that is Enter on a keyboard or the centre button on a remote.

/** Android key codes that act as the switch: KEYCODE_DPAD_CENTER (remote) and KEYCODE_ENTER (keyboard). */
const SWITCH_KEY_CODES: ReadonlySet<number> = new Set([23, 66]); // centre button, Enter

/** Holding the switch at least this long opens Help instead of pressing. */
export const HOLD_MS = 2000; // 2 s

/** A key-down this soon after a release continues the same press or hold: the switch must stay up this long to end it. */
export const RELEASE_DEBOUNCE_MS = 150; // the engine's debounce, measured from the release

/** The part of a react-native-keyevent event that is used here. */
export interface KeyEventLike { // key down or up
  keyCode: number; // Android key code
} // end of KeyEventLike

/**
 * Turns key events into presses and holds. A press or hold runs from a key-down until the switch has stayed up for
 * RELEASE_DEBOUNCE_MS: a key-down sooner after a release is the same one, because the emulator turns a held PC key
 * into press/release pairs about 46 ms apart, and a real switch can chatter the same way. A press is stamped at its
 * key-down (handler entry) and handed over once the switch has stayed up; a hold opens Help as soon as it reaches
 * HOLD_MS with a key down, and its final release does nothing. Android repeats key-down while a key is held
 * (react-native-keyevent passes no repeat count), so a key-down while the same key is still down is auto-repeat and ignored.
 */
export class SwitchInput { // key events to presses and holds
  private readonly now: () => number; // the shared clock
  private readonly onPress: (t: number) => void; // receives each short press's key-down time
  private readonly onHold: (t: number) => void; // receives each hold's key-down time (holds of HOLD_MS or more)
  private readonly onDown: (t: number) => void; // receives each press's first key-down time at once, before press or hold is known
  private readonly down = new Set<number>(); // switch keys that are down now
  private start: number | null = null; // the first key-down time of the press or hold under way; null once the switch has stayed up
  private helped = false; // the hold under way has opened Help
  private lastRelease = -Infinity; // time of the last switch key-up
  private holdTimer: ReturnType<typeof setTimeout> | undefined; // HOLD_MS after the first key-down: Help, if a key is down then
  private upTimer: ReturnType<typeof setTimeout> | undefined; // RELEASE_DEBOUNCE_MS after the last key-up: the end

  constructor(now: () => number, onPress: (t: number) => void, onHold: (t: number) => void, onDown: (t: number) => void) { // a clock and handlers
    this.now = now; // keep the clock
    this.onPress = onPress; // keep the press handler
    this.onHold = onHold; // keep the hold handler
    this.onDown = onDown; // keep the key-down handler
  } // end of constructor

  /** Whether a switch key is down now, a bounce included. */
  held(): boolean { // asked when the "Saying it" window ends
    return this.down.size > 0; // any switch key not yet released
  } // end of held

  /** Key-down handler: the timestamp comes first, before any other work. */
  readonly keyDown = (event: KeyEventLike): void => { // from react-native-keyevent
    const t = this.now(); // timestamp at handler entry
    if (!SWITCH_KEY_CODES.has(event.keyCode) || this.down.has(event.keyCode)) return; // another key, or auto-repeat
    this.down.add(event.keyCode); // down from t
    clearTimeout(this.upTimer); // a press or hold under way goes on
    if (this.start !== null) { // within RELEASE_DEBOUNCE_MS of a release, or with the other switch key down: the same one
      if (t - this.start >= HOLD_MS) this.help(); // it reached 2 s while the key was up: Help now that it is down
      return; // no new press
    } // end of the same press or hold
    this.start = t; // a new press, from its key-down
    this.helped = false; // no Help yet
    this.holdTimer = setTimeout(() => this.help(), HOLD_MS); // 2 s on: Help, if a key is down then
    this.onDown(t); // reported at once
  }; // end of keyDown

  /** Key-up handler: the press or hold ends once the switch has stayed up for RELEASE_DEBOUNCE_MS. */
  readonly keyUp = (event: KeyEventLike): void => { // from react-native-keyevent
    const t = this.now(); // release time
    if (!this.down.delete(event.keyCode)) return; // not a switch key, or its key-down came before the listener
    if (this.down.size > 0) return; // the other switch key is still down
    this.lastRelease = t; // the end, unless a key-down comes first
    this.upTimer = setTimeout(() => this.end(), RELEASE_DEBOUNCE_MS); // stayed up: decided then
  }; // end of keyUp

  /** Cancels the pending timers; the screen calls this when it unmounts. */
  dispose(): void { // clean-up
    clearTimeout(this.holdTimer); // no Help after the screen is gone
    clearTimeout(this.upTimer); // and no press
  } // end of dispose

  private help(): void { // the hold has lasted HOLD_MS
    if (this.helped || this.down.size === 0) return; // opened already, or the key is up just now: a key-down soon after opens it
    this.helped = true; // once per hold
    this.onHold(this.start!); // Help, at its first key-down time
  } // end of help

  private end(): void { // the switch has stayed up for RELEASE_DEBOUNCE_MS
    clearTimeout(this.holdTimer); // no Help after the end
    const start = this.start!; // when it began
    this.start = null; // the next key-down starts a new press
    if (this.helped) return; // Help opened while it was held: its final release does nothing
    if (this.lastRelease - start >= HOLD_MS) this.onHold(start); // held 2 s or more, though the timer ran after the key-up
    else this.onPress(start); // a press, at its key-down time
  } // end of end
} // end of SwitchInput
