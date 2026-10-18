// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// App root, registered by Expo's AppEntry: the conversation screen is the only screen so far (plan §4.2, P0).

import { LogBox } from 'react-native'; // dev-build warning overlay
import { ConversationScreen } from './src/ConversationScreen'; // the screen

// The legacy architecture is kept on purpose (the sample's setting); its banner would cover the question band.
LogBox.ignoreLogs(['The app is running using the Legacy Architecture']); // still printed in the Metro console

export default function App() { // the root component
  return <ConversationScreen />; // full screen
} // end of App
