// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// SseTraceSink (plan §4.3): spans in an in-memory ring buffer (last 500), fanned out to GET /v1/trace subscribers.

import type { Span } from '../domain/model.ts'; // the span shape
import type { TracePort } from '../ports/index.ts'; // the port

const CAPACITY = 500; // plan Table 14: in memory only, the last 500

/** Keeps recent spans and notifies subscribers of each new one. */
export class SseTraceSink implements TracePort { // trace adapter
  private readonly clock: () => number; // epoch milliseconds
  private readonly newId: () => string; // span ids
  private readonly spans: Span[] = []; // the ring buffer, oldest first
  private readonly listeners = new Set<(span: Span) => void>(); // open SSE streams

  constructor(clock: () => number, newId: () => string) { // a clock and an id source
    this.clock = clock; // keep the clock
    this.newId = newId; // keep the id source
  } // end of constructor

  span(input: Omit<Span, 'id' | 'at'>): void { // record one span
    const span: Span = { id: this.newId(), at: new Date(this.clock()).toISOString(), ...input }; // complete it
    this.spans.push(span); // newest last
    if (this.spans.length > CAPACITY) this.spans.shift(); // drop the oldest
    this.listeners.forEach((listener) => listener(span)); // live subscribers
  } // end of span

  /** The buffered spans, oldest first. */
  recent(): readonly Span[] { // for a new subscriber
    return this.spans; // read-only view
  } // end of recent

  /** Calls `listener` for every new span; returns the function that stops it. */
  subscribe(listener: (span: Span) => void): () => void { // one per SSE stream
    this.listeners.add(listener); // start
    return () => this.listeners.delete(listener); // stop
  } // end of subscribe
} // end of SseTraceSink
