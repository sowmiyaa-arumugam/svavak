// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Entry point: `yarn workspace server start` loads the repository's .env and listens on 127.0.0.1:8787.

import { compose, jsonLog } from './compose.ts'; // wiring
import { HOST, loadConfig, PORT } from './config.ts'; // settings

let config; // the validated settings
try { // a missing or wrong setting is a readable error, not a stack trace
  config = loadConfig(process.env); // from .env (via --env-file-if-exists) and the shell
} catch (error) { // invalid configuration
  jsonLog('config.invalid', { error: (error as Error).message }); // say why
  process.exit(1); // and stop
} // end of the configuration

const { server } = compose(config); // the server for this mode
server.listen(PORT, HOST, () => jsonLog('server.started', { url: `http://${HOST}:${PORT}`, mode: config.mode })); // never the token
