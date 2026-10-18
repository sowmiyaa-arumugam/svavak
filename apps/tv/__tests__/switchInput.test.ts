// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Key handling: Select keys become presses stamped at key-down and decided at key-up; a 2 s hold is Help; no auto-repeat;
// no bounce just after a release.

import { CONFIG } from '../src/conversation'; // the screen's engine parameters
import { HOLD_MS, RELEASE_DEBOUNCE_MS, SwitchInput, type KeyEventLike } from '../src/switchInput'; // tested

const ENTER = { keyCode: 66 }; // KEYCODE_ENTER: Enter on the emulator keyboard
const CENTER = { keyCode: 23 }; // KEYCODE_DPAD_CENTER: the remote's centre button
const LEFT = { keyCode: 21 }; // KEYCODE_DPAD_LEFT: not the switch

let time = 0; // the fake shared clock
let presses: number[] = []; // press timestamps the handler received
let holds: number[] = []; // key-down times of the holds the handler received
let input: SwitchInput; // under test

beforeEach(() => { // fresh input at time 1000
  time = 1000; // start time
  presses = []; // nothing pressed
  holds = []; // nothing held
  input = new SwitchInput(() => time, (t) => presses.push(t), (t) => holds.push(t)); // records presses and holds
}); // end of set-up

/** Holds `key` down from now for `ms`, then releases it. */
function tap(key: KeyEventLike, ms: number): void { // one key-down and key-up
  input.keyDown(key); // down
  time += ms; // held
  input.keyUp(key); // up
} // end of tap

describe('SwitchInput', () => { // key events to presses and holds
  it('treats Enter and the centre button as the switch, and no other key', () => { // key mapping
    tap(ENTER, 100); // Enter at 1000
    time = 2000; // later
    tap(CENTER, 100); // centre button at 2000
    time = 3000; // later
    tap(LEFT, 100); // D-pad left
    expect(presses).toEqual([1000, 2000]); // two presses, no third
    expect(holds).toEqual([]); // and no hold
  }); // end of the case

  it('stamps a short press at key-down and hands it over at key-up', () => { // decided at key-up
    input.keyDown(ENTER); // down at 1000
    time = 1180; // a typical 180 ms press
    expect(presses).toEqual([]); // nothing yet: it could still become a hold
    input.keyUp(ENTER); // up
    expect(presses).toEqual([1000]); // the press, at its key-down time
  }); // end of the case

  it('opens Help instead when the switch is held for 2 s or more', () => { // the hold
    tap(ENTER, HOLD_MS - 1); // 1999 ms: still a press
    time += 1000; // later
    tap(ENTER, HOLD_MS); // 2000 ms: a hold
    expect(presses).toEqual([1000]); // only the first was a press
    expect(holds).toEqual([3999]); // the second opened Help, stamped at its key-down
  }); // end of the case

  it('ignores auto-repeat while the key is held, through a hold', () => { // held key
    input.keyDown(ENTER); // the press, at 1000
    time += 500; // Android's first repeat comes about 500 ms later
    input.keyDown(ENTER); // the first repeat
    while (time < 1000 + HOLD_MS + 100) { // then a repeat every 50 ms while the key is held
      time += 50; // repeat interval
      input.keyDown(ENTER); // a repeat
    } // end of the repeats
    input.keyUp(ENTER); // released after 2.1 s
    expect(holds).toEqual([1000]); // one hold, stamped at its key-down
    expect(presses).toEqual([]); // and no press from the repeats
    const later = (time += 400); // a new press
    tap(ENTER, 100); // short
    expect(presses).toEqual([later]); // counted at its own key-down
  }); // end of the case

  it('ignores a key-up whose key-down it never saw', () => { // down before the listener was attached
    input.keyUp(ENTER); // a release only
    expect(presses).toEqual([]); // no press
    expect(holds).toEqual([]); // no hold
  }); // end of the case

  it('stamps the press at handler entry', () => { // timestamp first
    const now = jest.fn().mockReturnValueOnce(100).mockReturnValue(999); // key-down reads 100, key-up 999
    const stamped: number[] = []; // received timestamps
    const switchInput = new SwitchInput(now, (t) => stamped.push(t), () => {}); // under test
    switchInput.keyDown(ENTER); // down
    switchInput.keyUp(ENTER); // up 899 ms later
    expect(stamped).toEqual([100]); // the time read on key-down entry
    expect(now).toHaveBeenCalledTimes(2); // once per handler
  }); // end of the case

  it('ignores a key-down within 150 ms after a release, after a hold or a long press', () => { // release bounce
    tap(ENTER, HOLD_MS + 100); // a hold from 1000, released at 3100
    time += 20; // a bounce 20 ms after the release
    tap(ENTER, 20); // down at 3120, up at 3140
    expect(holds).toEqual([1000]); // the hold opened Help
    expect(presses).toEqual([]); // the bounce did not count
    time = 3140 + RELEASE_DEBOUNCE_MS; // 150 ms after the bounce's release
    tap(ENTER, 100); // a real press at 3290, released at 3390
    time = 4000; // later
    tap(ENTER, 600); // a long press, released at 4600
    time = 4600 + RELEASE_DEBOUNCE_MS - 1; // tremor 149 ms after that release
    tap(ENTER, 50); // down and up
    expect(presses).toEqual([3290, 4000]); // the press and the long press, but not the tremor
  }); // end of the case

  it('restarts the 150 ms at every release, so a burst of contacts counts once', () => { // tremor burst
    tap(ENTER, 80); // a press at 1000, released at 1080
    time = 1100; // 20 ms later
    tap(ENTER, 40); // a bounce, released at 1140
    time = 1235; // 155 ms after the press's release, but 95 ms after the bounce's
    tap(ENTER, 10); // another contact
    expect(presses).toEqual([1000]); // one press
  }); // end of the case

  it("ignores a bounce's auto-repeat, even when it is held past 2 s", () => { // held bounce
    tap(ENTER, 100); // a press at 1000, released at 1100
    time = 1200; // 100 ms after the release
    input.keyDown(ENTER); // pressed again: a bounce
    for (time = 1700; time < 3500; time += 50) input.keyDown(ENTER); // held, with Android's repeats
    input.keyUp(ENTER); // released at 3500
    expect(presses).toEqual([1000]); // no late press from the repeats
    expect(holds).toEqual([]); // and no hold: it began as a bounce
  }); // end of the case

  it("waits the engine's debounce after a release", () => { // one value for both checks
    expect(RELEASE_DEBOUNCE_MS).toBe(CONFIG.debounceMs); // 150 ms (plan Table 11)
  }); // end of the case
}); // end of SwitchInput
