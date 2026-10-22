// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The studio page, laid out on a 1920 x 1080 stage that main.tsx scales to the window: the header
// with the Drive mode switch, the caregiver panel (alone and centred with Drive mode off; on the left with the virtual
// TV and the engine view under it on the right with Drive mode on), and the system trace along the bottom. The credits
// are in NOTICE and the README, not on the page.

import { useState } from 'react'; // state
import { CaregiverPanel } from './CaregiverPanel'; // the simulated Alexa+
import { EngineView } from './EngineView'; // the posterior bars
import { TraceStrip, useTrace } from './TraceStrip'; // the system trace
import { VirtualTv, type EngineState } from './VirtualTv'; // the web version of the TV app
import logo from '../../../assets/brand/SvaVak_logo_wordmark.svg'; // the SvaVāk logo's wordmark without its tagline, cropped tight by its viewBox, in Source Serif 4 outlines (SIL OFL 1.1, see NOTICE)

export function App() { // the page
  const [drive, setDrive] = useState(false); // drive mode: off by default, so the emulator alone answers
  const [engine, setEngine] = useState<EngineState | null>(null); // the virtual TV's engine, while driving
  const trace = useTrace(); // the trace stream and the hops' state

  return ( // the page
    <div className="studio" data-drive={drive ? 'on' : 'off'}>{/* the stage's grid, laid out for the mode */}
      <header className="studio-head">{/* the wordmark, and on the right what answers and the drive switch */}
        <h1><img className="logo" src={logo} alt="SvaVāk" /></h1>{/* the product, with its name as its text */}
        <p className="mode-line muted" data-testid="mode-line">{drive ? 'Answer on the virtual TV with the space bar.' : 'The SvaVāk app on the Fire TV emulator answers the questions.'}</p>{/* what each mode does */}
        <label className="drive">{/* the switch */}
          <input type="checkbox" role="switch" checked={drive} onChange={(e) => setDrive(e.target.checked)} data-testid="drive-mode" />{/* on: connect as the household's TV */}
          Drive mode{/* its name */}
        </label>{/* end of the switch */}
      </header>{/* end of the head */}
      <CaregiverPanel onHop={trace.local} helps={trace.helps} />{/* centred, or on the left; help alerts from the trace */}
      {drive && ( // the virtual TV and its engine, only while driving
        <section className="tv-column" aria-label="Virtual TV">{/* right */}
          <div className="tv-head">{/* title and label */}
            <h2>Virtual TV</h2>{/* title */}
            <span className="mirror">Web version of the TV app: the real app runs on Fire OS</span>{/* what it is, and where the real app runs */}
          </div>{/* end of the head */}
          <VirtualTv onEngine={setEngine} />{/* the screen; the space bar is the switch */}
          <EngineView state={engine} />{/* under the screen */}
        </section> // end of the right column
      )}{/* end of the virtual TV */}
      <TraceStrip hops={trace.hops} mode={trace.mode} />{/* bottom */}
    </div> // end of the grid
  ); // end of the render
} // end of App
