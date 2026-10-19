// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// MockTts (plan §4.3): no audio in mock mode, so the whole loop runs without AWS.

import type { TtsPort } from '../ports/index.ts'; // the port

/** Always returns null: the TV skips playback. */
export class MockTts implements TtsPort { // the mock speech adapter
  async synthesize(_text: string): Promise<null> { // any text
    return null; // no audio
  } // end of synthesize
} // end of MockTts
