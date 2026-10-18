// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Portions derived from AmazonAppDev/react-native-multi-tv-app-sample (MIT-0)
// Babel configuration, used by Metro for the app bundle and by Jest for the tests.

module.exports = function (api) { // called by Babel with its config API
  api.cache(true); // the configuration never changes between files
  return { presets: ['babel-preset-expo'] }; // Expo's preset: TypeScript, JSX and React Native transforms
}; // end of the configuration
