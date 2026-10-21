// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The studio page (plan §4.7, §5.5): the caregiver panel on the left, the virtual TV with the engine view under it on
// the right, and the system trace and the credits along the bottom, laid out for a 1920 x 1080 screen.

import { useState } from 'react'; // state
import { CaregiverPanel } from './CaregiverPanel'; // the simulated Alexa+
import { EngineView } from './EngineView'; // the posterior bars
import { TraceStrip, useTrace } from './TraceStrip'; // the system trace
import { VirtualTv, type EngineState } from './VirtualTv'; // the web mirror of the TV
import logo from '../../../assets/brand/SvaVak_logo_wordmark.svg'; // the SvaVāk logo's wordmark without its tagline, cropped tight by its viewBox, in Source Serif 4 outlines (SIL OFL 1.1, see NOTICE)

export function App() { // the page
  const [drive, setDrive] = useState(false); // drive mode: off by default, so the emulator alone answers
  const [engine, setEngine] = useState<EngineState | null>(null); // the virtual TV's engine, while driving
  const trace = useTrace(); // the trace stream and the hops' state

  return ( // the page
    <div className="studio">{/* the grid */}
      <header className="studio-head">{/* the wordmark: the name */}
        <h1><img className="logo" src={logo} alt="SvaVāk" /></h1>{/* the product, with its name as its text */}
      </header>{/* end of the head */}
      <CaregiverPanel onHop={trace.local} />{/* left */}
      <section className="tv-column" aria-label="Virtual TV">{/* right */}
        <div className="tv-head">{/* title, mirror label and the drive switch */}
          <h2>Virtual TV</h2>{/* title */}
          <span className="mirror">Web mirror: the real app runs on Fire OS</span>{/* labelled everywhere as a mirror */}
          <label className="drive">{/* the switch */}
            <input type="checkbox" role="switch" checked={drive} onChange={(e) => setDrive(e.target.checked)} data-testid="drive-mode" />{/* on: connect as the household's TV */}
            Drive mode{/* its name */}
          </label>{/* end of the switch */}
        </div>{/* end of the head */}
        <VirtualTv drive={drive} onEngine={setEngine} />{/* the screen; the space bar is the switch */}
        <EngineView state={engine} />{/* under the screen */}
      </section>{/* end of the right column */}
      <TraceStrip hops={trace.hops} mode={trace.mode} />{/* bottom */}
      <footer className="credits" data-testid="credits">Design inspired by Hamish Williams · Background photo: Aaron Vasquez / Unsplash</footer>{/* credits (NOTICE) */}
    </div> // end of the grid
  ); // end of the render
} // end of App
