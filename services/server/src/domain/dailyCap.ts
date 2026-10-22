// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Cost guard: a global daily cap (1,000 LLM calls, 100,000 Polly characters); beyond it, mock output.

/** Counts usage per UTC day and refuses what would go over the limit. */
export class DailyCap { // one per capped resource
  private readonly limit: number; // most units per day
  private readonly clock: () => number; // epoch milliseconds
  private day = ''; // the UTC date the count belongs to
  private used = 0; // units used that day

  constructor(limit: number, clock: () => number) { // a limit and a clock
    this.limit = limit; // keep the limit
    this.clock = clock; // keep the clock
  } // end of constructor

  /** Takes `amount` units if they fit in today's limit; returns false (and takes nothing) if they do not. */
  take(amount: number): boolean { // reserve units
    const today = new Date(this.clock()).toISOString().slice(0, 10); // YYYY-MM-DD in UTC
    if (today !== this.day) { // a new day
      this.day = today; // start counting it
      this.used = 0; // from zero
    } // end of the day change
    if (this.used + amount > this.limit) return false; // over the cap: the caller falls back to mock
    this.used += amount; // count it
    return true; // allowed
  } // end of take
} // end of DailyCap
