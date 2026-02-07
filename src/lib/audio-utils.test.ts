import { describe, it, expect } from 'vitest';
import { calculateRMS, concatFloat32Arrays, float32ToArrayBuffer } from './audio-utils';

describe('calculateRMS', () => {
  it('returns 0 for an empty array', () => {
    expect(calculateRMS(new Float32Array([]))).toBe(0);
  });

  it('returns 0 for silence', () => {
    expect(calculateRMS(new Float32Array([0, 0, 0, 0]))).toBe(0);
  });

  it('returns correct RMS for a known signal', () => {
    // RMS of [1, -1, 1, -1] = sqrt((1+1+1+1)/4) = 1
    expect(calculateRMS(new Float32Array([1, -1, 1, -1]))).toBe(1);
  });

  it('computes RMS correctly for mixed values', () => {
    // RMS of [0.5, 0.5] = sqrt((0.25+0.25)/2) = 0.5
    expect(calculateRMS(new Float32Array([0.5, 0.5]))).toBeCloseTo(0.5);
  });
});

describe('concatFloat32Arrays', () => {
  it('returns an empty array for empty input', () => {
    const result = concatFloat32Arrays([]);
    expect(result.length).toBe(0);
  });

  it('returns a copy for a single array', () => {
    const input = new Float32Array([1, 2, 3]);
    const result = concatFloat32Arrays([input]);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it('concatenates multiple arrays', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([3, 4, 5]);
    const result = concatFloat32Arrays([a, b]);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves values including negatives and decimals', () => {
    const a = new Float32Array([-1, 0.5]);
    const b = new Float32Array([0, 0.25]);
    const result = concatFloat32Arrays([a, b]);
    expect(result[0]).toBeCloseTo(-1);
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[2]).toBeCloseTo(0);
    expect(result[3]).toBeCloseTo(0.25);
  });
});

describe('float32ToArrayBuffer', () => {
  it('round-trips correctly', () => {
    const original = new Float32Array([0.1, -0.5, 1.0, 0]);
    const buffer = float32ToArrayBuffer(original);
    const restored = new Float32Array(buffer);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('preserves byte length', () => {
    const input = new Float32Array(10);
    const buffer = float32ToArrayBuffer(input);
    expect(buffer.byteLength).toBe(10 * 4); // 4 bytes per float32
  });
});
