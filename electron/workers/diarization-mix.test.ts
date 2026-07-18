import { describe, expect, it } from 'vitest';
import { mixMicAndSystem } from './diarization-mix.js';

function expectClose(actual: Float32Array, expected: number[]) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 5);
  }
}

describe('mixMicAndSystem', () => {
  it('averages overlapping samples', () => {
    const mic = new Float32Array([0.4, 0.6]);
    const sys = new Float32Array([0.2, 0.8]);
    expectClose(mixMicAndSystem(mic, sys, 2), [0.3, 0.7]);
  });

  it('passes through mic-only samples without halving', () => {
    const mic = new Float32Array([0.5, -0.5, 0.25]);
    const sys = new Float32Array(0);
    expectClose(mixMicAndSystem(mic, sys, 3), [0.5, -0.5, 0.25]);
  });

  it('passes through system-only samples without halving', () => {
    const mic = new Float32Array(0);
    const sys = new Float32Array([0.25, 0.5]);
    expectClose(mixMicAndSystem(mic, sys, 2), [0.25, 0.5]);
  });

  it('handles unequal lengths by averaging the overlap only', () => {
    const mic = new Float32Array([1, 1, 1]);
    const sys = new Float32Array([0.5]);
    expectClose(mixMicAndSystem(mic, sys, 3), [0.75, 1, 1]);
  });
});
