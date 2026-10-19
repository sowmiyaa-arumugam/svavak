// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Speech playback (plan §4.2): the server's audio (Polly's MP3, or the mock's WAV tone), played with Expo's audio module.

import { createAudioPlayer, type AudioPlayer } from 'expo-audio'; // Expo's audio module

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
