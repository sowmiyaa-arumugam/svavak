// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
/*
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunPro, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */
// erfc, ported to TypeScript from FreeBSD's lib/msun/src/s_erf.c (blob a9de122, last changed in FreeBSD commit 0dd5a56).
// The method, from that file: on [0, 0.84375] erfc = 1 - erf with erf(x) = x + x*P(x^2)/Q(x^2); on [0.84375, 1.25] a
// rational approximation around erf(1); beyond, erfc(x) = exp(-x*x - 0.5625 + R(1/x^2)/S(1/x^2))/x, with one set of
// coefficients up to 1/0.35 and another up to 28; past 28 it underflows to 0 (or is 2 for x < 0).

const TINY = 1e-300; // tiny: 2 - tiny rounds to 2, and tiny*tiny underflows to 0
const HALF = 0.5; // half
const ONE = 1; // one
const TWO = 2; // two
const ERX = 8.45062911510467529297e-1; // erx = (float)0.84506291151 (0x3FEB0AC1, 0x60000000)
const PP0 = 1.28379167095512558561e-1; // erf on [0, 0.84375], numerator (0x3FC06EBA, 0x8214DB68)
const PP1 = -3.25042107247001499370e-1; // (0xBFD4CD7D, 0x691CB913)
const PP2 = -2.84817495755985104766e-2; // (0xBF9D2A51, 0xDBD7194F)
const PP3 = -5.77027029648944159157e-3; // (0xBF77A291, 0x236668E4)
const PP4 = -2.37630166566501626084e-5; // (0xBEF8EAD6, 0x120016AC)
const QQ1 = 3.97917223959155352819e-1; // erf on [0, 0.84375], denominator (0x3FD97779, 0xCDDADC09)
const QQ2 = 6.50222499887672944485e-2; // (0x3FB0A54C, 0x5536CEBA)
const QQ3 = 5.08130628187576562776e-3; // (0x3F74D022, 0xC4D36B0F)
const QQ4 = 1.32494738004321644526e-4; // (0x3F215DC9, 0x221C1A10)
const QQ5 = -3.96022827877536812320e-6; // (0xBED09C43, 0x42A26120)
const PA0 = -2.36211856075265944077e-3; // erf on [0.84375, 1.25], numerator (0xBF6359B8, 0xBEF77538)
const PA1 = 4.14856118683748331666e-1; // (0x3FDA8D00, 0xAD92B34D)
const PA2 = -3.72207876035701323847e-1; // (0xBFD7D240, 0xFBB8C3F1)
const PA3 = 3.18346619901161753674e-1; // (0x3FD45FCA, 0x805120E4)
const PA4 = -1.10894694282396677476e-1; // (0xBFBC6398, 0x3D3E28EC)
const PA5 = 3.54783043256182359371e-2; // (0x3FA22A36, 0x599795EB)
const PA6 = -2.16637559486879084300e-3; // (0xBF61BF38, 0x0A96073F)
const QA1 = 1.06420880400844228286e-1; // erf on [0.84375, 1.25], denominator (0x3FBB3E66, 0x18EEE323)
const QA2 = 5.40397917702171048937e-1; // (0x3FE14AF0, 0x92EB6F33)
const QA3 = 7.18286544141962662868e-2; // (0x3FB2635C, 0xD99FE9A7)
const QA4 = 1.26171219808761642112e-1; // (0x3FC02660, 0xE763351F)
const QA5 = 1.36370839120290507362e-2; // (0x3F8BEDC2, 0x6B51DD1C)
const QA6 = 1.19844998467991074170e-2; // (0x3F888B54, 0x5735151D)
const RA0 = -9.86494403484714822705e-3; // erfc on [1.25, 1/0.35], numerator (0xBF843412, 0x600D6435)
const RA1 = -6.93858572707181764372e-1; // (0xBFE63416, 0xE4BA7360)
const RA2 = -1.05586262253232909814e1; // (0xC0251E04, 0x41B0E726)
const RA3 = -6.23753324503260060396e1; // (0xC04F300A, 0xE4CBA38D)
const RA4 = -1.62396669462573470355e2; // (0xC0644CB1, 0x84282266)
const RA5 = -1.84605092906711035994e2; // (0xC067135C, 0xEBCCABB2)
const RA6 = -8.12874355063065934246e1; // (0xC0545265, 0x57E4D2F2)
const RA7 = -9.81432934416914548592e0; // (0xC023A0EF, 0xC69AC25C)
const SA1 = 1.96512716674392571292e1; // erfc on [1.25, 1/0.35], denominator (0x4033A6B9, 0xBD707687)
const SA2 = 1.37657754143519042600e2; // (0x4061350C, 0x526AE721)
const SA3 = 4.34565877475229228821e2; // (0x407B290D, 0xD58A1A71)
const SA4 = 6.45387271733267880336e2; // (0x40842B19, 0x21EC2868)
const SA5 = 4.29008140027567833386e2; // (0x407AD021, 0x57700314)
const SA6 = 1.08635005541779435134e2; // (0x405B28A3, 0xEE48AE2C)
const SA7 = 6.57024977031928170135e0; // (0x401A47EF, 0x8E484A93)
const SA8 = -6.04244152148580987438e-2; // (0xBFAEEFF2, 0xEE749A62)
const RB0 = -9.86494292470009928597e-3; // erfc on [1/0.35, 28], numerator (0xBF843412, 0x39E86F4A)
const RB1 = -7.99283237680523006574e-1; // (0xBFE993BA, 0x70C285DE)
const RB2 = -1.77579549177547519889e1; // (0xC031C209, 0x555F995A)
const RB3 = -1.60636384855821916062e2; // (0xC064145D, 0x43C5ED98)
const RB4 = -6.37566443368389627722e2; // (0xC083EC88, 0x1375F228)
const RB5 = -1.02509513161107724954e3; // (0xC0900461, 0x6A2E5992)
const RB6 = -4.83519191608651397019e2; // (0xC07E384E, 0x9BDC383F)
const SB1 = 3.03380607434824582924e1; // erfc on [1/0.35, 28], denominator (0x403E568B, 0x261D5190)
const SB2 = 3.25792512996573918826e2; // (0x40745CAE, 0x221B9F0A)
const SB3 = 1.53672958608443695994e3; // (0x409802EB, 0x189D5118)
const SB4 = 3.19985821950859553908e3; // (0x40A8FFB7, 0x688C246A)
const SB5 = 2.55305040643316442583e3; // (0x40A3F219, 0xCEDF3BE6)
const SB6 = 4.74528541206955367215e2; // (0x407DA874, 0xE79FE763)
const SB7 = -2.24409524465858183362e1; // (0xC03670E2, 0x42712D62)

