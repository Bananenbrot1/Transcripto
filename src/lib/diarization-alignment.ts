/**
 * Pure functions for aligning transcript segments to diarization results using
 * time-window overlap rather than single-point containment.
 *
 * All functions are side-effect-free and operate only on their arguments so
 * they can be unit-tested without IPC or Electron.
 */

import type { TranscriptSegment, DiarizationSegment } from '@/types/transcription';

/**
 * Compute the temporal overlap between two intervals [aStart, aEnd] and
 * [bStart, bEnd].  Returns 0 when the intervals are disjoint or adjacent.
 */
export function computeOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Find the diarization segment with the greatest temporal overlap with the
 * interval [segStart, segEnd] (both in recording-relative seconds).
 *
 * When the interval has zero length (degenerate point), falls back to checking
 * which diarization interval contains the point.
 *
 * @returns The best-matching segment, or null when no overlap exists.
 */
export function findBestDiarizationMatch<T extends DiarizationSegment>(
  segStart: number,
  segEnd: number,
  diarSegments: T[],
): T | null {
  // Degenerate case: zero-width segment — use point containment.
  if (segStart >= segEnd) {
    return (
      diarSegments.find((d) => segStart >= d.start && segStart <= d.end) ?? null
    );
  }

  let bestMatch: T | null = null;
  let bestOverlap = 0;

  for (const d of diarSegments) {
    const overlap = computeOverlap(segStart, segEnd, d.start, d.end);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = d;
    }
  }

  return bestMatch;
}

/**
 * Align transcript segments to diarization results using time-window overlap.
 *
 * For each transcript segment the diarization interval with the greatest
 * temporal overlap is selected and its speaker label is applied.  If no
 * interval overlaps the segment's time window the segment retains its
 * existing real-time speaker label.
 *
 * @param transcriptSegments  Segments produced by the real-time pipeline.
 * @param diarSegments        Segments produced by post-recording diarization.
 * @param recordingStartMs    Wall-clock ms at which recording began.
 */
export function alignSegmentsToDiarization(
  transcriptSegments: TranscriptSegment[],
  diarSegments: DiarizationSegment[],
  recordingStartMs: number,
): TranscriptSegment[] {
  return transcriptSegments.map((seg) => {
    // Convert to recording-relative seconds.
    // speechStartMs marks the beginning of the audio buffer sent to Whisper.
    // startTime / endTime are Whisper centiseconds (t0/t1) within that buffer.
    const bufferStartSec = (seg.speechStartMs - recordingStartMs) / 1000;
    const segStart = bufferStartSec + seg.startTime / 100;
    const segEnd = bufferStartSec + seg.endTime / 100;

    const match = findBestDiarizationMatch(segStart, segEnd, diarSegments);
    if (!match) return seg;
    return { ...seg, speaker: match.speaker, speakerId: match.speaker };
  });
}
