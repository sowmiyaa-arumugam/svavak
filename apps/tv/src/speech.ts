// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Speech playback (plan §4.2): the server's MP3, played with Expo's audio module.

import { createAudioPlayer, type AudioPlayer } from 'expo-audio'; // Expo's audio module

let player: AudioPlayer | null = null; // the one player; a new reply replaces it

/** Plays the MP3 at `url`, fetched with the device token, stopping whatever played before. */
export function playSpeech(url: string, token: string): void { // one reply's speech
  player?.remove(); // stop and release the previous one
  player = createAudioPlayer({ uri: url, headers: { Authorization: `Bearer ${token}` } }); // the audio route needs the token too
  player.play(); // starts as soon as enough is loaded
} // end of playSpeech
