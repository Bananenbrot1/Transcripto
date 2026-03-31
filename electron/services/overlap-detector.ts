/**
 * OverlapDetector
 *
 * Identifies simultaneous speakers within an audio segment by examining a
 * pre-computed array of per-window speaker assignments and finding regions
 * where consecutive windows disagree on speaker identity.
 *
 * Algorithm overview:
 *   1. Reject segments shorter than OVERLAP_WINDOW_MS (1500 ms) — not enough
 *      audio to compute a meaningful embedding window.
 *   2. Walk consecutive EmbeddingWindow pairs. When two adjacent windows
 *      disagree on speakerId, the temporal intersection of those two windows
 *      is an overlap region (with a standard 750 ms step the shared region is
 *      exactly 750 ms).
 *   3. Merge adjacent overlap regions that share the same set of speaker IDs.
 *
 * The caller is responsible for extracting per-window embeddings (via the
 * EmbeddingWorker), resolving speakerIds via SpeakerRegistry.matchOrCreate,
 * and then passing the resulting EmbeddingWindow array here.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default sliding-window length in milliseconds. */
export const OVERLAP_WINDOW_MS = 1500;

/** Default step between window starts in milliseconds. */
export const OVERLAP_STEP_MS = 750;

/**
 * Project-wide sample rate for audio passed through the VAD / Whisper /
 * speaker-embedding pipeline (16 kHz mono Float32 PCM).
 */
const SAMPLE_RATE_HZ = 16_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A time-stamped speaker embedding extracted from a sub-window of an audio
 * segment.  Consumers build this array by slicing the segment with a
 * OVERLAP_STEP_MS step and passing each slice to the EmbeddingWorker, then
 * resolving the resulting embedding against the SpeakerRegistry.
 */
export interface EmbeddingWindow {
  /** Start of this window relative to the beginning of the audio segment, in ms. */
  startMs: number;
  /** End of this window relative to the beginning of the audio segment, in ms. */
  endMs: number;
  /** Stable speaker ID from SpeakerRegistry (e.g. a UUID or 'speaker-a'). */
  speakerId: string;
  /** Raw embedding vector returned by the EmbeddingWorker. */
  embedding: Float32Array;
}

/**
 * A detected overlap region: a time range during which two or more speakers
 * were active simultaneously.
 */
export interface OverlapResult {
  /** Start of the overlap region in ms, relative to the audio segment start. */
  startMs: number;
  /** End of the overlap region in ms, relative to the audio segment start. */
  endMs: number;
  /** IDs of the speakers detected as overlapping within this region. */
  speakers: string[];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when arrays `a` and `b` contain exactly the same set of
 * string values (order-independent).
 */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((s) => setA.has(s));
}

/**
 * Merges consecutive OverlapResult entries that are temporally adjacent (or
 * overlapping) AND share the same set of speaker IDs.
 */
function mergeOverlapResults(results: OverlapResult[]): OverlapResult[] {
  if (results.length === 0) return [];

  const merged: OverlapResult[] = [
    { ...results[0], speakers: [...results[0].speakers] },
  ];

  for (let i = 1; i < results.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = results[i];

    if (prev.endMs >= curr.startMs && sameSet(prev.speakers, curr.speakers)) {
      // Extend the previous region rather than creating a new one.
      prev.endMs = Math.max(prev.endMs, curr.endMs);
    } else {
      merged.push({ ...curr, speakers: [...curr.speakers] });
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// OverlapDetector
// ---------------------------------------------------------------------------

export class OverlapDetector {
  /**
   * Detects overlap regions within an audio segment.
   *
   * @param audioSegment     - Float32 PCM at 16 kHz mono (same format as
   *                           Whisper / EmbeddingWorker inputs).
   * @param windowEmbeddings - Pre-computed per-window speaker assignments,
   *                           ordered by startMs (ascending).
   * @returns Array of OverlapResult (empty when no overlap is detected).
   *          If the segment is shorter than OVERLAP_WINDOW_MS, returns [].
   */
  detectOverlap(
    audioSegment: Float32Array,
    windowEmbeddings: EmbeddingWindow[],
  ): OverlapResult[] {
    // Segments shorter than the minimum window are not analysed.
    const durationMs = (audioSegment.length / SAMPLE_RATE_HZ) * 1000;
    if (durationMs < OVERLAP_WINDOW_MS) return [];

    // Need at least two windows to compare.
    if (windowEmbeddings.length < 2) return [];

    const raw: OverlapResult[] = [];

    for (let i = 0; i < windowEmbeddings.length - 1; i++) {
      const current = windowEmbeddings[i];
      const next = windowEmbeddings[i + 1];

      if (current.speakerId === next.speakerId) continue;

      // The overlap region is the temporal intersection of the two windows.
      // With the standard 750 ms step the two windows share a 750 ms region.
      const overlapStart = Math.max(current.startMs, next.startMs);
      const overlapEnd = Math.min(current.endMs, next.endMs);

      if (overlapEnd > overlapStart) {
        raw.push({
          startMs: overlapStart,
          endMs: overlapEnd,
          speakers: [current.speakerId, next.speakerId],
        });
      }
    }

    return mergeOverlapResults(raw);
  }
}
