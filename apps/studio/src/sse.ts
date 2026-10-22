// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Server-sent events read with fetch: the agent's POST /agent/turn and the server's GET /v1/trace both
// need a request EventSource cannot make (a POST, an Authorization header), so frames are parsed here.

/** One SSE frame: its event name ("message" when the frame has none) and its data. */
export interface SseFrame { // what a reader yields
  event: string; // the "event:" field
  data: string; // the "data:" field (one line in both streams)
} // end of SseFrame

/** Yields each complete frame of an SSE body as it arrives; returns when the stream ends. Both servers end lines with "\n". */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> { // bytes to frames
  const reader = body.getReader(); // raw chunks
  const decoder = new TextDecoder(); // UTF-8, also across chunk boundaries
  let buffer = ''; // an unfinished frame
  for (;;) { // until the stream ends
    const { value, done } = await reader.read(); // the next chunk
    if (done) return; // the server closed the stream
    buffer += decoder.decode(value, { stream: true }); // append it as text
    const frames = buffer.split('\n\n'); // complete frames, then the rest
    buffer = frames.pop() ?? ''; // keep the unfinished one
    for (const frame of frames) { // each complete frame
      const fields = new Map<string, string>(); // its fields
      for (const line of frame.split('\n')) { // one field per line
        const colon = line.indexOf(':'); // "name: value"
        if (colon > 0) fields.set(line.slice(0, colon), line.slice(colon + 1).trimStart()); // a comment line (":...") has no name
      } // end of the lines
      if (fields.has('data')) yield { event: fields.get('event') ?? 'message', data: fields.get('data')! }; // a frame with data
    } // end of the frames
  } // end of the stream
} // end of readSse
