// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The one clock shared by the engine, the switch handler and the highlight (plan §4.2).

/** Milliseconds on the shared clock: the JavaScript thread's performance.now, which also stamps animation frames. */
export const now = (): number => performance.now(); // the same clock everywhere in the app
