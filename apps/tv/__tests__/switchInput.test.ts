// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Key handling: Select keys become presses stamped at key-down and handed over once the switch has stayed up for 150 ms;
// a key-down within 150 ms of a release is the same press or hold; a 2 s hold opens Help while held; no auto-repeat.

import { CONFIG } from '../src/conversation'; // the screen's engine parameters
import { HOLD_MS, RELEASE_DEBOUNCE_MS, SwitchInput, type KeyEventLike } from '../src/switchInput'; // tested

const ENTER = { keyCode: 66 }; // KEYCODE_ENTER: Enter on the emulator keyboard
const CENTER = { keyCode: 23 }; // KEYCODE_DPAD_CENTER: the remote's centre button
const LEFT = { keyCode: 21 }; // KEYCODE_DPAD_LEFT: not the switch

let time = 0; // the fake shared clock
let presses: number[] = []; // press timestamps the handler received
let holds: number[] = []; // key-down times of the holds the handler received
let helpAt: { time: number; held: boolean }[] = []; // when each hold was handed over, and whether a switch key was down then
let downs: number[] = []; // key-down times the key-down handler received
let input: SwitchInput; // under test

beforeEach(() => { // fresh input at time 1000
  jest.useFakeTimers(); // the 150 ms and 2 s timers run on a fake clock, moved with `time` (wait)
  time = 1000; // start time
  presses = []; // nothing pressed
  holds = []; // nothing held
  helpAt = []; // no Help yet
  downs = []; // nothing down
  input = new SwitchInput(() => time, (t) => presses.push(t), (t) => { holds.push(t); helpAt.push({ time, held: input.held() }); }, (t) => downs.push(t)); // records presses, holds, key-downs
}); // end of set-up

afterEach(() => { // tidy up
  input.dispose(); // no timer left behind
  jest.useRealTimers(); // back to real timers
}); // end of tidy-up

/** Moves the shared clock and the timers on together by `ms`, a millisecond at a time, so a timer sees the time it fires at. */
function wait(ms: number): void { // time passes
  for (let i = 0; i < ms; i++) { // each millisecond
    time += 1; // the clock the handlers read
    jest.advanceTimersByTime(1); // the timers they set
  } // end of the milliseconds
} // end of wait

/** Holds `key` down from now for `ms`, then releases it. */
function tap(key: KeyEventLike, ms: number): void { // one key-down and key-up
  input.keyDown(key); // down
  wait(ms); // held
  input.keyUp(key); // up
} // end of tap

