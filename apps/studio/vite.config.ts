// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Vite for the studio on http://localhost:5173, the origin the server and the agent allow. In dev the device token
// comes from the repository's git-ignored .env (or the environment, which wins) and is compiled into the page served
// on localhost; a build carries none. Tokens never go into a URL or a committed file.

import { fileURLToPath } from 'node:url'; // the repository root as a path
import react from '@vitejs/plugin-react'; // JSX and Fast Refresh
import { defineConfig, loadEnv } from 'vite'; // Vite's config helpers

const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // the repository root, where .env lives
const SUBPROTOCOL_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{16,}$/; // the server's minimum length, in characters a WebSocket subprotocol may carry

export default defineConfig(({ command, mode }) => { // `vite` (serve) or `vite build`
  const token = command === 'serve' ? (loadEnv(mode, ROOT, 'SVAVAK_DEVICE_TOKEN').SVAVAK_DEVICE_TOKEN ?? '') : ''; // only this one setting is read
  if (command === 'serve' && !SUBPROTOCOL_TOKEN.test(token)) throw new Error('SVAVAK_DEVICE_TOKEN must be set in the repository .env: at least 16 letters, digits or !#$%&\'*+.^_`|~- (see .env.example)'); // fail closed; never shows the value
  return { // the config
    plugins: [react()], // React
    server: { host: 'localhost', port: 5173, strictPort: true, cors: false }, // the studio's origin; no CORS, so no other page can read its modules (and the token in them)
    define: { __DEVICE_TOKEN__: JSON.stringify(token) }, // the token, for the page served on localhost
  }; // end of the config
}); // end of defineConfig
