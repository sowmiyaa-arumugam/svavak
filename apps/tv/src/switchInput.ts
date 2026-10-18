// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The single switch (plan §4.2): Select, that is Enter on a keyboard or the centre button on a remote.

/** Android key codes that act as the switch: KEYCODE_DPAD_CENTER (remote) and KEYCODE_ENTER (keyboard). */
const SWITCH_KEY_CODES: ReadonlySet<number> = new Set([23, 66]); // centre button, Enter

/** Holding the switch at least this long opens Help instead of pressing. */
export const HOLD_MS = 2000; // 2 s

/** A key-down this soon after a release is a bounce or tremor, whether the release ended a press or a hold. */
export const RELEASE_DEBOUNCE_MS = 150; // the engine's debounce, measured from the release

/** The part of a react-native-keyevent event that is used here. */
export interface KeyEventLike { // key down or up
  keyCode: number; // Android key code
} // end of KeyEventLike

/**
 * Turns key events into presses and holds. Each press is stamped at key-down (handler entry); whether it was a press
 * or a hold is decided at key-up. Android repeats key-down while a key is held (react-native-keyevent passes no
 * repeat count), so a key-down while the same key is still down is auto-repeat and ignored.
 */
export class SwitchInput { // key events to presses and holds
  private readonly now: () => number; // the shared clock
  private readonly onPress: (t: number) => void; // receives each short press's key-down time
  private readonly onHold: (t: number) => void; // receives each hold's key-down time (holds of HOLD_MS or more)
  private readonly down = new Map<number, number>(); // switch keys that are down, with key-down times (NaN: a bounce)
  private lastRelease = -Infinity; // time of the last switch key-up

  constructor(now: () => number, onPress: (t: number) => void, onHold: (t: number) => void) { // a clock and handlers
    this.now = now; // keep the clock
    this.onPress = onPress; // keep the press handler
    this.onHold = onHold; // keep the hold handler
  } // end of constructor

  /** Key-down handler: the timestamp comes first, before any other work. */
  readonly keyDown = (event: KeyEventLike): void => { // from react-native-keyevent
    const t = this.now(); // timestamp at handler entry
    if (!SWITCH_KEY_CODES.has(event.keyCode) || this.down.has(event.keyCode)) return; // another key, or auto-repeat
    const bounce = t - this.lastRelease < RELEASE_DEBOUNCE_MS; // too soon after a release: tremor or contact bounce
    this.down.set(event.keyCode, bounce ? NaN : t); // down since t; a bounce stays down too, so its repeats are ignored
  }; // end of keyDown

  /** Key-up handler: a press stamped at its key-down, or a hold. */
  readonly keyUp = (event: KeyEventLike): void => { // from react-native-keyevent
    const t = this.now(); // release time
    const start = this.down.get(event.keyCode); // when this key went down
    if (start === undefined) return; // not a switch key, or its key-down came before the listener
    this.down.delete(event.keyCode); // released
    this.lastRelease = t; // the next key-down must come at least RELEASE_DEBOUNCE_MS later, also after a bounce
    if (Number.isNaN(start)) return; // a bounce ends: neither a press nor a hold
    if (t - start >= HOLD_MS) this.onHold(start); // held 2 s or more: Help, at its key-down time
    else this.onPress(start); // a press, at its key-down time
  }; // end of keyUp
} // end of SwitchInput
