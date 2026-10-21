// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The system trace (plan §4.7): the server's live spans (GET /v1/trace, read with fetch and the device token) as a strip
// of hops, caregiver -> agent -> MCP -> server -> Bedrock or Polly -> TV. Each hop lights up with its last duration when
// a span for it arrives; the caregiver and agent hops come from the caregiver panel. A badge shows mock or live.

import { useCallback, useEffect, useState } from 'react'; // hooks
import { DEVICE_TOKEN, SERVER_URL } from './config'; // where the trace is, and its token
import { readSse } from './sse'; // the trace's event stream

/** The hops of flow S1, in order along the strip. */
export const HOPS = [ // key and label
  { key: 'caregiver', label: 'Caregiver' }, // the caregiver panel sends a turn
  { key: 'agent', label: 'Agent' }, // the sim agent runs it
  { key: 'mcp', label: 'MCP' }, // a tool call on the server's /mcp
  { key: 'server', label: 'Server' }, // a REST request
  { key: 'model', label: 'Bedrock or Polly' }, // the reply model, or speech
  { key: 'tv', label: 'TV' }, // a push to the TV
] as const; // end of HOPS
export type HopKey = (typeof HOPS)[number]['key']; // one of the keys

/** One span as GET /v1/trace sends it (no message text, ever). */
interface Span { at: string; hop: string; operation: string; duration_ms: number; mode: 'mock' | 'live' } // the fields used here

/** A hop's latest span. */
interface HopState { operation: string; ms: number; litUntil: number } // what ran, how long, and until when it glows

/** Lights a hop from the studio itself (the caregiver and agent hops have no server span). */
export type LocalHop = (key: HopKey, operation: string, ms: number) => void; // passed to the caregiver panel

const GLOW_MS = 1500; // a hop glows this long after its span

/** Which hop a server span belongs to, and the name to show for the model hop. */
function hopOf(span: Span): { key: HopKey; operation: string } | null { // server hop names to strip hops
  if (span.hop === 'mcp') return { key: 'mcp', operation: span.operation }; // a tool call
  if (span.hop === 'client→server') return { key: 'server', operation: span.operation }; // a REST request (the route, never ids)
  const mock = span.mode === 'mock' ? ' (mock)' : ''; // the mock adapters stand in for Bedrock and Polly
  if (span.hop === 'server→llm') return { key: 'model', operation: `Bedrock${mock}: ${span.operation}` }; // the reply model
  if (span.hop === 'server→tts') return { key: 'model', operation: `Polly${mock}: ${span.operation}` }; // speech
  if (span.hop === 'server→tv') return { key: 'tv', operation: span.operation }; // question.created or question.candidates
  return null; // a hop the strip does not draw
} // end of hopOf

/** The trace's state: each hop's latest span, the mode of the latest server span, and the local-hop function. */
export function useTrace(): { hops: Partial<Record<HopKey, HopState>>; mode: 'mock' | 'live' | null; local: LocalHop } { // for App
  const [hops, setHops] = useState<Partial<Record<HopKey, HopState>>>({}); // nothing yet
  const [mode, setMode] = useState<'mock' | 'live' | null>(null); // unknown until a span arrives
  const light = useCallback<LocalHop>((key, operation, ms) => setHops((h) => ({ ...h, [key]: { operation, ms, litUntil: performance.now() + GLOW_MS } })), []); // one hop lights

  useEffect(() => { // the trace stream, reconnecting every 2 s while the server is away
    const opened = Date.now(); // spans from before the page opened are history: not drawn
    const controller = new AbortController(); // stops the fetch on unmount
    let stopped = false; // no reconnect after unmount
    void (async () => { // runs until unmount
      while (!stopped) { // one connection per pass
        try { // the stream
          const res = await fetch(`${SERVER_URL}/v1/trace`, { headers: { Authorization: `Bearer ${DEVICE_TOKEN}` }, signal: controller.signal }); // the token in a header, never in the URL
          if (res.ok && res.body) for await (const frame of readSse(res.body)) { // each span
            const span = JSON.parse(frame.data) as Span; // its fields
            setMode(span.mode); // the latest server span's mode, replayed ones included: the server's mode never changes while it runs
            if (Date.parse(span.at) < opened) continue; // replayed history lights no hop
            const hop = hopOf(span); // where it goes on the strip
            if (hop) light(hop.key, hop.operation, span.duration_ms); // it lights
          } // end of the stream
        } catch { // the server is down, or the page is going away
        } // nothing to report: the strip just stays as it is
        if (!stopped) await new Promise((r) => setTimeout(r, 2000)); // try again
      } // end of the passes
    })(); // end of the reader
    return () => { stopped = true; controller.abort(); }; // stop
  }, [light]); // once

  return { hops, mode, local: light }; // for App
} // end of useTrace

export function TraceStrip({ hops, mode }: { hops: Partial<Record<HopKey, HopState>>; mode: 'mock' | 'live' | null }) { // the bottom strip
  const [, setTick] = useState(0); // re-renders the strip alone while a hop glows, so it goes dark on time
  useEffect(() => { // a light ticker
    const timer = setInterval(() => setTick((t) => t + 1), 250); // four times a second
    return () => clearInterval(timer); // stop on unmount
  }, []); // once
  const t = performance.now(); // one time for this render
  return ( // the strip
    <section className="panel trace" aria-label="System trace">{/* along the bottom */}
      <div className="trace-head">{/* title and badge */}
        <h2>System trace</h2>{/* title */}
        <span className={`badge ${mode ?? 'unknown'}`} data-testid="mode-badge">{mode === null ? 'mode: waiting for a span' : mode === 'live' ? 'LIVE' : 'MOCK'}</span>{/* mock or live */}
      </div>{/* end of the head */}
      <ol className="hops">{/* the hops, in order */}
        {HOPS.map(({ key, label }) => { // one hop
          const h = hops[key]; // its latest span, if any
          const lit = h !== undefined && t < h.litUntil; // glowing now
          return ( // the hop's box
            <li key={key} className={`hop${lit ? ' lit' : ''}${h ? ' seen' : ''}`} data-testid="trace-hop" data-hop={key} data-seen={h ? 'true' : 'false'} data-lit={lit ? 'true' : 'false'}>{/* stable attributes for tests */}
              <span className="hop-label">{label}</span>{/* which hop */}
              <span className="hop-op">{h?.operation ?? '—'}</span>{/* what ran last */}
              <span className="hop-ms">{h ? `${h.ms} ms` : ''}</span>{/* how long it took */}
            </li> // end of the box
          ); // end of the hop
        })}{/* end of the hops */}
      </ol>{/* end of the strip */}
    </section> // end of the trace
  ); // end of the render
} // end of TraceStrip
