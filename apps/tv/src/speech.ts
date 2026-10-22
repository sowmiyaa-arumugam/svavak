// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Speech playback (plan §4.2): the server's audio (Polly's MP3, or the mock's WAV tone), played with Expo's audio module:
// a reply's speech, and a question's spoken announcement (B9) on a player of its own.

import { createAudioPlayer, type AudioPlayer } from 'expo-audio'; // Expo's audio module

/** An announcement that has not started playing this long after it was asked for is given up, so the scan is not held back. */
export const ANNOUNCE_START_MS = 2000; // the audio is a few kilobytes from the server on the local network

let player: AudioPlayer | null = null; // the one player; a new reply replaces it

/** Plays the audio at `url`, fetched with the device token, stopping whatever played before. */
export function playSpeech(url: string, token: string): void { // one reply's speech
  player?.remove(); // stop and release the previous one
  player = createAudioPlayer({ uri: url, headers: { Authorization: `Bearer ${token}` } }); // the audio route needs the token too
  if (__DEV__) { // dev builds: the Metro log shows whether the speech really played
    let started = false; // "playing" is logged once
    let finished = false; // and "finished" too: expo-audio can report the end twice
    player.addListener('playbackStatusUpdate', (status) => { // loading, playing, finishing and so on
      if (status.playing && !started) { started = true; console.log('[speech] playing'); } // the first update that plays
      if (status.didJustFinish && !finished) { finished = true; console.log('[speech] finished'); } // reached the end
    }); // end of the listener
  } // end of the dev log
  player.play(); // starts as soon as enough is loaded
} // end of playSpeech

/**
 * Plays a question's announcement at `url`, fetched with the device token, on its own player, so a reply's speech
 * never cuts it off. Calls onEnd once, from a player update or a timer, when it has finished or can't be played: the
 * player went idle (ExoPlayer does on a load error) or it has not started within ANNOUNCE_START_MS. Returns a function
 * that stops it at once, after which onEnd is not called.
 */
export function playAnnouncement(url: string, token: string, onEnd: () => void): () => void { // the conversation's announcement hook
  const announcer = createAudioPlayer({ uri: url, headers: { Authorization: `Bearer ${token}` } }); // the announcement route needs the token too
  let started = false; // "playing" is logged once
  let done = false; // ended or stopped: nothing more happens
  const release = (why: string) => { done = true; clearTimeout(timer); announcer.pause(); announcer.remove(); announcer.release(); if (__DEV__) console.log(`[announcement] ${why}`); }; // silent at once (on Android remove() alone does not stop it), out of the module's list, and its native player freed; the Metro log says why
  const end = (why: string) => { if (done) return; release(why); onEnd(); }; // once
  const timer = setTimeout(() => end('not played'), ANNOUNCE_START_MS); // never started: given up
  announcer.addListener('playbackStatusUpdate', (status) => { // loading, playing, finishing and so on
    if (done) return; // ended or stopped already
    if (status.playing && !started) { started = true; clearTimeout(timer); if (__DEV__) console.log('[announcement] playing'); } // it started: it may take as long as it takes
    if (status.didJustFinish) end('finished'); // reached the end
    else if (status.playbackState === 'idle') end('not played'); // the audio could not be loaded
  }); // end of the listener
  announcer.play(); // starts as soon as enough is loaded
  return () => { if (!done) release('stopped'); }; // a press, Help, a newer question or the screen going stops it
} // end of playAnnouncement
