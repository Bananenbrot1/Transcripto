import type { DiarizationSegment, TranscriptSegment } from '@/types/transcription';

export const SAMPLE_RATE = 16000;

/** Diarization segments shorter than this are merged with an adjacent segment. */
export const MIN_SEGMENT_DURATION_SEC = 0.3;

/** Byte offsets into a 16kHz mono Float32 file for a [start, end] second range. */
export function sliceByteOffsets(
  start: number,
  end: number,
  sampleRate: number = SAMPLE_RATE,
): { startByte: number; endByte: number } {
  return {
    startByte: Math.max(0, Math.floor(start * sampleRate)) * 4,
    endByte: Math.max(0, Math.floor(end * sampleRate)) * 4,
  };
}

/**
 * Merge diarization segments shorter than `minDuration` into an adjacent segment.
 * Whisper hallucinates on sub-0.3s audio, so tiny slices are folded into the
 * nearest same-speaker neighbour (or, failing that, the temporally nearest one).
 */
export function mergeShortSegments(
  segments: DiarizationSegment[],
  minDuration: number = MIN_SEGMENT_DURATION_SEC,
): DiarizationSegment[] {
  const result = segments.map((s) => ({ ...s }));

  while (result.length > 1) {
    const idx = result.findIndex((s) => s.end - s.start < minDuration);
    if (idx === -1) break;

    const seg = result[idx];
    const prev = idx > 0 ? result[idx - 1] : null;
    const next = idx < result.length - 1 ? result[idx + 1] : null;

    const prevSame = prev != null && prev.speaker === seg.speaker;
    const nextSame = next != null && next.speaker === seg.speaker;

    let target: DiarizationSegment | null;
    if (prevSame && nextSame) {
      target = seg.start - prev!.end <= next!.start - seg.end ? prev : next;
    } else if (prevSame) {
      target = prev;
    } else if (nextSame) {
      target = next;
    } else if (!prev) {
      target = next;
    } else if (!next) {
      target = prev;
    } else {
      target = seg.start - prev.end <= next.start - seg.end ? prev : next;
    }

    if (!target) break;

    target.start = Math.min(target.start, seg.start);
    target.end = Math.max(target.end, seg.end);
    target.startByte = Math.min(
      target.startByte ?? sliceByteOffsets(target.start, target.end).startByte,
      seg.startByte ?? sliceByteOffsets(seg.start, seg.end).startByte,
    );
    target.endByte = Math.max(
      target.endByte ?? sliceByteOffsets(target.start, target.end).endByte,
      seg.endByte ?? sliceByteOffsets(seg.start, seg.end).endByte,
    );
    result.splice(idx, 1);
  }

  return result;
}

/** Build the rolling prompt window (last `maxWords` words) from prior text. */
export function buildPromptWindow(words: string[], maxWords: number = 50): string {
  return words.slice(-maxWords).join(' ');
}

/** Assemble a diarized TranscriptSegment from a re-transcription result. */
export function buildDiarizedSegment(
  index: number,
  segment: DiarizationSegment,
  text: string,
  recordingStartTime: number,
): TranscriptSegment {
  const speechStartMs = recordingStartTime + segment.start * 1000;
  return {
    id: `diar-${index}`,
    source: 'system',
    speaker: segment.speaker,
    speakerId: segment.speaker,
    text,
    timestamp: speechStartMs,
    speechStartMs,
    startTime: segment.start,
    endTime: segment.end,
  };
}
