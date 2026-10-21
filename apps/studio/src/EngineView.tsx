// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The engine view (plan §4.7): the virtual TV's switchclock posterior, one bar per option, after every press, with the
// commit threshold θ drawn across the bars.

import type { EngineState } from './VirtualTv'; // what the virtual TV reports

export function EngineView({ state }: { state: EngineState | null }) { // under the virtual TV
  return ( // the panel
    <section className="panel engine" aria-label="Engine view" data-testid="engine">{/* the posterior */}
      <div className="engine-head">{/* title and θ */}
        <h2>Engine: posterior after each press</h2>{/* what the bars are */}
        {state && <span className="theta-label">θ = {state.threshold}</span>}{/* the commit threshold */}
      </div>{/* end of the head */}
      {state === null ? ( // drive mode is off, or no question has been scanned yet
        <p className="muted">The bars appear when the virtual TV scans a question: turn on Drive mode and press the space bar.</p> // what to do
      ) : ( // one bar per option
        <div className="bars" style={{ ['--theta' as string]: String(state.threshold) }}>{/* θ as a CSS variable for the line */}
          {state.labels.map((label, i) => { // each option, in scan order
            const p = state.posterior[i] ?? 0; // its posterior
            return ( // the bar
              <div key={i} className="bar" data-testid="engine-bar" data-option={label} data-p={p.toFixed(3)}>{/* stable attributes for tests */}
                <span className="bar-value">{(p * 100).toFixed(1)}%</span>{/* the number */}
                <span className="bar-track"><span className="bar-fill" style={{ height: `${p * 100}%` }} /></span>{/* the bar, with the θ line */}
                <span className="bar-label">{label}</span>{/* the option */}
              </div> // end of the bar
            ); // end of the option
          })}{/* end of the options */}
        </div> // end of the bars
      )}{/* end of the body */}
    </section> // end of the panel
  ); // end of the render
} // end of EngineView
