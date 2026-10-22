// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Colour tokens shared by the TV app and the studio (apps/studio), so both read as one product.

/** Colour tokens; only the ones the TV and the studio use. */
export const colors = { // defined once, shared by every component
  bg: '#0B1220', // background
  surface: '#15233A', // option card
  surfaceFocus: '#1E3354', // the studio's frames and bar tracks
  text: '#F4F7FB', // primary text
  text2: '#B8C4D6', // secondary text
  accent: '#FFB020', // the studio's marks: the simulation banner, the "Web version" label, θ
  ring: '#4FD1C5', // the palette's posterior-ring teal, used for the scan highlight
  help: '#FF5A5F', // help and alerts
  ok: '#3DDC97', // connected or success: the studio's live badge
} as const; // end of colors
