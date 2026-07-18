import { describe, expect, it } from 'vitest';
import { parseNumSpeakers } from './diarization-controls';

describe('parseNumSpeakers', () => {
  it('accepts integers from 2 to 20', () => {
    expect(parseNumSpeakers('2')).toBe(2);
    expect(parseNumSpeakers('20')).toBe(20);
    expect(parseNumSpeakers('5')).toBe(5);
  });

  it('rejects empty, non-numeric, and out-of-range values', () => {
    expect(parseNumSpeakers('')).toBeUndefined();
    expect(parseNumSpeakers('abc')).toBeUndefined();
    expect(parseNumSpeakers('1')).toBeUndefined();
    expect(parseNumSpeakers('21')).toBeUndefined();
    expect(parseNumSpeakers('0')).toBeUndefined();
    expect(parseNumSpeakers('-2')).toBeUndefined();
    expect(parseNumSpeakers('2.5')).toBeUndefined();
  });
});
