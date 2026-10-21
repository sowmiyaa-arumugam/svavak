// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Entry point: the TV's colour tokens become CSS variables, so the studio and the TV read as one product (plan §5.3),
// and the 1920 x 1080 stage gets its scale for the window.

import '@fontsource/montserrat/400.css'; // Montserrat Regular, self-hosted (SIL Open Font License; see NOTICE): body text
import '@fontsource/montserrat/600.css'; // SemiBold: titles, the speech
import '@fontsource/montserrat/700.css'; // Bold: the banner, Send
import { createRoot } from 'react-dom/client'; // React DOM
import { colors } from '../../tv/src/colors'; // the TV's colour tokens (plan Table 18)
import { App } from './App'; // the page
import './styles.css'; // layout and type

for (const [name, value] of Object.entries(colors)) document.documentElement.style.setProperty(`--${name}`, value); // --bg, --surface, --text, ...
const fit = () => document.documentElement.style.setProperty('--scale', String(Math.min(innerWidth / 1920, innerHeight / 1080))); // the stage's scale: the whole stage fits the window, its proportions kept
fit(); // for the window as it opens
addEventListener('resize', fit); // and again on every resize, without a reload
createRoot(document.getElementById('root')!).render(<App />); // no StrictMode: its double effects would open the TV's stream twice
