// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Portions derived from AmazonAppDev/react-native-multi-tv-app-sample (MIT-0)
// Config plugin: MainActivity forwards every key event to react-native-keyevent, so Select reaches JavaScript.

const { withMainActivity } = require("expo/config-plugins"); // edits MainActivity at prebuild
const { // from Expo's config-plugins package
  mergeContents, // inserts a tagged block once, so prebuild can run again
} = require("@expo/config-plugins/build/utils/generateCode"); // Expo's code-insertion helper

const withAndroidMainActivityImport = (config) => { // step 1: the imports
  return withMainActivity(config, (config) => { // modify the MainActivity source
    const newSrc = [ // Kotlin lines to insert
      "import android.view.KeyEvent", // Android's key event
      "import com.github.kevinejohn.keyevent.KeyEventModule", // the library's native module
    ]; // end of the imports
    const newConfig = mergeContents({ // insert them
      tag: "react-native-keyevent-import", // marks the block
      src: config.modResults.contents, // the current source
      newSrc: newSrc.join("\n"), // the lines above
      anchor: `import`, // after the first import line
      offset: 1, // on the line below it
      comment: "//", // Kotlin comment marker for the tag lines
    }); // end of the insertion
    return { // the modified config
      ...config, // everything else unchanged
      modResults: newConfig, // the new source
    }; // end of the modified config
  }); // end of the MainActivity edit
}; // end of step 1

const withAndroidMainActivityBody = (config) => { // step 2: the key handlers
  return withMainActivity(config, (config) => { // modify the MainActivity source
    // Forward keys from dispatchKeyEvent: DPAD_CENTER/ENTER are consumed by the
    // focused view and never reach onKeyDown/onKeyUp on Android TV (AmazonAppDev/react-native-multi-tv-app-sample#108).
    // getInstance() is null until React Native has created its native modules, so a key pressed while the app is
    // still loading is dropped (?.) instead of crashing the activity.
    const newSrc = [ // Kotlin lines to insert into the class
      "override fun dispatchKeyEvent(event: KeyEvent): Boolean {", // sees every key event first
      "  when (event.action) {", // by action
      "    KeyEvent.ACTION_DOWN -> KeyEventModule.getInstance()?.onKeyDownEvent(event.keyCode, event)", // down, including auto-repeat
      "    KeyEvent.ACTION_UP -> KeyEventModule.getInstance()?.onKeyUpEvent(event.keyCode, event)", // up
      "  }", // end of when
      "  return super.dispatchKeyEvent(event)", // normal handling continues
      "}", // end of dispatchKeyEvent
      "", // blank line
      "override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {", // key down
      "  super.onKeyDown(keyCode, event)", // default handling
      "  return true", // consumed
      "}", // end of onKeyDown
      "", // blank line
      "override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {", // key up
      "  super.onKeyUp(keyCode, event)", // default handling (Back still exits)
      "  return true", // consumed
      "}", // end of onKeyUp
      "", // blank line
      "override fun onKeyMultiple(keyCode: Int, repeatCount: Int, event: KeyEvent): Boolean {", // batched repeats
      "  KeyEventModule.getInstance()?.onKeyMultipleEvent(keyCode, repeatCount, event)", // forwarded to JavaScript
      "  return super.onKeyMultiple(keyCode, repeatCount, event)", // default handling
      "}", // end of onKeyMultiple
    ]; // end of the handlers
    const newConfig = mergeContents({ // insert them
      tag: "react-native-keyevent-body", // marks the block
      src: config.modResults.contents, // the current source
      newSrc: newSrc.join("\n"), // the lines above
      anchor: `class MainActivity`, // after the class declaration
      offset: 1, // on the line below it
      comment: "//", // Kotlin comment marker for the tag lines
    }); // end of the insertion
    return { // the modified config
      ...config, // everything else unchanged
      modResults: newConfig, // the new source
    }; // end of the modified config
  }); // end of the MainActivity edit
}; // end of step 2

function withKeyEvent(config) { // the plugin named in app.config.js
  config = withAndroidMainActivityImport(config); // imports
  config = withAndroidMainActivityBody(config); // handlers
  return config; // the modified config
} // end of withKeyEvent

module.exports = withKeyEvent; // export for Expo's plugin loader
