// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Portions derived from AmazonAppDev/react-native-multi-tv-app-sample (MIT-0)
// Metro configuration for the Yarn workspaces monorepo, so the app bundles packages/switchclock from source.

const { getDefaultConfig } = require('expo/metro-config'); // Expo's Metro defaults
const path = require('path'); // path helpers

const config = getDefaultConfig(__dirname); // start from Expo's defaults for this app

config.watchFolders = [path.resolve(__dirname, '../..')]; // watch the whole repository, including packages/switchclock
config.resolver = { // module resolution
  ...config.resolver, // keep Expo's resolver settings
  unstable_enableSymlinks: true, // follow the workspace symlink to packages/switchclock
  nodeModulesPaths: [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../../node_modules')], // app, then root
}; // end of resolution settings

module.exports = config; // hand the configuration to Metro
