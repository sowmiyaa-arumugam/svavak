// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Speech playback: the audio request carries the device token, and dev builds log when the speech plays and ends.

import { createAudioPlayer } from 'expo-audio'; // mocked below
import { playSpeech } from '../src/speech'; // tested

jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn() })); // no native audio module in Jest

type Status = { playing: boolean; didJustFinish: boolean }; // the AudioStatus fields the log reads

describe('playSpeech', () => { // one reply's speech
  it('fetches the audio with the device token, and logs once when it starts playing and when it finishes', () => { // dev log
    let onStatus: (status: Status) => void = () => {}; // the player's status listener, once added
    const player = { addListener: jest.fn((_: string, listener: (status: Status) => void) => { onStatus = listener; }), play: jest.fn(), remove: jest.fn() }; // fake
    jest.mocked(createAudioPlayer).mockReturnValue(player as unknown as ReturnType<typeof createAudioPlayer>); // handed out by the module
    const log = jest.spyOn(console, 'log').mockImplementation(() => {}); // captured, not printed
    playSpeech('http://10.0.2.2:8787/v1/utterances/u1/audio', 'test-token'); // a reply's speech
    expect(createAudioPlayer).toHaveBeenCalledWith({ uri: 'http://10.0.2.2:8787/v1/utterances/u1/audio', headers: { Authorization: 'Bearer test-token' } }); // token
    expect(player.addListener).toHaveBeenCalledWith('playbackStatusUpdate', expect.any(Function)); // status updates
    expect(player.play).toHaveBeenCalled(); // started
    onStatus({ playing: false, didJustFinish: false }); // loading
    onStatus({ playing: true, didJustFinish: false }); // playing
    onStatus({ playing: true, didJustFinish: false }); // a later update while it plays
    onStatus({ playing: false, didJustFinish: true }); // the end
    onStatus({ playing: false, didJustFinish: true }); // the end again: expo-audio sent it twice on the emulator
    expect(log.mock.calls).toEqual([['[speech] playing'], ['[speech] finished']]); // once each
    log.mockRestore(); // the console as before
  }); // end of the case
}); // end of playSpeech
