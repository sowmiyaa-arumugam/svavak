// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Entry point: the TV's colour tokens become CSS variables, so the studio and the TV read as one product (plan §5.3).

import '@fontsource/montserrat/300.css'; // Montserrat Light, self-hosted (SIL Open Font License; see NOTICE): "studio"
import '@fontsource/montserrat/400.css'; // Regular: body text
import '@fontsource/montserrat/600.css'; // SemiBold: titles, the speech
import '@fontsource/montserrat/700.css'; // Bold: the name, the banner, Send
import { createRoot } from 'react-dom/client'; // React DOM
import { colors } from '../../tv/src/colors'; // the TV's colour tokens (plan Table 18)
import { App } from './App'; // the page
import './styles.css'; // layout and type

for (const [name, value] of Object.entries(colors)) document.documentElement.style.setProperty(`--${name}`, value); // --bg, --surface, --text, ...
createRoot(document.getElementById('root')!).render(<App />); // no StrictMode: its double effects would open the TV's stream twice
