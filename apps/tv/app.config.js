// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Portions derived from AmazonAppDev/react-native-multi-tv-app-sample (MIT-0)
// Expo app configuration: the Android TV parts of the sample's app.json, as JavaScript so it can carry comments.

const fs = require('fs'); // file checks
const path = require('path'); // path helpers

const envFile = path.resolve(__dirname, '../../.env'); // the repository's git-ignored settings, shared with the server
if (fs.existsSync(envFile)) process.loadEnvFile(envFile); // SVAVAK_DEVICE_TOKEN, when set

module.exports = { // read by the Expo CLI for prebuild, build and start
  expo: { // the Expo app config
    name: 'SvaVāk', // display name on the TV
    slug: 'svavak', // Expo project identifier: plain ASCII, as the name's ā cannot go here
    scheme: 'svavak', // deep-link scheme (svavak://), plain ASCII too
    android: { package: 'dev.svavak.tv' }, // Android application id
    newArchEnabled: false, // the sample's setting: React Native's legacy architecture
    extra: { // embedded in the APK by expo-constants at build time; read by src/server.ts
      server: { url: 'http://10.0.2.2:8787', token: process.env.SVAVAK_DEVICE_TOKEN ?? '' }, // the emulator's host; no token: fixtures only
    }, // end of extra
    plugins: [ // config plugins applied at prebuild
      './plugins/withKeyEvent', // forwards every key event to JavaScript (react-native-keyevent)
      './plugins/withDebugCleartext', // debug and release (demo APK) builds: cleartext HTTP to the emulator host only
      [ // TV manifest: leanback launcher, no portrait lock (active when EXPO_TV=1)
        '@react-native-tvos/config-tv', // the TV config plugin
        { androidTVBanner: './assets/tv-banner.png' }, // 320 x 180 launcher banner (Fire TV takes its banner from the Appstore)
      ], // end of the TV plugin
      [ // native build settings
        'expo-build-properties', // sets Android SDK levels in the generated project
        { android: { compileSdkVersion: 36, targetSdkVersion: 34, minSdkVersion: 28 } }, // the sample's levels; minSdk 28 is Fire OS 7 (plan §4.2)
      ], // end of build settings
    ], // end of plugins
  }, // end of the Expo app config
}; // end of the app configuration
