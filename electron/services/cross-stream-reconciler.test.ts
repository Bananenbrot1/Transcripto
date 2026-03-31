import { describe, it, expect, beforeEach } from 'vitest';
import {
  CrossStreamReconciler,
  type DiarizationSegmentWithEmbedding,
} from './cross-stream-reconciler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a 2-D unit vector at angle `angleDeg` from the positive x-axis.
 * Two such vectors have cosine similarity = cos(angleDeg_b - angleDeg_a).
 * This gives precise, predictable similarity values for tests.
 */
function makeEmbedding(angleDeg: number): Float32Array {
  const rad = (angleDeg * Math.PI) / 180;
  return new Float32Array([Math.cos(rad), Math.sin(rad)]);
}

/**
 * Similarity between two angle-based embeddings = cos(b - a).
 * Reference table used in tests:
 *   same angle               → similarity = 1.0     → suppress
 *   30° apart (0° vs 30°)   → similarity ≈ 0.866   → suppress (≥ 0.85)
 *   40° apart (0° vs 40°)   → similarity ≈ 0.766   → flag     (0.60–0.85)
 *   70° apart (0° vs 70°)   → similarity ≈ 0.342   → distinct (< 0.60)
 *   90° apart (0° vs 90°)   → similarity = 0.0     → distinct
 */

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrossStreamReconciler', () => {
  let reconciler: CrossStreamReconciler;

  beforeEach(() => {
    reconciler = new CrossStreamReconciler();
  });

  // -------------------------------------------------------------------------
  // checkCrossStream
  // -------------------------------------------------------------------------

  describe('checkCrossStream', () => {
    it('returns "suppress" for identical embeddings (similarity = 1.0)', () => {
      const emb = makeEmbedding(0);
      expect(reconciler.checkCrossStream(emb, emb)).toBe('suppress');
    });

    it('returns "suppress" when similarity is above suppressThreshold (30° apart → ~0.866)', () => {
      // cos(30°) ≈ 0.866 which is ≥ default suppressThreshold 0.85 → suppress
      const a = makeEmbedding(0);
      const b = makeEmbedding(30);
      expect(reconciler.checkCrossStream(a, b)).toBe('suppress');
    });

    it('returns "flag" for embeddings at ~0.766 similarity (40° apart)', () => {
      // cos(40°) ≈ 0.766 which is between 0.60 and 0.85 → flag
      const a = makeEmbedding(0);
      const b = makeEmbedding(40);
      expect(reconciler.checkCrossStream(a, b)).toBe('flag');
    });

    it('returns "distinct" for unrelated embeddings (90° apart → similarity = 0)', () => {
      // cos(90°) = 0 which is below default flagThreshold 0.60 → distinct
      const a = makeEmbedding(0);
      const b = makeEmbedding(90);
      expect(reconciler.checkCrossStream(a, b)).toBe('distinct');
    });

    it('respects custom suppressThreshold', () => {
      // cos(40°) ≈ 0.766; with suppressThreshold=0.70, this should suppress
      const custom = new CrossStreamReconciler({ suppressThreshold: 0.70 });
      const a = makeEmbedding(0);
      const b = makeEmbedding(40);
      expect(custom.checkCrossStream(a, b)).toBe('suppress');
    });

    it('respects custom flagThreshold', () => {
      // cos(40°) ≈ 0.766; with flagThreshold=0.80 and suppressThreshold=0.90,
      // 0.766 < 0.80 flagThreshold → distinct (below the custom flag threshold)
      const custom = new CrossStreamReconciler({ flagThreshold: 0.80, suppressThreshold: 0.90 });
      const a = makeEmbedding(0);
      const b = makeEmbedding(40);
      expect(custom.checkCrossStream(a, b)).toBe('distinct');
    });

    it('returns "distinct" when similarity is below both thresholds (70° apart → ~0.342)', () => {
      const a = makeEmbedding(0);
      const b = makeEmbedding(70); // cos(70°) ≈ 0.342 < 0.60 → distinct
      expect(reconciler.checkCrossStream(a, b)).toBe('distinct');
    });

    it('throws when embedding dimensions do not match', () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([1, 0, 0]);
      expect(() => reconciler.checkCrossStream(a, b)).toThrow('dimension mismatch');
    });
  });

  // -------------------------------------------------------------------------
  // mergeStreamResults
  // -------------------------------------------------------------------------

  describe('mergeStreamResults', () => {
    it('interleaves segments from both streams in start-time order', () => {
      const micSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 0, end: 2 },
        { speaker: 'Speaker A', start: 5, end: 7 },
      ];
      const sysSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker B', start: 3, end: 5 },
      ];
      const merged = reconciler.mergeStreamResults(micSegs, sysSegs);
      expect(merged.map((s) => s.start)).toEqual([0, 3, 5]);
      expect(merged.map((s) => s.source)).toEqual(['mic', 'system', 'mic']);
    });

    it('tags all mic segments with source "mic"', () => {
      const mic: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 0, end: 1 },
        { speaker: 'Speaker A', start: 2, end: 3 },
      ];
      const merged = reconciler.mergeStreamResults(mic, []);
      expect(merged.every((s) => s.source === 'mic')).toBe(true);
    });

    it('tags all system segments with source "system"', () => {
      const sys: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker B', start: 0, end: 1 },
      ];
      const merged = reconciler.mergeStreamResults([], sys);
      expect(merged.every((s) => s.source === 'system')).toBe(true);
    });

    it('suppresses overlapping system segment when embeddings are identical', () => {
      const emb = makeEmbedding(0); // same angle → similarity = 1.0 → suppress
      const micSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 0, end: 4, embedding: emb },
      ];
      const sysSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 1, end: 3, embedding: emb },
      ];
      const merged = reconciler.mergeStreamResults(micSegs, sysSegs);
      const sysSeg = merged.find((s) => s.source === 'system')!;
      expect(sysSeg.suppressed).toBe(true);
      expect(sysSeg.reason).toBe('cross-stream-echo');
    });

    it('flags overlapping system segment when embeddings have medium similarity', () => {
      // cos(40°) ≈ 0.766 → between 0.60 flagThreshold and 0.85 suppressThreshold → flag
      const micEmb = makeEmbedding(0);
      const sysEmb = makeEmbedding(40);
      const micSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 0, end: 4, embedding: micEmb },
      ];
      const sysSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker X', start: 1, end: 3, embedding: sysEmb },
      ];
      const merged = reconciler.mergeStreamResults(micSegs, sysSegs);
      const sysSeg = merged.find((s) => s.source === 'system')!;
      expect(sysSeg.suppressed).toBe(false);
      expect(sysSeg.flagged).toBe(true);
    });

    it('does not suppress non-overlapping segments even with identical embeddings', () => {
      const emb = makeEmbedding(0); // same angle → would suppress if overlapping
      const micSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 0, end: 2, embedding: emb },
      ];
      const sysSegs: DiarizationSegmentWithEmbedding[] = [
        // Starts after mic segment ends — no temporal overlap.
        { speaker: 'Speaker A', start: 3, end: 5, embedding: emb },
      ];
      const merged = reconciler.mergeStreamResults(micSegs, sysSegs);
      const sysSeg = merged.find((s) => s.source === 'system')!;
      expect(sysSeg.suppressed).toBe(false);
      expect(sysSeg.flagged).toBe(false);
    });

    it('does not suppress system segment when no embeddings are provided', () => {
      const micSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 0, end: 4 },
      ];
      const sysSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 1, end: 3 },
      ];
      const merged = reconciler.mergeStreamResults(micSegs, sysSegs);
      const sysSeg = merged.find((s) => s.source === 'system')!;
      expect(sysSeg.suppressed).toBe(false);
      expect(sysSeg.flagged).toBe(false);
    });

    it('correctly orders and suppresses segments in a mixed scenario', () => {
      const emb = makeEmbedding(0);          // will suppress overlapping system echo
      const unrelated = makeEmbedding(90);   // cos(90°) = 0 → distinct

      // mic:    [0-3] speaker A (will cause system echo suppression)
      // system: [1-2] speaker A echo → suppressed
      // system: [5-7] different speaker → not suppressed
      const micSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 0, end: 3, embedding: emb },
      ];
      const sysSegs: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 1, end: 2, embedding: emb },
        { speaker: 'Speaker B', start: 5, end: 7, embedding: unrelated },
      ];

      const merged = reconciler.mergeStreamResults(micSegs, sysSegs);

      // Ordering: 0 (mic), 1 (sys-echo), 5 (sys-other)
      expect(merged.map((s) => s.start)).toEqual([0, 1, 5]);
      expect(merged[0].source).toBe('mic');
      expect(merged[0].suppressed).toBe(false);

      expect(merged[1].source).toBe('system');
      expect(merged[1].suppressed).toBe(true);
      expect(merged[1].reason).toBe('cross-stream-echo');

      expect(merged[2].source).toBe('system');
      expect(merged[2].suppressed).toBe(false);
      expect(merged[2].flagged).toBe(false);
    });

    it('returns empty array when both inputs are empty', () => {
      expect(reconciler.mergeStreamResults([], [])).toEqual([]);
    });

    it('handles mic-only input', () => {
      const mic: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker A', start: 0, end: 1 },
      ];
      const merged = reconciler.mergeStreamResults(mic, []);
      expect(merged).toHaveLength(1);
      expect(merged[0].source).toBe('mic');
    });

    it('handles system-only input', () => {
      const sys: DiarizationSegmentWithEmbedding[] = [
        { speaker: 'Speaker B', start: 0, end: 1 },
      ];
      const merged = reconciler.mergeStreamResults([], sys);
      expect(merged).toHaveLength(1);
      expect(merged[0].source).toBe('system');
    });
  });
});
