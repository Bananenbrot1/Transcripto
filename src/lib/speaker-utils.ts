import type { TranscriptSegment } from '@/types/transcription';

/**
 * Pick the next available speaker id. Format detection avoids visually mixing
 * sherpa-onnx's "Speaker A" / "Speaker B" identifiers with manually-minted
 * "speaker_N" ones in the same picker:
 *
 * - If any existing speakerId matches the sherpa pattern `/^Speaker [A-Z]$/`,
 *   mint the next letter ("Speaker A" → "Speaker B" → ... → "Speaker Z").
 * - Otherwise (no diarization yet, or only previously-minted ids exist),
 *   mint `speaker_N` where N is one above the highest existing `speaker_<n>`.
 *
 * If sherpa has produced "Speaker Z" already (rare — >26 distinct clusters)
 * the next mint falls back to the numeric scheme.
 */
export function nextSpeakerId(segments: TranscriptSegment[]): string {
  let highestLetter = -1;
  let highestNumeric = -1;
  let sherpaFormatSeen = false;
  for (const s of segments) {
    if (!s.speakerId) continue;
    const letterMatch = /^Speaker ([A-Z])$/.exec(s.speakerId);
    if (letterMatch) {
      sherpaFormatSeen = true;
      const code = letterMatch[1].charCodeAt(0) - 65; // A → 0, Z → 25
      if (code > highestLetter) highestLetter = code;
      continue;
    }
    const numericMatch = /^speaker_(\d+)$/.exec(s.speakerId);
    if (numericMatch) {
      const n = Number.parseInt(numericMatch[1], 10);
      if (n > highestNumeric) highestNumeric = n;
    }
  }
  if (sherpaFormatSeen && highestLetter < 25) {
    return `Speaker ${String.fromCharCode(65 + highestLetter + 1)}`;
  }
  return `speaker_${highestNumeric + 1}`;
}

/**
 * Return a new segments array with `speakerId` overwritten on every segment
 * whose `id` is in `selectedIds`. The `speaker` field is updated alongside
 * — TranscriptPanel and other consumers (clipboard copy, markdown export)
 * fall back to `segment.speaker` when no `speakerNames[id]` mapping exists,
 * so the bare display would otherwise keep showing the original sherpa
 * label after reassignment. Other segments are returned by reference; the
 * input array is not mutated.
 */
export function reassignSegments(
  segments: TranscriptSegment[],
  selectedIds: Set<string>,
  targetSpeakerId: string,
): TranscriptSegment[] {
  return segments.map((s) =>
    selectedIds.has(s.id)
      ? { ...s, speakerId: targetSpeakerId, speaker: targetSpeakerId }
      : s,
  );
}
