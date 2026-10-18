// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Visual tokens of plan §5.3 and the 1920 x 1080 design grid of plan §5.2.

import { Dimensions } from 'react-native'; // screen size

/** Colour tokens (plan Table 18); only the ones this screen uses. */
export const colors = { // defined once, shared by every component
  bg: '#0B1220', // background
  surface: '#15233A', // option card
  text: '#F4F7FB', // primary text
  text2: '#B8C4D6', // secondary text
  ring: '#4FD1C5', // the plan's posterior-ring teal, used for the scan highlight
  help: '#FF5A5F', // help and alerts
} as const; // end of colors

const scale = Dimensions.get('window').width / 1920; // layout units per design pixel (0.5 on a 1080p TV at 320 dpi)

/** A length from the 1920 x 1080 design, in layout units for this screen. */
export function px(designPixels: number): number { // design pixels to layout units
  return designPixels * scale; // proportional to the screen width
} // end of px
