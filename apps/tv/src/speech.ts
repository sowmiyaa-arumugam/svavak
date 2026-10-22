// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Speech playback: the server's audio (Polly's MP3, or the mock's WAV tone), played with Expo's audio module:
// a reply's speech, and a question's spoken announcement (B9), each on a player of its own.

import { createAudioPlayer } from 'expo-audio'; // Expo's audio module

/** An announcement that has not started playing this long after it was asked for is given up, so the scan is not held back. */
export const ANNOUNCE_START_MS = 2000; // the audio is a few kilobytes from the server on the local network

let stopReply: (() => void) | null = null; // stops the reply's speech now playing, if any

/**
 * Plays a reply's speech at `url`, fetched with the device token, stopping the previous reply's. Settles once it has
 * been spoken, can't be played, or a newer reply replaces it, so a question's announcement can wait for it (B9.1).
 */
export function playSpeech(url: string, token: string): Promise<void> { // one reply's speech
  stopReply?.(); // the previous one stops at once, and its promise settles
  return new Promise((resolve) => { // settles once, at its end
    const stop = play('speech', url, token, resolve, null); // on a player of its own; never given up for being slow to start
    stopReply = () => { stop(); resolve(); }; // a newer reply ends it
  }); // end of the promise
} // end of playSpeech

/** Plays a question's announcement at `url` on its own player, so a reply's speech never cuts it off; see play(). */
export function playAnnouncement(url: string, token: string, onEnd: () => void): () => void { // the conversation's announcement hook
  return play('announcement', url, token, onEnd, ANNOUNCE_START_MS); // logged as [announcement]; given up if slow to start
} // end of playAnnouncement

/**
 * Plays the audio at `url`, fetched with the device token, on a player of its own. Calls onEnd once, from a player
 * update or a timer, when it has finished or can't be played: the player went idle (ExoPlayer does on a load error) or
 * it has not started within `startMs` (when given). Returns a function that stops it at once, after which onEnd is not called.
 * Every end or stop pauses, removes and releases the player: on Android remove() alone neither stops nor frees it.
 */
function play(what: 'speech' | 'announcement', url: string, token: string, onEnd: () => void, startMs: number | null): () => void { // one sound
  const player = createAudioPlayer({ uri: url, headers: { Authorization: `Bearer ${token}` } }); // the audio routes need the token too
  let started = false; // "playing" is logged once
  let done = false; // ended or stopped: nothing more happens
  const release = (why: string) => { done = true; clearTimeout(timer); player.pause(); player.remove(); player.release(); if (__DEV__) console.log(`[${what}] ${why}`); }; // silent at once, out of the module's list, and its native player freed; the Metro log says why
  const end = (why: string) => { if (done) return; release(why); onEnd(); }; // once
  const timer = startMs === null ? undefined : setTimeout(() => end('not played'), startMs); // never started: given up
  player.addListener('playbackStatusUpdate', (status) => { // loading, playing, finishing and so on
    if (done) return; // ended or stopped already
    if (status.playing && !started) { started = true; clearTimeout(timer); if (__DEV__) console.log(`[${what}] playing`); } // it started: it may take as long as it takes
    if (status.didJustFinish) end('finished'); // reached the end; expo-audio can report it twice
    else if (status.playbackState === 'idle') end('not played'); // the audio could not be loaded
  }); // end of the listener
  player.play(); // starts as soon as enough is loaded
  return () => { if (!done) release('stopped'); }; // a press, Help, a newer question or reply, or the screen going stops it
} // end of play