describe('SwitchInput', () => { // key events to presses and holds
  it('treats Enter and the centre button as the switch, and no other key', () => { // key mapping
    tap(ENTER, 100); // Enter at 1000
    wait(900); // to 2000
    tap(CENTER, 100); // centre button at 2000
    wait(900); // to 3000
    tap(LEFT, 100); // D-pad left
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(presses).toEqual([1000, 2000]); // two presses, no third
    expect(holds).toEqual([]); // and no hold
  }); // end of the case

  it('stamps a short press at key-down and hands it over once the key has stayed up for 150 ms', () => { // decided after the release
    input.keyDown(ENTER); // down at 1000
    wait(180); // a typical 180 ms press
    input.keyUp(ENTER); // up
    wait(RELEASE_DEBOUNCE_MS - 1); // up for 149 ms
    expect(presses).toEqual([]); // nothing yet: a key-down now would continue it
    wait(1); // up for 150 ms
    expect(presses).toEqual([1000]); // the press, at its key-down time
  }); // end of the case

  it('treats a key-down within 150 ms after a release as the same press', () => { // chatter
    tap(ENTER, 80); // down at 1000, up at 1080
    wait(RELEASE_DEBOUNCE_MS - 1); // up for 149 ms
    tap(ENTER, 40); // down again at 1229: the same press
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(presses).toEqual([1000]); // one press, at its first key-down
    expect(downs).toEqual([1000]); // and one key-down notice
  }); // end of the case

  it('treats the K3 pattern of a held PC key, 57 press/release pairs about 46 ms apart, as one hold: Help at 2 s, while down', () => { // test-results/k3 (getevent)
    for (let pair = 0; pair < 57; pair++) { // the emulator turns the held key into pairs
      tap(ENTER, 45); // down for about 45 ms
      wait(1); // up for under a millisecond (0.03 to 0.4 ms in the capture), here 1 ms
    } // end of the pairs
    expect(helpAt).toEqual([{ time: 3000, held: true }]); // Help 2 s after the first key-down, with the key down
    expect(holds).toEqual([1000]); // stamped at that key-down
    wait(RELEASE_DEBOUNCE_MS); // the final release, then nothing
    expect(holds).toEqual([1000]); // no second Help
    expect(presses).toEqual([]); // and no press, at any release
    expect(downs).toEqual([1000]); // one key-down notice in all
  }); // end of the case

  it('opens Help as soon as the switch has been held for 2 s, before it comes up, and ignores the final release', () => { // the hold
    tap(ENTER, HOLD_MS - 1); // 1999 ms: still a press
    wait(1000); // later
    input.keyDown(ENTER); // a hold from 3999
    wait(HOLD_MS - 1); // 1999 ms held
    expect(holds).toEqual([]); // not yet
    wait(1); // 2 s held
    expect(holds).toEqual([3999]); // Help now, stamped at its key-down
    wait(500); // held on
    input.keyUp(ENTER); // released
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(presses).toEqual([1000]); // only the first was a press
    expect(holds).toEqual([3999]); // and the release changed nothing
  }); // end of the case

  it('opens Help at the next key-down when the 2 s mark falls while the key is briefly up', () => { // a chatter gap at 2 s
    tap(ENTER, HOLD_MS - 10); // down at 1000, up at 2990
    wait(20); // the 2 s mark passes with the key up
    expect(holds).toEqual([]); // no Help while it is up
    input.keyDown(ENTER); // down again at 3010: the same hold
    expect(holds).toEqual([1000]); // Help now
    wait(100); // held
    input.keyUp(ENTER); // released
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(presses).toEqual([]); // and no press at the end
  }); // end of the case

  it('hands over a press that came up just before 2 s and stayed up, not Help', () => { // released in time
    tap(ENTER, HOLD_MS - 10); // 1990 ms
    wait(RELEASE_DEBOUNCE_MS); // up past the 2 s mark
    expect(presses).toEqual([1000]); // a press
    expect(holds).toEqual([]); // not Help
  }); // end of the case

  it('ignores auto-repeat while the key is held, through a hold', () => { // held key
    input.keyDown(ENTER); // the press, at 1000
    wait(500); // Android's first repeat comes about 500 ms later
    input.keyDown(ENTER); // the first repeat
    while (time < 1000 + HOLD_MS + 100) { // then a repeat every 50 ms while the key is held
      wait(50); // repeat interval
      input.keyDown(ENTER); // a repeat
    } // end of the repeats
    input.keyUp(ENTER); // released after 2.1 s
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(holds).toEqual([1000]); // one hold, stamped at its key-down
    expect(presses).toEqual([]); // and no press from the repeats
    wait(400); // later
    const later = time; // a new press
    tap(ENTER, 100); // short
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(presses).toEqual([later]); // counted at its own key-down
  }); // end of the case

  it('ignores a key-up whose key-down it never saw', () => { // down before the listener was attached
    input.keyUp(ENTER); // a release only
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(presses).toEqual([]); // no press
    expect(holds).toEqual([]); // no hold
  }); // end of the case

  it('stamps the press at handler entry', () => { // timestamp first
    const now = jest.fn().mockReturnValueOnce(100).mockReturnValue(999); // key-down reads 100, key-up 999
    const stamped: number[] = []; // received timestamps
    const switchInput = new SwitchInput(now, (t) => stamped.push(t), () => {}, () => {}); // under test
    switchInput.keyDown(ENTER); // down
    switchInput.keyUp(ENTER); // up 899 ms later
    jest.advanceTimersByTime(RELEASE_DEBOUNCE_MS); // stayed up
    expect(stamped).toEqual([100]); // the time read on key-down entry
    expect(now).toHaveBeenCalledTimes(2); // once per handler
  }); // end of the case

  it('counts a key-down within 150 ms after a release as part of the hold or the long press before it', () => { // release bounce
    tap(ENTER, HOLD_MS + 100); // a hold from 1000 (Help at 3000), released at 3100
    wait(20); // a bounce 20 ms after the release
    tap(ENTER, 20); // down at 3120, up at 3140: the same hold
    expect(holds).toEqual([1000]); // the hold opened Help, once
    expect(presses).toEqual([]); // the bounce did not count
    wait(RELEASE_DEBOUNCE_MS); // 150 ms after the bounce's release: the hold is over
    tap(ENTER, 100); // a real press at 3290, released at 3390
    wait(610); // to 4000
    tap(ENTER, 600); // a long press, released at 4600
    wait(RELEASE_DEBOUNCE_MS - 1); // tremor 149 ms after that release
    tap(ENTER, 50); // down and up: the same long press
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(presses).toEqual([3290, 4000]); // the press and the long press, but not the tremor
  }); // end of the case

  it('restarts the 150 ms at every release, so a burst of contacts counts once', () => { // tremor burst
    tap(ENTER, 80); // a press at 1000, released at 1080
    wait(20); // 20 ms later
    tap(ENTER, 40); // a bounce, released at 1140
    wait(95); // 155 ms after the press's release, but 95 ms after the bounce's
    tap(ENTER, 10); // another contact
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(presses).toEqual([1000]); // one press
  }); // end of the case

  it('treats a key-down 100 ms after a release as the same hold, so holding it on opens Help 2 s after the first key-down', () => { // a bounce held on
    tap(ENTER, 100); // down at 1000, up at 1100
    wait(100); // 100 ms after the release
    input.keyDown(ENTER); // pressed again: the same hold
    while (time < 3500) { wait(50); input.keyDown(ENTER); } // held, with Android's repeats
    input.keyUp(ENTER); // released at 3500
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(holds).toEqual([1000]); // Help, from the first key-down
    expect(helpAt).toEqual([{ time: 3000, held: true }]); // at 2 s, with the key down
    expect(presses).toEqual([]); // and no press
  }); // end of the case

  it('reports each new press at its key-down at once, but not auto-repeat, a key-down that continues one, or another key', () => { // key-down notices
    input.keyDown(ENTER); // down at 1000
    expect(downs).toEqual([1000]); // reported before its key-up, at its key-down time
    wait(500); // Android's first repeat
    input.keyDown(ENTER); // auto-repeat
    input.keyDown(LEFT); // not the switch
    wait(100); // released at 1600
    input.keyUp(ENTER); // a press, once the key stays up
    wait(20); // 20 ms after the release
    tap(ENTER, 20); // the same press, continued
    wait(360); // to 2000
    tap(CENTER, 100); // the centre button
    wait(RELEASE_DEBOUNCE_MS); // stayed up
    expect(downs).toEqual([1000, 2000]); // the two new presses only
    expect(presses).toEqual([1000, 2000]); // which also were handed over as presses
  }); // end of the case

  it('tells whether a switch key is down now, a bounce included', () => { // held()
    expect(input.held()).toBe(false); // nothing down
    input.keyDown(LEFT); // not the switch
    expect(input.held()).toBe(false); // still nothing
    input.keyDown(ENTER); // down
    expect(input.held()).toBe(true); // held
    wait(100); // a short press
    input.keyUp(ENTER); // up
    expect(input.held()).toBe(false); // released
    wait(20); // 20 ms after the release
    input.keyDown(ENTER); // a bounce
    expect(input.held()).toBe(true); // a switch key is down all the same
    input.keyUp(ENTER); // the bounce ends
    expect(input.held()).toBe(false); // nothing down
  }); // end of the case

  it('hands nothing over after dispose', () => { // the screen unmounted
    tap(ENTER, 100); // a press, not handed over yet, and its 2 s timer
    input.dispose(); // the screen goes away
    wait(HOLD_MS); // long after
    expect(presses).toEqual([]); // no press
    expect(holds).toEqual([]); // no Help
  }); // end of the case

  it("waits the engine's debounce after a release", () => { // one value for both checks
    expect(RELEASE_DEBOUNCE_MS).toBe(CONFIG.debounceMs); // 150 ms, the engine's debounce
  }); // end of the case
}); // end of SwitchInput
