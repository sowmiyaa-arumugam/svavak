// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Key handling: Select keys become presses stamped at handler entry; auto-repeat is ignored; the engine debounces.

import { DEFAULT_CONFIG, Engine } from 'switchclock'; // the engine
import { optionsFor } from '../src/conversation'; // the screen's options
import { QUESTIONS } from '../src/questions'; // the fixture
import { SwitchInput } from '../src/switchInput'; // tested

const ENTER = { keyCode: 66 }; // KEYCODE_ENTER: Enter on the emulator keyboard
const CENTER = { keyCode: 23 }; // KEYCODE_DPAD_CENTER: the remote's centre button
const LEFT = { keyCode: 21 }; // KEYCODE_DPAD_LEFT: not the switch

let time = 0; // the fake shared clock
let presses: number[] = []; // timestamps the handler received
let input: SwitchInput; // under test

beforeEach(() => { // fresh input at time 1000
  time = 1000; // start time
  presses = []; // nothing pressed
  input = new SwitchInput(() => time, (t) => presses.push(t)); // records presses
}); // end of set-up

describe('SwitchInput', () => { // key events to presses
  it('treats Enter and the centre button as the switch, and no other key', () => { // key mapping
    input.keyDown(ENTER); // Enter
    input.keyUp(ENTER); // released
    time = 2000; // later
    input.keyDown(CENTER); // centre button
    input.keyUp(CENTER); // released
    time = 3000; // later
    input.keyDown(LEFT); // D-pad left
    input.keyUp(LEFT); // released
    expect(presses).toEqual([1000, 2000]); // two presses, no third
  }); // end of the case

  it('ignores auto-repeat: key-downs while the key is still down', () => { // held key
    input.keyDown(ENTER); // the press, at 1000
    time += 500; // Android's first repeat comes about 500 ms later, well past the 150 ms debounce
    input.keyDown(ENTER); // the first repeat
    for (let i = 0; i < 5; i++) { // then a repeat every 50 ms while the key is held
      time += 50; // repeat interval
      input.keyDown(ENTER); // a repeat
    } // end of the repeats
    input.keyUp(ENTER); // released, at 1750
    time += 400; // later
    input.keyDown(ENTER); // a new press, at 2150
    expect(presses).toEqual([1000, 2150]); // the first press and the new one only
  }); // end of the case

  it('stamps the press at handler entry', () => { // timestamp first
    const now = jest.fn().mockReturnValueOnce(100).mockReturnValue(999); // later reads would return 999
    const stamped: number[] = []; // received timestamps
    new SwitchInput(now, (t) => stamped.push(t)).keyDown(ENTER); // one press
    expect(stamped).toEqual([100]); // the time read on entry
    expect(now).toHaveBeenCalledTimes(1); // and only that one
  }); // end of the case

  it("hands presses to the engine, whose 150 ms debounce drops a press 100 ms after an accepted one", () => { // debounce
    const engine = new Engine({ ...DEFAULT_CONFIG, threshold: 2 }, () => time); // no commit by threshold, and two presses stay below K_max
    engine.setOptions(optionsFor(QUESTIONS[0]!)); // the screen's 12 options
    const accepted: boolean[] = []; // the engine's verdicts
    const switchToEngine = new SwitchInput(() => time, (t) => accepted.push(engine.click(t).accepted)); // wired
    for (const at of [2000, 2100, 2300]) { // three presses
      time = at; // press time
      switchToEngine.keyDown(ENTER); // press
      switchToEngine.keyUp(ENTER); // release
    } // end of the presses
    expect(DEFAULT_CONFIG.debounceMs).toBe(150); // plan Table 11
    expect(accepted).toEqual([true, false, true]); // 100 ms after an accepted press is dropped; 300 ms is not
  }); // end of the case
}); // end of SwitchInput
