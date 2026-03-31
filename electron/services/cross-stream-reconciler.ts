/**
 * CrossStreamReconciler
 *
 * Detects when the same speaker appears in both the mic and system audio
 * streams so that echo and crosstalk can be handled correctly.
 *
 * Two responsibilities:
 *   1. checkCrossStream  — low-level similarity check between two speaker
 *      embeddings; returns a discrete action to take.
 *   2. mergeStreamResults — higher-level merge of two diarization segment
 *      arrays; interleaves by timestamp and applies per-segment suppression
 *      decisions when embeddings are provided.
 */

import type { DiarizationSegment, MergedSegment } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrossStreamAction = 'suppress' | 'flag' | 'distinct';

/**
 * Configurable similarity thresholds for cross-stream decisions.
 *
 * Default behaviour:
 *   similarity >= suppressThreshold (0.85) → suppress (likely echo)
 *   similarity >= flagThreshold    (0.60) → flag    (possible cross-talk)
 *   similarity <  flagThreshold           → distinct (different speakers)
 */
export interface CrossStreamThresholds {
  suppressThreshold: number;
  flagThreshold: number;
}

/**
 * A DiarizationSegment extended with an optional speaker embedding that
 * enables cross-stream similarity checks inside mergeStreamResults.
 * The embedding field is not serialised over IPC — it is used only within
 * the main process.
 */
export interface DiarizationSegmentWithEmbedding extends DiarizationSegment {
  embedding?: Float32Array;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two Float32 vectors.
 * Returns a value in [-1, 1]; identical normalised vectors return 1.0.
 * Returns 0 if either vector is the zero vector.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `CrossStreamReconciler: embedding dimension mismatch (${a.length} vs ${b.length})`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Returns the temporal overlap duration (in seconds) between two segments.
 * Returns 0 if they do not overlap.
 */
function overlapDuration(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  const overlapStart = Math.max(aStart, bStart);
  const overlapEnd = Math.min(aEnd, bEnd);
  return Math.max(0, overlapEnd - overlapStart);
}

// ---------------------------------------------------------------------------
// CrossStreamReconciler
// ---------------------------------------------------------------------------

export interface CrossStreamReconcilerOptions {
  /** Similarity at or above this value → suppress the system segment as echo. Default: 0.85. */
  suppressThreshold?: number;
  /** Similarity at or above this value (but below suppressThreshold) → flag the segment. Default: 0.60. */
  flagThreshold?: number;
}

export class CrossStreamReconciler {
  readonly suppressThreshold: number;
  readonly flagThreshold: number;

  constructor(options: CrossStreamReconcilerOptions = {}) {
    this.suppressThreshold = options.suppressThreshold ?? 0.85;
    this.flagThreshold = options.flagThreshold ?? 0.60;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Compares two speaker embeddings and returns the recommended action.
   *
   * @param micEmbedding  - embedding extracted from the microphone stream
   * @param sysEmbedding  - embedding extracted from the system audio stream
   * @returns 'suppress'  when similarity ≥ suppressThreshold (likely echo)
   *          'flag'      when similarity ≥ flagThreshold     (possible cross-talk)
   *          'distinct'  otherwise
   */
  checkCrossStream(
    micEmbedding: Float32Array,
    sysEmbedding: Float32Array,
  ): CrossStreamAction {
    const similarity = cosineSimilarity(micEmbedding, sysEmbedding);
    if (similarity >= this.suppressThreshold) return 'suppress';
    if (similarity >= this.flagThreshold) return 'flag';
    return 'distinct';
  }

  /**
   * Merges mic and system diarization segment arrays into a single timeline.
   *
   * Algorithm:
   *   1. Tag every segment with its source ('mic' | 'system').
   *   2. For each system segment, find the mic segment with the greatest
   *      temporal overlap. If both segments carry embeddings, call
   *      checkCrossStream and apply the resulting action:
   *        - 'suppress' → mark system segment suppressed with reason
   *                       'cross-stream-echo'
   *        - 'flag'     → mark system segment flagged
   *        - 'distinct' → no change
   *      If embeddings are absent, the segment is left unchanged (no
   *      suppression applied; the caller is responsible for providing
   *      embeddings when cross-stream detection is needed).
   *   3. Sort the combined list by start time.
   *
   * @param micSegments - diarization segments from the microphone recording
   * @param sysSegments - diarization segments from the system audio recording
   * @returns merged, sorted MergedSegment array (suppressed segments are
   *          retained but carry suppressed: true so the UI can hide them)
   */
  mergeStreamResults(
    micSegments: DiarizationSegmentWithEmbedding[],
    sysSegments: DiarizationSegmentWithEmbedding[],
  ): MergedSegment[] {
    // Tag mic segments — no cross-stream checks on the mic side.
    const taggedMic: MergedSegment[] = micSegments.map((seg) => ({
      speaker: seg.speaker,
      start: seg.start,
      end: seg.end,
      source: 'mic',
      suppressed: false,
      flagged: false,
    }));

    // Tag and check system segments against overlapping mic segments.
    const taggedSys: MergedSegment[] = sysSegments.map((sysSeg) => {
      let suppressed = false;
      let flagged = false;
      let reason: 'cross-stream-echo' | undefined;

      if (sysSeg.embedding) {
        // Find the mic segment with the greatest temporal overlap.
        let bestOverlap = 0;
        let bestMicSeg: DiarizationSegmentWithEmbedding | null = null;

        for (const micSeg of micSegments) {
          const overlap = overlapDuration(
            micSeg.start,
            micSeg.end,
            sysSeg.start,
            sysSeg.end,
          );
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestMicSeg = micSeg;
          }
        }

        if (bestMicSeg?.embedding) {
          const action = this.checkCrossStream(bestMicSeg.embedding, sysSeg.embedding);
          if (action === 'suppress') {
            suppressed = true;
            reason = 'cross-stream-echo';
          } else if (action === 'flag') {
            flagged = true;
          }
        }
      }

      return {
        speaker: sysSeg.speaker,
        start: sysSeg.start,
        end: sysSeg.end,
        source: 'system',
        suppressed,
        reason,
        flagged,
      };
    });

    // Interleave by start time (stable sort — equal start times preserve
    // mic-before-system ordering since taggedMic comes first in the concat).
    return [...taggedMic, ...taggedSys].sort((a, b) => a.start - b.start);
  }
}
