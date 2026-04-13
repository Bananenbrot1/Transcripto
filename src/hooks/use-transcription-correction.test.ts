import { describe, it, expect, vi } from 'vitest';

describe('correction timeout', () => {
  it('falls back to raw text when correctSegment times out', async () => {
    vi.useFakeTimers();

    let timeoutReached = false;
    const slowCorrect = new Promise<string>((resolve) => setTimeout(() => resolve('corrected'), 5000));
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => { timeoutReached = true; reject(new Error('timeout')); }, 2000),
    );

    const racePromise = Promise.race([slowCorrect, timeout]).catch(() => null);
    await vi.advanceTimersByTimeAsync(2500);
    const result = await racePromise;

    expect(timeoutReached).toBe(true);
    expect(result).toBeNull();

    vi.useRealTimers();
  });
});
