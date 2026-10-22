// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Speech playback: the audio request carries the device token, and dev builds log when the speech plays and ends.

import { createAudioPlayer } from 'expo-audio'; // mocked below
import { ANNOUNCE_START_MS, playAnnouncement, playSpeech } from '../src/speech'; // tested

jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn() })); // no native audio module in Jest

type Status = { playing: boolean; didJustFinish: boolean; playbackState?: string }; // the AudioStatus fields the code reads

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

describe('playAnnouncement', () => { // B9: a question's spoken announcement
  const URL = 'http://10.0.2.2:8787/v1/questions/q1/announcement'; // where it is
  let players: { addListener: jest.Mock; play: jest.Mock; pause: jest.Mock; remove: jest.Mock; release: jest.Mock; status: (status: Status) => void }[] = []; // the players handed out, newest last
  const freed = (i: number) => [players[i]!.pause, players[i]!.remove, players[i]!.release].map((f) => f.mock.calls.length); // [pause, remove, release] calls: [1, 1, 1] once silenced and freed
  let log: jest.SpyInstance; // the dev log

  beforeEach(() => { // fresh fakes
    jest.useFakeTimers(); // the start limit
    players = []; // none yet
    jest.mocked(createAudioPlayer).mockImplementation(() => { // a new fake player each time
      const player = { addListener: jest.fn((_: string, listener: (status: Status) => void) => { player.status = listener; }), play: jest.fn(), pause: jest.fn(), remove: jest.fn(), release: jest.fn(), status: (_status: Status) => {} }; // its listener, once added
      players.push(player); // handed out
      return player as unknown as ReturnType<typeof createAudioPlayer>; // as the module's type
    }); // end of the fake
    log = jest.spyOn(console, 'log').mockImplementation(() => {}); // captured, not printed
  }); // end of set-up

  afterEach(() => { // tidy up
    log.mockRestore(); // the console as before
    jest.useRealTimers(); // back to real timers
  }); // end of tidy-up

  it('plays it with the device token, and calls onEnd once when it has finished, then releases its player', () => { // the usual case
    const ended = jest.fn(); // the conversation's hook
    playAnnouncement(URL, 'test-token', ended); // a question arrives
    expect(createAudioPlayer).toHaveBeenLastCalledWith({ uri: URL, headers: { Authorization: 'Bearer test-token' } }); // the token
    expect(players[0]!.play).toHaveBeenCalled(); // started
    players[0]!.status({ playing: true, didJustFinish: false, playbackState: 'ready' }); // playing
    jest.advanceTimersByTime(10 * ANNOUNCE_START_MS); // a long announcement: the start limit no longer applies
    expect(ended).not.toHaveBeenCalled(); // still playing
    players[0]!.status({ playing: false, didJustFinish: true, playbackState: 'ended' }); // the end
    players[0]!.status({ playing: false, didJustFinish: true, playbackState: 'ended' }); // the end again, as expo-audio may send it
    expect(ended).toHaveBeenCalledTimes(1); // once
    expect(freed(0)).toEqual([1, 1, 1]); // silenced, out of the module's list and freed
    expect(log.mock.calls).toEqual([['[announcement] playing'], ['[announcement] finished']]); // the dev log
  }); // end of the case

  it('calls onEnd once when it cannot be played: the player goes idle, or it has not started within the limit', () => { // failures
    const failed = jest.fn(); // the first announcement's hook
    playAnnouncement(URL, 'test-token', failed); // a 404, say
    players[0]!.status({ playing: false, didJustFinish: false, playbackState: 'idle' }); // ExoPlayer goes idle on a load error
    expect(failed).toHaveBeenCalledTimes(1); // the scan need not wait
    expect(freed(0)).toEqual([1, 1, 1]); // silenced and freed
    const stalled = jest.fn(); // the second announcement's hook
    playAnnouncement(URL, 'test-token', stalled); // a server that does not answer
    players[1]!.status({ playing: false, didJustFinish: false, playbackState: 'buffering' }); // loading
    jest.advanceTimersByTime(ANNOUNCE_START_MS - 1); // just inside the limit
    expect(stalled).not.toHaveBeenCalled(); // it may still start
    jest.advanceTimersByTime(1); // the limit
    expect(stalled).toHaveBeenCalledTimes(1); // given up
    expect(freed(1)).toEqual([1, 1, 1]); // silenced, so a late start is never heard, and freed
    players[1]!.status({ playing: true, didJustFinish: false, playbackState: 'ready' }); // a late start changes nothing
    expect(stalled).toHaveBeenCalledTimes(1); // still once
    expect(log.mock.calls).toEqual([['[announcement] not played'], ['[announcement] not played']]); // the dev log
  }); // end of the case

  it('stops at once when stopped, and never calls onEnd after that', () => { // a press, Help, a newer question or the screen going
    const ended = jest.fn(); // the conversation's hook
    const stop = playAnnouncement(URL, 'test-token', ended); // playing
    players[0]!.status({ playing: true, didJustFinish: false, playbackState: 'ready' }); // playing
    stop(); // stopped
    expect(freed(0)).toEqual([1, 1, 1]); // paused at once (remove alone does not stop an Android player), and freed
    stop(); // stopped again, as quiet() may
    expect(freed(0)).toEqual([1, 1, 1]); // nothing more
    players[0]!.status({ playing: false, didJustFinish: true, playbackState: 'ended' }); // a late status
    jest.advanceTimersByTime(10 * ANNOUNCE_START_MS); // long after
    expect(ended).not.toHaveBeenCalled(); // never
    expect(log.mock.calls).toEqual([['[announcement] playing'], ['[announcement] stopped']]); // the dev log
  }); // end of the case

  it("uses its own player, so a reply's speech and an announcement never cut each other off", () => { // two players
    playAnnouncement(URL, 'test-token', () => {}); // an announcement plays
    playSpeech('http://10.0.2.2:8787/v1/utterances/u1/audio', 'test-token'); // a reply's speech starts meanwhile
    playAnnouncement(URL, 'test-token', () => {}); // and another announcement
    expect(players.map((_, i) => freed(i))).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]); // nothing was stopped by another
  }); // end of the case
}); // end of playAnnouncement
