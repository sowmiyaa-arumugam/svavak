// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Portions derived from AmazonAppDev/react-native-multi-tv-app-sample (MIT-0)
// Expo app configuration: the Android TV parts of the sample's app.json, as JavaScript so it can carry comments.

module.exports = { // read by the Expo CLI for prebuild, build and start
  expo: { // the Expo app config
    name: 'Say When', // display name on the TV
    slug: 'say-when', // Expo project identifier
    android: { package: 'dev.saywhen.tv' }, // Android application id
    newArchEnabled: false, // the sample's setting: React Native's legacy architecture
    plugins: [ // config plugins applied at prebuild
      './plugins/withKeyEvent', // forwards every key event to JavaScript (react-native-keyevent)
      '@react-native-tvos/config-tv', // TV manifest: leanback launcher, no portrait lock (active when EXPO_TV=1)
      [ // native build settings
        'expo-build-properties', // sets Android SDK levels in the generated project
        { android: { compileSdkVersion: 36, targetSdkVersion: 34, minSdkVersion: 28 } }, // the sample's levels; minSdk 28 is Fire OS 7 (plan §4.2)
      ], // end of build settings
    ], // end of plugins
  }, // end of the Expo app config
}; // end of the app configuration
