import { describe, expect, it } from 'vitest';
import {
  buildDiarizedSegment,
  buildPromptWindow,
  mergeShortSegments,
  sliceByteOffsets,
} from './retranscription';
import type { DiarizationSegment } from '@/types/transcription';

function seg(speaker: string, start: number, end: number): DiarizationSegment {
  return { speaker, start, end };
}

describe('sliceByteOffsets', () => {
  it('computes 16kHz Float32 byte offsets', () => {
    expect(sliceByteOffsets(0, 1)).toEqual({ startByte: 0, endByte: 64000 });
  });

  it('floors fractional sample positions before scaling to bytes', () => {
    // 0.5s -> 8000 samples -> 32000 bytes; 1.5s -> 24000 samples -> 96000 bytes
    expect(sliceByteOffsets(0.5, 1.5)).toEqual({ startByte: 32000, endByte: 96000 });
  });

  it('clamps negative times to zero', () => {
    expect(sliceByteOffsets(-1, 0.25)).toEqual({ startByte: 0, endByte: 16000 });
  });
});

describe('mergeShortSegments', () => {
  it('leaves segments longer than the minimum untouched', () => {
    const input = [seg('A', 0, 1), seg('B', 1, 2)];
    expect(mergeShortSegments(input)).toEqual(input);
  });

  it('merges a short segment into an adjacent same-speaker segment', () => {
    const input = [seg('A', 0, 1), seg('A', 1, 1.1), seg('B', 1.1, 2)];
    const merged = mergeShortSegments(input);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ speaker: 'A', start: 0, end: 1.1 });
    expect(merged[1]).toMatchObject({ speaker: 'B', start: 1.1, end: 2 });
  });

  it('prefers the closer same-speaker neighbour when both qualify', () => {
    // Short A at [1.0, 1.1]; prev A ends at 1.0 (gap 0), next A starts at 1.5 (gap 0.4)
    const input = [seg('A', 0, 1.0), seg('A', 1.0, 1.1), seg('A', 1.5, 2.5)];
    const merged = mergeShortSegments(input);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ start: 0, end: 1.1 });
    expect(merged[1]).toMatchObject({ start: 1.5, end: 2.5 });
  });

  it('folds into the temporally nearest neighbour when no same-speaker exists', () => {
    // Short C between A and B; nearest neighbour by gap is B (gap 0 vs A gap 0.4)
    const input = [seg('A', 0, 1.0), seg('C', 1.4, 1.5), seg('B', 1.5, 2.5)];
    const merged = mergeShortSegments(input);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ speaker: 'B', start: 1.4, end: 2.5 });
  });

  it('keeps a single short segment rather than dropping it', () => {
    const input = [seg('A', 0, 0.1)];
    expect(mergeShortSegments(input)).toEqual(input);
  });

  it('recomputes byte offsets on the merged segment', () => {
    const input: DiarizationSegment[] = [
      { speaker: 'A', start: 0, end: 1.0, startByte: 0, endByte: 64000 },
      { speaker: 'A', start: 1.0, end: 1.1, startByte: 64000, endByte: 70400 },
    ];
    const merged = mergeShortSegments(input);
    expect(merged[0].startByte).toBe(0);
    expect(merged[0].endByte).toBe(70400);
  });
});

describe('buildPromptWindow', () => {
  it('returns the last N words joined by spaces', () => {
    const words = Array.from({ length: 60 }, (_, i) => `w${i}`);
    const prompt = buildPromptWindow(words, 50);
    expect(prompt.split(' ')).toHaveLength(50);
    expect(prompt.startsWith('w10')).toBe(true);
    expect(prompt.endsWith('w59')).toBe(true);
  });

  it('returns all words when fewer than the window size', () => {
    expect(buildPromptWindow(['a', 'b'], 50)).toBe('a b');
  });
});

describe('buildDiarizedSegment', () => {
  it('positions the segment on the recording timeline', () => {
    const result = buildDiarizedSegment(3, seg('Speaker B', 2, 5), 'hello world', 1000);
    expect(result).toMatchObject({
      id: 'diar-3',
      speaker: 'Speaker B',
      speakerId: 'Speaker B',
      text: 'hello world',
      speechStartMs: 3000,
      timestamp: 3000,
      startTime: 2,
      endTime: 5,
    });
  });
});