const WORDS = new DataView(new ArrayBuffer(8)); // scratch space for a double's two 32-bit words (big-endian views)

/** GET_HIGH_WORD: the signed high 32 bits of x (sign, exponent and the top of the mantissa). */
function highWord(x: number): number { // hx = high word of x
  WORDS.setFloat64(0, x); // DataView is big-endian by default, so bytes 0-3 are the high word on every platform
  return WORDS.getInt32(0); // signed, as int32_t
} // end of highWord

/** SET_LOW_WORD(x, 0): x with the low 32 bits of its mantissa cleared. */
function lowWordCleared(x: number): number { // z with its low word set to 0
  WORDS.setFloat64(0, x); // the double's eight bytes
  WORDS.setUint32(4, 0); // clear bytes 4-7, the low word
  return WORDS.getFloat64(0); // the shortened double
} // end of lowWordCleared

/** erfc(x) = 1 - erf(x): FreeBSD's double erfc(double x), branch for branch. */
export function erfc(x: number): number { // the complementary error function
  const hx = highWord(x); // GET_HIGH_WORD(hx, x)
  const ix = hx & 0x7fffffff; // the high word of |x|
  if (ix >= 0x7ff00000) { // erfc(nan) = nan; erfc(+-inf) = 0, 2
    return ((hx >>> 31) << 1) + ONE / x; // (sign bit) * 2, plus 1/x: NaN stays NaN, 1/inf is 0
  } // end of NaN and infinities

  if (ix < 0x3feb0000) { // |x| < 0.84375
    if (ix < 0x3c700000) return ONE - x; // |x| < 2**-56: erf(x) is negligible
    const z = x * x; // x squared
    let r = PP0 + z * (PP1 + z * (PP2 + z * (PP3 + z * PP4))); // P(z)
    const s = ONE + z * (QQ1 + z * (QQ2 + z * (QQ3 + z * (QQ4 + z * QQ5)))); // Q(z)
    const y = r / s; // R = P/Q, so erf(x) = x + x*y
    if (hx < 0x3fd00000) { // x < 1/4 (every negative x lands here)
      return ONE - (x + x * y); // 1 - erf(x)
    } else { // 1/4 <= x < 0.84375
      r = x * y; // x*R
      r += x - HALF; // (x - 0.5) + x*R
      return HALF - r; // 0.5 - ((x - 0.5) + x*R): no cancellation near 0.5
    } // end of the two sub-ranges
  } // end of |x| < 0.84375
  if (ix < 0x3ff40000) { // 0.84375 <= |x| < 1.25
    const s = Math.abs(x) - ONE; // s = |x| - 1
    const P = PA0 + s * (PA1 + s * (PA2 + s * (PA3 + s * (PA4 + s * (PA5 + s * PA6))))); // P1(s)
    const Q = ONE + s * (QA1 + s * (QA2 + s * (QA3 + s * (QA4 + s * (QA5 + s * QA6))))); // Q1(s)
    if (hx >= 0) { // x > 0
      const z = ONE - ERX; // 1 - c
      return z - P / Q; // (1 - c) - P1/Q1
    } else { // x < 0
      const z = ERX + P / Q; // c + P1/Q1 = erf(|x|)
      return ONE + z; // 1 + erf(|x|)
    } // end of the signs
  } // end of 0.84375 <= |x| < 1.25
  if (ix < 0x403c0000) { // |x| < 28
    const ax = Math.abs(x); // x = fabs(x)
    const s = ONE / (ax * ax); // s = 1/x^2
    let R: number; // R1(s) or R2(s)
    let S: number; // S1(s) or S2(s)
    if (ix < 0x4006db6d) { // |x| < 1/0.35 (about 2.857143)
      R = RA0 + s * (RA1 + s * (RA2 + s * (RA3 + s * (RA4 + s * (RA5 + s * (RA6 + s * RA7)))))); // R1(s)
      S = ONE + s * (SA1 + s * (SA2 + s * (SA3 + s * (SA4 + s * (SA5 + s * (SA6 + s * (SA7 + s * SA8))))))); // S1(s)
    } else { // |x| >= 1/0.35
      if (hx < 0 && ix >= 0x40180000) return TWO - TINY; // x <= -6: erfc(x) rounds to 2
      R = RB0 + s * (RB1 + s * (RB2 + s * (RB3 + s * (RB4 + s * (RB5 + s * RB6))))); // R2(s)
      S = ONE + s * (SB1 + s * (SB2 + s * (SB3 + s * (SB4 + s * (SB5 + s * (SB6 + s * SB7)))))); // S2(s)
    } // end of the coefficient sets
    const z = lowWordCleared(ax); // z = x with its low word cleared, so z*z is exact
    const r = Math.exp(-z * z - 0.5625) * Math.exp((z - ax) * (z + ax) + R / S); // exp(-x*x - 0.5625 + R/S), split
    if (hx > 0) return r / ax; // x > 0: erfc(x)
    else return TWO - r / ax; // x < 0: 2 - erfc(|x|)
  } else { // |x| >= 28
    if (hx > 0) return TINY * TINY; // erfc(x) underflows to 0
    else return TWO - TINY; // erfc(x) rounds to 2
  } // end of the far range
} // end of erfc
