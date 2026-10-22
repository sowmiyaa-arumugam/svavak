# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Writes test/erfc-reference.json: exact erfc values, from mpmath, at exact double inputs that cover every branch of
# FreeBSD's s_erf.c erfc (ported in src/core/erfc.ts), plus NaN, +-0 and +-Infinity. The output is deterministic.
# Usage, from packages/switchclock: python test/erfc-reference.py   (needs mpmath: pip install mpmath)

import json  # writes the fixture
import math  # nextafter, ldexp and the special values
import random  # seeded inputs inside each interval
import struct  # doubles from their 32-bit words, and back
from pathlib import Path  # the output path, next to this script

import mpmath  # arbitrary-precision erfc

mpmath.mp.prec = 200  # 200-bit working precision: the exact value is then rounded once, to the nearest double

GRID = 250  # evenly spaced inputs per interval and sign
RANDOM = 100  # seeded random inputs per interval and sign
SEED = 20261022  # the seed, so the fixture is reproducible


def from_words(hi: int, lo: int = 0) -> float:  # a double from its high and low 32-bit words
    return struct.unpack(">d", struct.pack(">II", hi, lo))[0]  # big-endian: the high word first


def high_word(x: float) -> int:  # the signed high 32-bit word of a double, as GET_HIGH_WORD gives it
    return struct.unpack(">i", struct.pack(">d", x)[:4])[0]  # the first four big-endian bytes, signed


def branch(x: float) -> str:  # the erfc branch of s_erf.c that x takes, from the same high-word tests
    hx = high_word(x)  # hx in the C source
    ix = hx & 0x7FFFFFFF  # ix: the high word without the sign
    if ix >= 0x7FF00000:  # NaN or +-Infinity
        return "nan-inf"  # erfc(nan) = nan, erfc(+-inf) = 0, 2
    if ix < 0x3FEB0000:  # |x| < 0.84375
        if ix < 0x3C700000:  # |x| < 2**-56
            return "tiny"  # 1 - x
        return "small" if hx < 0x3FD00000 else "quarter"  # x < 1/4 (negatives too): 1 - (x + x*y); else 0.5 - r
    if ix < 0x3FF40000:  # 0.84375 <= |x| < 1.25
        return "near-one+" if hx >= 0 else "near-one-"  # (1 - erx) - P/Q, or 1 + (erx + P/Q)
    if ix < 0x403C0000:  # |x| < 28
        if ix < 0x4006DB6D:  # |x| < 1/0.35
            return "mid+" if hx > 0 else "mid-"  # R1/S1: r/x, or 2 - r/x
        if hx < 0 and ix >= 0x40180000:  # x <= -6
            return "minus-six"  # 2 - tiny
        return "tail+" if hx > 0 else "tail-"  # R2/S2: r/x, or 2 - r/x
    return "huge+" if hx > 0 else "huge-"  # tiny*tiny, or 2 - tiny


def nearest_double(v: mpmath.mpf) -> float:  # v rounded to the nearest double, subnormals included
    if v == 0:  # erfc underflows to an exact zero
        return 0.0  # positive zero
    _, exp = mpmath.frexp(v)  # v = m * 2**exp with 0.5 <= |m| < 1, exactly
    shift = max(exp - 53, -1074)  # the weight of the last bit kept: 53 bits, or the subnormal grid
    k = int(mpmath.nint(v / mpmath.mpf(2) ** shift))  # the integer multiple of that weight nearest v (exact scaling)
    return math.ldexp(k, shift)  # exact: k has at most 53 bits


def js(x: float) -> str:  # a double as a string Number() reads back exactly
    if math.isnan(x):  # NaN
        return "NaN"  # JavaScript's spelling
    if math.isinf(x):  # +-Infinity
        return "Infinity" if x > 0 else "-Infinity"  # JavaScript's spelling
    return "-0" if x == 0 and math.copysign(1, x) < 0 else repr(x)  # repr is the shortest exact decimal


def interval(low: float, high: float, log: bool, rng: random.Random) -> list[float]:  # magnitudes in [low, high)
    if log:  # spans many binades: spread the inputs over the exponent
        a, b = math.log(low), math.log(high)  # the interval in log space
        xs = [math.exp(a + (b - a) * i / GRID) for i in range(GRID)]  # evenly spaced in log space
        xs += [math.exp(rng.uniform(a, b)) for _ in range(RANDOM)]  # random in log space
    else:  # one or a few binades: evenly spaced is fine
        xs = [low + (high - low) * i / GRID for i in range(GRID)]  # evenly spaced
        xs += [rng.uniform(low, high) for _ in range(RANDOM)]  # random
    xs += [low, math.nextafter(low, math.inf), math.nextafter(high, 0.0)]  # both edges, from inside
    return [x for x in xs if low <= x < high]  # keep the interval half-open


QUARTER = from_words(0x3FD00000)  # 0.25
LOW = from_words(0x3FEB0000)  # 0.84375
ONE_QUARTER = from_words(0x3FF40000)  # 1.25
MID = from_words(0x4006DB6D)  # about 1/0.35: the high word erfc compares with
SIX = from_words(0x40180000)  # 6
TWENTY_EIGHT = from_words(0x403C0000)  # 28
INTERVALS = [  # magnitude intervals, each inside one branch per sign (log: spread over the exponent)
    (5e-324, from_words(0x3C700000), True),  # from the smallest subnormal up to 2**-56
    (from_words(0x3C700000), QUARTER, True),  # 2**-56 up to 1/4
    (QUARTER, LOW, False),  # 1/4 up to 0.84375
    (LOW, ONE_QUARTER, False),  # 0.84375 up to 1.25
    (ONE_QUARTER, MID, False),  # 1.25 up to 1/0.35
    (MID, SIX, False),  # 1/0.35 up to 6
    (SIX, TWENTY_EIGHT, False),  # 6 up to 28, where erfc(x) leaves the normal range near 26.5
    (TWENTY_EIGHT, 1.7976931348623157e308, True),  # 28 up to the largest double
]  # end of the intervals

rng = random.Random(SEED)  # one seeded generator for the whole file
inputs = [math.nan, 0.0, -0.0, math.inf, -math.inf]  # the special values
for low, high, log in INTERVALS:  # every interval
    for x in interval(low, high, log, rng):  # its magnitudes
        inputs += [x, -x]  # both signs
cases = []  # [x, exact erfc(x), branch] for each input
for x in inputs:  # each input, exactly as a double
    if math.isnan(x):  # mpmath has no NaN erfc
        y = math.nan  # erfc(NaN) is NaN
    elif math.isinf(x):  # the limits
        y = 0.0 if x > 0 else 2.0  # erfc(+inf) = 0, erfc(-inf) = 2
    else:  # a finite double
        y = nearest_double(mpmath.erfc(mpmath.mpf(x)))  # mpf(x) is exact; erfc to 200 bits, then rounded once
    cases.append([js(x), js(y), branch(x)])  # strings, so NaN, infinities and -0 survive JSON

about = "erfc at exact double inputs, from mpmath (200 bits, rounded once to the nearest double); written by erfc-reference.py"  # what the file is
out = Path(__file__).with_name("erfc-reference.json")  # next to this script
out.write_text(json.dumps({"about": about, "cases": cases}) + "\n", encoding="utf-8")  # one line of JSON
print(f"wrote {len(cases)} cases to {out.name}")  # what was written
