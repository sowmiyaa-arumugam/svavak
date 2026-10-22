// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The TV's reply hook (B9.1): it posts a reply that stood, plays its speech, and settles once that is over, but at most
// SAY_WAIT_MS after the reply stood, so a question's announcement never talks over Sam and never waits for ever.

import { say, SAY_WAIT_MS } from '../src/ConversationScreen'; // tested
import { postUtterance } from '../src/server'; // mocked below
import { playSpeech } from '../src/speech'; // mocked below

jest.mock('react-native-keyevent', () => ({})); // no native key events in Jest
jest.mock('../src/server', () => ({ SERVER: { url: 'http://10.0.2.2:8787', token: 'test-token' }, postUtterance: jest.fn(), postHelp: jest.fn() })); // a build with a server
jest.mock('../src/speech', () => ({ playSpeech: jest.fn(), playAnnouncement: jest.fn() })); // no audio in Jest

const REPLY = { questionId: 'q1', questionText: null, text: 'Tea', clicks: 1, durationMs: 1200 }; // a reply that stood
const AUDIO = 'http://10.0.2.2:8787/v1/utterances/u1/audio'; // where its speech is

/** Records whether `promise` has settled. */
function track(promise: Promise<unknown>): { settled: boolean } { // read after flush()
  const state = { settled: false }; // not yet
  void promise.then(() => { state.settled = true; }); // settles once
  return state; // for the test
} // end of track

/** Lets the promise callbacks run. */
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); }; // a few microtask turns

describe('say', () => { // the conversation's reply hook on the TV
  let log: jest.SpyInstance; // the dev log, kept quiet

  beforeEach(() => { // fresh mocks and timers
    jest.useFakeTimers(); // the wait's cap
    jest.mocked(postUtterance).mockReset(); // no answer set yet
    jest.mocked(playSpeech).mockReset(); // nor speech
    log = jest.spyOn(console, 'log').mockImplementation(() => {}); // captured, not printed
  }); // end of set-up

  afterEach(() => { // tidy up
    log.mockRestore(); // the console as before
    jest.useRealTimers(); // back to real timers
  }); // end of tidy-up

  it("settles once the reply's speech is over, not when it is posted", async () => { // the announcement waits for Sam
    let spoken: () => void = () => {}; // ends the speech
    jest.mocked(postUtterance).mockResolvedValue(AUDIO); // posted, with audio
    jest.mocked(playSpeech).mockReturnValue(new Promise<void>((done) => { spoken = done; })); // spoken until the test says so
    const state = track(say(REPLY)); // the reply stands
    await flush(); // posted
    expect(playSpeech).toHaveBeenCalledWith(AUDIO, 'test-token'); // its speech plays, with the device token
    expect(state.settled).toBe(false); // still being spoken
    spoken(); // it has been spoken
    await flush(); // handled
    expect(state.settled).toBe(true); // now
  }); // end of the case

  it('settles at once when the server made no audio, or the reply could not be posted', async () => { // nothing to hear
    jest.mocked(postUtterance).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Network request failed')); // no audio, then offline
    const silent = track(say(REPLY)); // the first reply
    const offline = track(say(REPLY)); // the second
    await flush(); // handled
    expect([silent.settled, offline.settled]).toEqual([true, true]); // nothing to wait for
    expect(playSpeech).not.toHaveBeenCalled(); // nothing played
  }); // end of the case

  it('settles SAY_WAIT_MS after the reply stood at most, when its speech never reports its end', async () => { // a stuck player
    jest.mocked(postUtterance).mockResolvedValue(AUDIO); // posted, with audio
    jest.mocked(playSpeech).mockReturnValue(new Promise<void>(() => {})); // never reports its end
    const state = track(say(REPLY)); // the reply stands
    await flush(); // playing
    jest.advanceTimersByTime(SAY_WAIT_MS - 1); // just inside the cap
    await flush(); // handled
    expect(state.settled).toBe(false); // still waiting
    jest.advanceTimersByTime(1); // the cap
    await flush(); // handled
    expect(state.settled).toBe(true); // the announcement may go ahead
  }); // end of the case
}); // end of say
