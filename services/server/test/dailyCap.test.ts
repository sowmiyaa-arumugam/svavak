// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Daily cost cap (plan §4.3).

import { expect, it } from 'vitest'; // test API
import { DailyCap } from '../src/domain/dailyCap.ts'; // tested

it('allows usage up to the limit, refuses beyond it, and resets on the next UTC day', () => { // the cap
  let now = Date.parse('2026-10-19T23:59:00Z'); // just before midnight UTC
  const cap = new DailyCap(10, () => now); // ten units a day
  expect(cap.take(6)).toBe(true); // 6 of 10
  expect(cap.take(5)).toBe(false); // would make 11: refused
  expect(cap.take(4)).toBe(true); // exactly 10
  expect(cap.take(1)).toBe(false); // full
  now = Date.parse('2026-10-20T00:00:01Z'); // the next UTC day
  expect(cap.take(10)).toBe(true); // a fresh allowance
}); // end of the case
