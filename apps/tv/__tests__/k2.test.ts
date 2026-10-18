// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// K2 instrumentation maths: mean and sample SD, the frame-rate meter and the selection log lines.

import { FpsMeter, meanSd, selectionLog } from '../src/k2'; // tested

describe('K2 instrumentation', () => { // dev-build logging
  it('computes the mean and the sample standard deviation', () => { // statistics
    expect(meanSd([10, 20, 30])).toEqual({ mean: 20, sd: 10 }); // n - 1 denominator
    expect(meanSd([5]).sd).toBeNaN(); // undefined for one value
  }); // end of the case

  it('reports frames per second once per window', () => { // frame rate
    const rates: number[] = []; // reported rates
    const meter = new FpsMeter(0, 1000, (fps) => rates.push(fps)); // 1 s windows from time 0
    for (let t = 20; t <= 2000; t += 20) meter.frame(t); // 50 frames per second for 2 s
    expect(rates).toEqual([50, 50]); // one report per window
  }); // end of the case

  it('logs each selection and the session totals', () => { // log lines
    const lines: string[] = []; // captured output
    const log = selectionLog((line) => lines.push(line)); // the logger
    log({ label: 'Tea, please', offsetsMs: [-20, 20] }); // first selection
    log({ label: 'Help', offsetsMs: [30] }); // second selection
    expect(lines).toEqual([ // two lines per selection
      '[K2] selection 1 "Tea, please": offsets -20, 20 ms; mean 0.0 ms, SD 28.3 ms', // the first selection
      '[K2] session: 1 selections, 2 presses; mean 0.0 ms, SD 28.3 ms', // totals after it
      '[K2] selection 2 "Help": offsets 30 ms; mean 30.0 ms, SD n/a', // the second selection
      '[K2] session: 2 selections, 3 presses; mean 10.0 ms, SD 26.5 ms', // totals after it
    ]); // end of the expected lines
  }); // end of the case
}); // end of K2 instrumentation
