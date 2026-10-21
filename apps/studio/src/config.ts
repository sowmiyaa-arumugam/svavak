// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Where the studio's services listen (loopback only), and the device token vite.config.ts takes from the .env.

export const SERVER_URL = 'http://127.0.0.1:8787'; // the server: stream, utterances and trace
export const AGENT_URL = 'http://127.0.0.1:8790'; // the sim agent: POST /agent/turn
export const DEVICE_TOKEN: string = __DEVICE_TOKEN__; // the household TV's token, from the repository's .env at dev time; never in a URL
