import { describe, it, expect } from 'vitest';

/**
 * Float32-to-Int16 conversion extracted from whisper-service.js (lines 27-29).
 * This is the same logic used before calling whisper.node's transcribeData.
 */
function float32ToInt16(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

describe('Float32 to Int16 conversion', () => {
  it('positive values map to 0x7FFF range', () => {
    const result = float32ToInt16(new Float32Array([1.0]));
    expect(result[0]).toBe(0x7fff); // 32767
  });

  it('negative values map to 0x8000 range', () => {
    const result = float32ToInt16(new Float32Array([-1.0]));
    expect(result[0]).toBe(-0x8000); // -32768
  });

  it('zero maps to zero', () => {
    const result = float32ToInt16(new Float32Array([0]));
    expect(result[0]).toBe(0);
  });

  it('values are clamped to [-1, 1]', () => {
    const result = float32ToInt16(new Float32Array([2.0, -3.0]));
    // 2.0 clamped to 1.0 → 0x7FFF
    expect(result[0]).toBe(0x7fff);
    // -3.0 clamped to -1.0 → -0x8000
    expect(result[1]).toBe(-0x8000);
  });

  it('mid-range values scale correctly', () => {
    const result = float32ToInt16(new Float32Array([0.5, -0.5]));
    // 0.5 * 0x7FFF = 16383.5 → truncated to 16383
    expect(result[0]).toBe(Math.trunc(0.5 * 0x7fff));
    // -0.5 * 0x8000 = -16384
    expect(result[1]).toBe(Math.trunc(-0.5 * 0x8000));
  });

  it('handles multiple samples', () => {
    const input = new Float32Array([0, 0.25, -0.25, 1, -1]);
    const result = float32ToInt16(input);
    expect(result.length).toBe(5);
    expect(result[0]).toBe(0);
    expect(result[3]).toBe(0x7fff);
    expect(result[4]).toBe(-0x8000);
  });
});
