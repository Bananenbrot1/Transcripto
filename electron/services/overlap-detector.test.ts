import { describe, it, expect, beforeEach } from 'vitest';
import {
  OverlapDetector,
  OVERLAP_WINDOW_MS,
  OVERLAP_STEP_MS,
  type EmbeddingWindow,
} from './overlap-detector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_RATE_HZ = 16_000;

/**
 * Build a Float32Array that corresponds to the given duration.
 * The sample values are irrelevant — only the length matters.
 */
function makeSamples(durationMs: number): Float32Array {
  return new Float32Array(Math.round((durationMs / 1000) * SAMPLE_RATE_HZ));
}

/**
 * Make a dummy embedding (just a non-empty 2-element vector).
 */
function makeEmbedding(val = 0.5): Float32Array {
  return new Float32Array([val, 1 - val]);
}

/**
 * Build an EmbeddingWindow helper.
 */
function makeWindow(
  startMs: number,
  endMs: number,
  speakerId: string,
): EmbeddingWindow {
  return { startMs, endMs, speakerId, embedding: makeEmbedding() };
}

/**
 * Build a standard sequence of EmbeddingWindow objects for a segment of the
 * given duration using the canonical 1500 ms window / 750 ms step.
 *
 * @param durationMs   - total segment duration in ms
 * @param speakerFn    - function from window index → speakerId string
 */
