// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The single switch (plan §4.2): Select, that is Enter on a keyboard or the centre button on a remote.

/** Android key codes that act as the switch: KEYCODE_DPAD_CENTER (remote) and KEYCODE_ENTER (keyboard). */
const SWITCH_KEY_CODES: ReadonlySet<number> = new Set([23, 66]); // centre button, Enter

/** The part of a react-native-keyevent event that is used here. */
export interface KeyEventLike { // key down or up
  keyCode: number; // Android key code
} // end of KeyEventLike

/**
 * Turns key events into switch presses: one per physical press, stamped at handler entry.
 * Android repeats key-down while a key is held (react-native-keyevent passes no repeat count), so a key-down
 * while the same key is still down is auto-repeat and ignored. The engine's 150 ms debounce then applies to presses.
 */
export class SwitchInput { // key events to presses
  private readonly now: () => number; // the shared clock
  private readonly onPress: (t: number) => void; // receives each press's timestamp
  private readonly held = new Set<number>(); // switch keys that are down

  constructor(now: () => number, onPress: (t: number) => void) { // wire to a clock and a press handler
    this.now = now; // keep the clock
    this.onPress = onPress; // keep the handler
  } // end of constructor

  /** Key-down handler: the timestamp comes first, before any other work. */
  readonly keyDown = (event: KeyEventLike): void => { // from react-native-keyevent
    const t = this.now(); // timestamp at handler entry
    if (!SWITCH_KEY_CODES.has(event.keyCode) || this.held.has(event.keyCode)) return; // another key, or auto-repeat
    this.held.add(event.keyCode); // down until its key-up
    this.onPress(t); // one press
  }; // end of keyDown

  /** Key-up handler: the key can press again. */
  readonly keyUp = (event: KeyEventLike): void => { // from react-native-keyevent
    this.held.delete(event.keyCode); // released
  }; // end of keyUp
} // end of SwitchInput
