import type { TranscriptSegment } from '@/types/transcription';

/**
 * Pick the next available speaker_N id by scanning every segment's speakerId,
 * extracting the trailing integer from any that match `speaker_<digits>`, and
 * returning `speaker_<max+1>`. IDs in other formats (e.g. sherpa-onnx's
 * "Speaker A") are ignored for numbering — the minted ID always uses the
 * `speaker_N` form. When no matching IDs exist, returns `speaker_0`.
 */
export function nextSpeakerId(segments: TranscriptSegment[]): string {
  let max = -1;
  for (const s of segments) {
    if (!s.speakerId) continue;
    const match = /^speaker_(\d+)$/.exec(s.speakerId);
    if (!match) continue;
    const n = Number.parseInt(match[1], 10);
    if (n > max) max = n;
  }
  return `speaker_${max + 1}`;
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
