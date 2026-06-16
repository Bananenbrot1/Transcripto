import { describe, it, expect } from 'vitest';
import { nextSpeakerId, reassignSegments } from './speaker-utils';
import type { TranscriptSegment } from '@/types/transcription';

function seg(id: string, speakerId: string | undefined): TranscriptSegment {
  return {
    id,
    source: 'mic',
    speaker: speakerId ?? '',
    speakerId,
    text: '',
    timestamp: 0,
    speechStartMs: 0,
    startTime: 0,
    endTime: 0,
  };
}

describe('nextSpeakerId', () => {
  it('returns speaker_0 when no segments have a speakerId', () => {
    expect(nextSpeakerId([])).toBe('speaker_0');
    expect(nextSpeakerId([seg('a', undefined)])).toBe('speaker_0');
  });

  it('returns max+1 of trailing integers in speaker_N IDs', () => {
    const segs = [seg('a', 'speaker_0'), seg('b', 'speaker_2'), seg('c', 'speaker_1')];
    expect(nextSpeakerId(segs)).toBe('speaker_3');
  });

  it('ignores IDs that do not match the speaker_N pattern', () => {
    const segs = [seg('a', 'Speaker A'), seg('b', 'speaker_5'), seg('c', 'sherpa-onnx-7')];
    expect(nextSpeakerId(segs)).toBe('speaker_6');
  });

  it('returns speaker_0 when only non-matching IDs exist', () => {
    const segs = [seg('a', 'Speaker A'), seg('b', 'Speaker B')];
    expect(nextSpeakerId(segs)).toBe('speaker_0');
  });
});

describe('reassignSegments', () => {
  it('updates speakerId only for segments whose id is in the set', () => {
    const segs = [
      seg('a', 'speaker_0'),
      seg('b', 'speaker_0'),
      seg('c', 'speaker_0'),
    ];
    const result = reassignSegments(segs, new Set(['a', 'c']), 'speaker_2');
    expect(result[0].speakerId).toBe('speaker_2');
    expect(result[1].speakerId).toBe('speaker_0');
    expect(result[2].speakerId).toBe('speaker_2');
  });

  it('updates the bare speaker field alongside speakerId', () => {
    // Sherpa-onnx assigns "Speaker A" to both fields on diarization. After
    // reassigning to "Speaker H", display logic that falls back to
    // segment.speaker (when no speakerNames mapping exists) must follow.
    const segs = [
      { ...seg('a', 'Speaker A'), speaker: 'Speaker A' },
      { ...seg('b', 'Speaker A'), speaker: 'Speaker A' },
    ];
    const result = reassignSegments(segs, new Set(['a']), 'Speaker H');
    expect(result[0].speakerId).toBe('Speaker H');
    expect(result[0].speaker).toBe('Speaker H');
    expect(result[1].speakerId).toBe('Speaker A');
    expect(result[1].speaker).toBe('Speaker A');
  });

  it('returns a new array and does not mutate the input', () => {
    const segs = [seg('a', 'speaker_0')];
    const result = reassignSegments(segs, new Set(['a']), 'speaker_1');
    expect(result).not.toBe(segs);
    expect(segs[0].speakerId).toBe('speaker_0');
  });

  it('is a no-op visually when targetSpeakerId matches current', () => {
    const segs = [seg('a', 'speaker_0')];
    const result = reassignSegments(segs, new Set(['a']), 'speaker_0');
    expect(result[0].speakerId).toBe('speaker_0');
  });

  it('ignores ids that are not present in the segments list', () => {
    const segs = [seg('a', 'speaker_0')];
    const result = reassignSegments(segs, new Set(['nonexistent']), 'speaker_2');
    expect(result[0].speakerId).toBe('speaker_0');
  });
});
