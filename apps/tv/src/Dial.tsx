// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// A clock dial (plan §5.4): an amber noon notch, a hand the screen's frame loop turns, and the posterior ring.

import { StyleSheet, View } from 'react-native'; // primitives
import { colors, px } from './theme'; // tokens and design-pixel scale

const RIM = px(3); // dial outline width
const HAND = px(6); // hand width
const NOTCH = px(12); // noon notch width
const RING = px(6); // posterior ring width
const GAP = px(4); // space between the dial and its ring

interface DialProps { // what a dial needs
  size: number; // dial diameter, in layout units
  posterior: number | null; // the leading option's probability, drawn as a ring; null on every other dial
  handRef: (hand: View | null) => void; // hands the rotating layer to the frame loop
} // end of DialProps

/** One dial, with room for the posterior ring around it. */
export function Dial({ size, posterior, handRef }: DialProps) { // a dial
  const outer = size + 2 * (GAP + RING); // dial plus ring
  const inner = size - 2 * RIM; // inside the outline
  return ( // the dial
    <View style={[styles.box, { width: outer, height: outer }]}>{/* centres the dial inside its ring */}
      {posterior !== null && <Ring size={outer} fraction={posterior} />}{/* the leading option's confidence */}
      <View style={[styles.face, { width: size, height: size, borderRadius: size / 2 }]}>{/* the clock face */}
        <View style={[styles.notch, { left: (inner - NOTCH) / 2, height: inner * 0.16 }]} />{/* amber notch at noon */}
        <View ref={handRef} style={StyleSheet.absoluteFill}>{/* turned about the centre by the frame loop */}
          <View style={[styles.hand, { left: (inner - HAND) / 2, top: inner * 0.08, height: inner * 0.42 }]} />{/* hand */}
        </View>{/* end of the turning layer */}
      </View>{/* end of the face */}
    </View> // end of the dial
  ); // end of the render
} // end of Dial

/** An arc from noon, clockwise, over `fraction` of the circle: two half-width windows onto a turned half ring. */
function Ring({ size, fraction }: { size: number; fraction: number }) { // the posterior ring
  const half = size / 2; // radius
  const degrees = 360 * Math.min(Math.max(fraction, 0), 1); // arc length in degrees
  const arc = [styles.halfRing, { width: size, height: size, borderRadius: half }]; // a half ring: left half after +45°
  return ( // up to two windows
    <View style={[styles.ring, { width: size, height: size }]}>{/* the ring's square */}
      <View style={[styles.window, { left: half, width: half, height: size }]}>{/* right window: noon to six */}
        <View style={[arc, { left: -half, transform: [{ rotate: `${45 + Math.min(degrees, 180)}deg` }] }]} />{/* in view */}
      </View>{/* end of the right window */}
      {degrees > 180 && ( // the part past six o'clock
        <View style={[styles.window, { left: 0, width: half, height: size }]}>{/* left window: six to noon */}
          <View style={[arc, { left: 0, transform: [{ rotate: `${45 + degrees}deg` }] }]} />{/* in view */}
        </View> // end of the left window
      )}{/* end of the second half */}
    </View> // end of the ring
  ); // end of the render
} // end of Ring

const styles = StyleSheet.create({ // dial styles
  box: { alignItems: 'center', justifyContent: 'center' }, // dial centred in its ring
  face: { backgroundColor: colors.bg, borderWidth: RIM, borderColor: colors.text2 }, // the clock face
  notch: { position: 'absolute', top: 0, width: NOTCH, backgroundColor: colors.accent }, // noon mark
  hand: { position: 'absolute', width: HAND, borderRadius: HAND / 2, backgroundColor: colors.text }, // centre to rim
  ring: { position: 'absolute', top: 0, left: 0 }, // behind the dial
  window: { position: 'absolute', top: 0, overflow: 'hidden' }, // clips a half ring to one side
  halfRing: { // a ring coloured on two adjacent sides: half a circle once turned by 45°
    position: 'absolute', // placed inside its window
    top: 0, // aligned with the ring's square
    borderWidth: RING, // ring thickness
    borderColor: 'transparent', // the other half is invisible
    borderLeftColor: colors.ring, // coloured side
    borderBottomColor: colors.ring, // coloured side
  }, // end of halfRing
}); // end of styles
