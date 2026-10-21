// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Visual tokens of plan §5.3 and the 1920 x 1080 design grid of plan §5.2.

import { Dimensions } from 'react-native'; // screen size

export { colors } from './colors'; // the colour tokens, in a module the studio can import without React Native

const scale = Dimensions.get('window').width / 1920; // layout units per design pixel (0.5 on a 1080p TV at 320 dpi)

/** A length from the 1920 x 1080 design, in layout units for this screen. */
export function px(designPixels: number): number { // design pixels to layout units
  return designPixels * scale; // proportional to the screen width
} // end of px