function makeWindows(
  durationMs: number,
  speakerFn: (windowIdx: number) => string,
): EmbeddingWindow[] {
  const windows: EmbeddingWindow[] = [];
  let start = 0;
  let idx = 0;
  while (start + OVERLAP_WINDOW_MS <= durationMs) {
    windows.push(makeWindow(start, start + OVERLAP_WINDOW_MS, speakerFn(idx)));
    start += OVERLAP_STEP_MS;
    idx++;
  }
  return windows;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OverlapDetector', () => {
  let detector: OverlapDetector;

  beforeEach(() => {
    detector = new OverlapDetector();
  });

  // -------------------------------------------------------------------------
  // Short-segment guard
  // -------------------------------------------------------------------------

  describe('short-segment guard', () => {
    it('returns [] when audio is shorter than OVERLAP_WINDOW_MS (1 s segment)', () => {
      const audio = makeSamples(1000); // 1 000 ms < 1 500 ms
      const windows = [makeWindow(0, 1000, 'speaker-a')];
      expect(detector.detectOverlap(audio, windows)).toEqual([]);
    });

    it('returns [] for a 1499 ms segment (exactly below threshold)', () => {
      const audio = makeSamples(1499);
      const windows = [makeWindow(0, 1499, 'speaker-a')];
      expect(detector.detectOverlap(audio, windows)).toEqual([]);
    });

    it('does not skip detection for a segment exactly at OVERLAP_WINDOW_MS (1500 ms)', () => {
      // Only one possible window at 1500 ms, so windowEmbeddings.length === 1 → no pairs → []
      // but the short-segment guard must NOT fire.
      const audio = makeSamples(OVERLAP_WINDOW_MS);
      // Single window — no pair to compare, but that's fine; the result is [].
      const windows = [makeWindow(0, OVERLAP_WINDOW_MS, 'speaker-a')];
      // No overlap possible with a single window (length < 2 guard kicks in).
      expect(detector.detectOverlap(audio, windows)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Single-speaker segment
  // -------------------------------------------------------------------------

  describe('single-speaker segment', () => {
    it('returns [] when all windows belong to the same speaker (3 s segment)', () => {
      // 3 s → windows at 0, 750, 1500 ms (3 windows, all speaker-a)
      const audio = makeSamples(3000);
      const windows = makeWindows(3000, () => 'speaker-a');
      expect(detector.detectOverlap(audio, windows)).toEqual([]);
    });

    it('returns [] when all windows belong to the same speaker (5 s segment)', () => {
      const audio = makeSamples(5000);
      const windows = makeWindows(5000, () => 'speaker-b');
      expect(detector.detectOverlap(audio, windows)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Two-speaker overlap
  // -------------------------------------------------------------------------

  describe('two-speaker overlap', () => {
    it('returns one overlap result with two speaker IDs when speakers differ in consecutive windows', () => {
      // 3 s segment → 3 windows: [0,1500], [750,2250], [1500,3000]
      // Assign: window 0 → speaker-a, window 1 → speaker-b, window 2 → speaker-b
      const audio = makeSamples(3000);
      const windows = makeWindows(3000, (i) => (i === 0 ? 'speaker-a' : 'speaker-b'));

      const results = detector.detectOverlap(audio, windows);

      expect(results).toHaveLength(1);
      expect(results[0].speakers).toHaveLength(2);
      expect(results[0].speakers).toContain('speaker-a');
      expect(results[0].speakers).toContain('speaker-b');
    });

    it('overlap region boundaries are approximately correct', () => {
      // Window 0: [0, 1500] → speaker-a
      // Window 1: [750, 2250] → speaker-b
      // Overlap = intersection = [max(0,750), min(1500,2250)] = [750, 1500]
      const audio = makeSamples(3000);
      const windows = makeWindows(3000, (i) => (i === 0 ? 'speaker-a' : 'speaker-b'));

      const results = detector.detectOverlap(audio, windows);

      expect(results[0].startMs).toBe(750);
      expect(results[0].endMs).toBe(1500);
    });

    it('detects a speaker switch in the middle of a longer segment', () => {
      // 4.5 s → windows at 0, 750, 1500, 2250, 3000 ms
      // First two windows are speaker-a, last three are speaker-b
      // Only pair (1,2) differs → overlap at [1500, 2250]
      const audio = makeSamples(4500);
      const windows = makeWindows(4500, (i) => (i < 2 ? 'speaker-a' : 'speaker-b'));

      const results = detector.detectOverlap(audio, windows);

      expect(results).toHaveLength(1);
      expect(results[0].startMs).toBe(1500); // max(750, 1500)
      expect(results[0].endMs).toBe(2250);   // min(2250, 3000)
      expect(results[0].speakers).toContain('speaker-a');
      expect(results[0].speakers).toContain('speaker-b');
    });
  });

  // -------------------------------------------------------------------------
  // Merging of adjacent overlap regions
  // -------------------------------------------------------------------------

  describe('merging adjacent overlap regions', () => {
    it('merges two consecutive overlap regions between the same speaker pair', () => {
      // Build windows manually:
      // [0, 1500] → speaker-a
      // [750, 2250] → speaker-b   (pair 0→1: overlap [750,1500])
      // [1500, 3000] → speaker-a  (pair 1→2: overlap [1500,2250], same set {a,b})
      // These two adjacent regions should be merged → [750, 2250]
      const audio = makeSamples(4500);
      const windows = [
        makeWindow(0, 1500, 'speaker-a'),
        makeWindow(750, 2250, 'speaker-b'),
        makeWindow(1500, 3000, 'speaker-a'),
        makeWindow(2250, 3750, 'speaker-a'), // same speaker — no new overlap
      ];

      const results = detector.detectOverlap(audio, windows);

      // Two raw overlap regions [750,1500] and [1500,2250] are adjacent and
      // share the same speaker set → merged into one [750,2250].
      expect(results).toHaveLength(1);
      expect(results[0].startMs).toBe(750);
      expect(results[0].endMs).toBe(2250);
    });

    it('does NOT merge non-adjacent overlap regions with different speaker pairs', () => {
      // Two separate transitions between different pairs
      const audio = makeSamples(6000);
      const windows = [
        makeWindow(0, 1500, 'speaker-a'),
        makeWindow(750, 2250, 'speaker-b'),    // overlap [750,1500] → [a,b]
        makeWindow(1500, 3000, 'speaker-b'),   // same as previous → no new overlap
        makeWindow(2250, 3750, 'speaker-b'),   // same
        makeWindow(3000, 4500, 'speaker-c'),   // overlap [3750,4500] → [b,c]
        makeWindow(3750, 5250, 'speaker-c'),   // same
      ];

      const results = detector.detectOverlap(audio, windows);

      expect(results).toHaveLength(2);
      expect(results[0].speakers).toContain('speaker-a');
      expect(results[0].speakers).toContain('speaker-b');
      expect(results[1].speakers).toContain('speaker-b');
      expect(results[1].speakers).toContain('speaker-c');
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns [] when windowEmbeddings is empty', () => {
      const audio = makeSamples(3000);
      expect(detector.detectOverlap(audio, [])).toEqual([]);
    });

    it('returns [] when windowEmbeddings has only one entry', () => {
      const audio = makeSamples(3000);
      const windows = [makeWindow(0, 1500, 'speaker-a')];
      expect(detector.detectOverlap(audio, windows)).toEqual([]);
    });

    it('returns [] when windowEmbeddings has only one entry and all windows agree', () => {
      const audio = makeSamples(3000);
      const windows = makeWindows(3000, () => 'speaker-x');
      expect(detector.detectOverlap(audio, windows)).toEqual([]);
    });
  });
});
