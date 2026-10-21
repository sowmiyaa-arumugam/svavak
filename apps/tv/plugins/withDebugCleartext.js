// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Config plugin (plan §4.2): debug builds may use cleartext HTTP to the emulator's host (10.0.2.2) and nowhere else.
// React Native's debug manifests allow cleartext to every host; a network security config narrows that, and Android
// ignores usesCleartextTraffic once one is present. Release builds get none, so they keep Android's default: HTTPS only.

const fs = require('fs'); // file access
const path = require('path'); // path helpers
const { withDangerousMod } = require('expo/config-plugins'); // runs at prebuild with the generated android/ folder

const VARIANTS = ['debug', 'debugOptimized']; // React Native 0.81's two debug build types
const ATTRIBUTE = 'android:networkSecurityConfig="@xml/network_security_config"'; // points <application> at the config
const XML = [ // res/xml/network_security_config.xml, one line per entry
  '<?xml version="1.0" encoding="utf-8"?>', // XML declaration
  '<network-security-config>', // root element
  '  <base-config cleartextTrafficPermitted="false" />', // every host: HTTPS only
  '  <domain-config cleartextTrafficPermitted="true">', // except
  '    <domain includeSubdomains="false">10.0.2.2</domain>', // the emulator's alias for the host: Metro and the SvaVāk server
  '  </domain-config>', // end of the exception
  '</network-security-config>', // end of root
  '', // final newline
].join('\n'); // the file's text

function withDebugCleartext(config) { // the plugin named in app.config.js
  return withDangerousMod(config, ['android', async (config) => { // edits files in android/ directly
    for (const variant of VARIANTS) { // each debug build type
      const dir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', variant); // its source set
      const manifest = path.join(dir, 'AndroidManifest.xml'); // its manifest overlay
      if (!fs.existsSync(manifest)) continue; // a template without this build type
      fs.mkdirSync(path.join(dir, 'res', 'xml'), { recursive: true }); // the resource folder
      fs.writeFileSync(path.join(dir, 'res', 'xml', 'network_security_config.xml'), XML); // the config, rewritten each prebuild
      const source = fs.readFileSync(manifest, 'utf8'); // the overlay's text
      if (!source.includes(ATTRIBUTE)) fs.writeFileSync(manifest, source.replace('<application ', `<application ${ATTRIBUTE} `)); // once
    } // end of the build types
    return config; // unchanged config
  }]); // end of the mod
} // end of withDebugCleartext

module.exports = withDebugCleartext; // export for Expo's plugin loader
