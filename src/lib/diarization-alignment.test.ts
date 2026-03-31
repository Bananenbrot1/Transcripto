import { describe, it, expect } from 'vitest';
import {
  computeOverlap,
  findBestDiarizationMatch,
  alignSegmentsToDiarization,
} from './diarization-alignment';
import type { TranscriptSegment, DiarizationSegment } from '@/types/transcription';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDiarSeg(speaker: string, start: number, end: number): DiarizationSegment {
  return { speaker, start, end };
}

function makeTranscriptSeg(
  overrides: Partial<TranscriptSegment> & { speechStartMs: number },
): TranscriptSegment {
  return {
    id: 'seg-1',
    source: 'mic',
    speaker: 'You',
    text: 'hello',
    timestamp: overrides.speechStartMs,
    startTime: 0,
    endTime: 500,   // 5 seconds in centiseconds
    ...overrides,
  };
}

// Recording started at T=0 wall-clock ms for simplicity.
const REC_START = 0;

// ─── computeOverlap ──────────────────────────────────────────────────────────

describe('computeOverlap', () => {
  it('returns full overlap for identical intervals', () => {
    expect(computeOverlap(0, 10, 0, 10)).toBe(10);
  });

  it('returns partial overlap for partially overlapping intervals', () => {
    expect(computeOverlap(0, 10, 5, 15)).toBe(5);
    expect(computeOverlap(5, 15, 0, 10)).toBe(5);
  });

  it('returns zero for non-overlapping intervals', () => {
    expect(computeOverlap(0, 5, 10, 15)).toBe(0);
    expect(computeOverlap(10, 15, 0, 5)).toBe(0);
  });

  it('returns zero for adjacent intervals (touching endpoints)', () => {
    expect(computeOverlap(0, 5, 5, 10)).toBe(0);
  });

  it('returns the shorter interval length when one contains the other', () => {
    expect(computeOverlap(0, 10, 2, 7)).toBe(5);
    expect(computeOverlap(2, 7, 0, 10)).toBe(5);
  });
});

// ─── findBestDiarizationMatch ────────────────────────────────────────────────

describe('findBestDiarizationMatch', () => {
  it('returns the exact match when the segment aligns exactly with a diarization interval', () => {
    const segs = [makeDiarSeg('Speaker A', 0, 5), makeDiarSeg('Speaker B', 5, 10)];
    // Transcript segment [0, 5] — perfectly matches first interval.
    expect(findBestDiarizationMatch(0, 5, segs)).toBe(segs[0]);
  });

  it('returns the interval with the greatest overlap for partial overlaps', () => {
    const segs = [makeDiarSeg('Speaker A', 0, 4), makeDiarSeg('Speaker B', 4, 10)];
    // Transcript window [2, 7]: overlaps A by 2 s, B by 3 s → picks B.
    expect(findBestDiarizationMatch(2, 7, segs)?.speaker).toBe('Speaker B');
  });

  it('returns the majority-duration diarization segment when many overlap one transcript segment', () => {
    const segs = [
      makeDiarSeg('Speaker A', 0, 2),   // 1 s overlap with [1, 6]
      makeDiarSeg('Speaker B', 2, 5),   // 3 s overlap with [1, 6]
      makeDiarSeg('Speaker C', 5, 8),   // 1 s overlap with [1, 6]
    ];
    // Transcript window [1, 6]: B has 3 s, A has 1 s, C has 1 s → B wins.
    expect(findBestDiarizationMatch(1, 6, segs)?.speaker).toBe('Speaker B');
  });

  it('returns null when no diarization segment overlaps the window', () => {
    const segs = [makeDiarSeg('Speaker A', 10, 20)];
    // Transcript window [0, 5] — no overlap with [10, 20].
    expect(findBestDiarizationMatch(0, 5, segs)).toBeNull();
  });

  it('returns null for an empty diarization array', () => {
    expect(findBestDiarizationMatch(0, 5, [])).toBeNull();
  });

  it('falls back to point containment when the window is zero-length', () => {
    const segs = [makeDiarSeg('Speaker A', 0, 5), makeDiarSeg('Speaker B', 5, 10)];
    // Point at 3 s is inside Speaker A's interval.
    expect(findBestDiarizationMatch(3, 3, segs)?.speaker).toBe('Speaker A');
  });

  it('returns null for a zero-length window not inside any interval', () => {
    const segs = [makeDiarSeg('Speaker A', 0, 2)];
    expect(findBestDiarizationMatch(5, 5, segs)).toBeNull();
  });
});

// ─── alignSegmentsToDiarization ──────────────────────────────────────────────

describe('alignSegmentsToDiarization', () => {
  it('assigns speaker when transcript segment exactly overlaps a diarization interval', () => {
    // speechStartMs = 2000 ms → bufferStartSec = 2 s
    // startTime = 0 cs, endTime = 300 cs (3 s) → window [2, 5]
    const seg = makeTranscriptSeg({ speechStartMs: 2000, startTime: 0, endTime: 300 });
    const diar = [makeDiarSeg('Speaker A', 2, 5)];
    const [result] = alignSegmentsToDiarization([seg], diar, REC_START);
    expect(result.speaker).toBe('Speaker A');
    expect(result.speakerId).toBe('Speaker A');
  });

  it('retains original speaker label when no diarization segment overlaps', () => {
    // speechStartMs = 0 ms → bufferStartSec = 0 s
    // endTime = 200 cs (2 s) → window [0, 2]
    // Diarization only covers [10, 20] — no overlap.
    const seg = makeTranscriptSeg({ speechStartMs: 0, startTime: 0, endTime: 200, speaker: 'You' });
    const diar = [makeDiarSeg('Speaker B', 10, 20)];
    const [result] = alignSegmentsToDiarization([seg], diar, REC_START);
    expect(result.speaker).toBe('You');
    expect(result.speakerId).toBeUndefined();
  });

  it('picks the best match by overlap duration (partial overlap)', () => {
    // speechStartMs = 3000 ms → bufferStartSec = 3 s
    // endTime = 400 cs (4 s) → window [3, 7]
    // Speaker A covers [0, 4]: overlap = 1 s
    // Speaker B covers [4, 9]: overlap = 3 s → B wins
    const seg = makeTranscriptSeg({ speechStartMs: 3000, startTime: 0, endTime: 400 });
    const diar = [makeDiarSeg('Speaker A', 0, 4), makeDiarSeg('Speaker B', 4, 9)];
    const [result] = alignSegmentsToDiarization([seg], diar, REC_START);
    expect(result.speaker).toBe('Speaker B');
  });

  it('picks the majority-by-duration diarization segment when multiple overlap', () => {
    // Window [2, 7]:
    // Speaker A covers [0, 3]:  overlap = 1 s
    // Speaker B covers [3, 6]:  overlap = 3 s ← majority
    // Speaker C covers [6, 10]: overlap = 1 s
    const seg = makeTranscriptSeg({ speechStartMs: 2000, startTime: 0, endTime: 500 });
    const diar = [
      makeDiarSeg('Speaker A', 0, 3),
      makeDiarSeg('Speaker B', 3, 6),
      makeDiarSeg('Speaker C', 6, 10),
    ];
    const [result] = alignSegmentsToDiarization([seg], diar, REC_START);
    expect(result.speaker).toBe('Speaker B');
  });

  it('handles non-zero recording start time correctly', () => {
    const recStart = 10_000; // recording started 10 s into wall clock
    // speechStartMs = 12000 ms → bufferStartSec = (12000 - 10000) / 1000 = 2 s
    // endTime = 300 cs (3 s) → window [2, 5]
    const seg = makeTranscriptSeg({ speechStartMs: 12_000, startTime: 0, endTime: 300, speaker: 'You' });
    const diar = [makeDiarSeg('Speaker A', 2, 5)];
    const [result] = alignSegmentsToDiarization([seg], diar, recStart);
    expect(result.speaker).toBe('Speaker A');
  });

  it('handles non-zero startTime (Whisper offset) correctly', () => {
    // speechStartMs = 0 → bufferStartSec = 0
    // startTime = 200 cs (2 s), endTime = 500 cs (5 s) → window [2, 5]
    const seg = makeTranscriptSeg({ speechStartMs: 0, startTime: 200, endTime: 500, speaker: 'You' });
    const diar = [makeDiarSeg('Speaker A', 2, 5), makeDiarSeg('Speaker B', 0, 2)];
    const [result] = alignSegmentsToDiarization([seg], diar, REC_START);
    // Overlap with A: 3 s, with B: 0 s → A wins.
    expect(result.speaker).toBe('Speaker A');
  });

  it('does not mutate the input segments', () => {
    const seg = makeTranscriptSeg({ speechStartMs: 0, startTime: 0, endTime: 300, speaker: 'You' });
    const diar = [makeDiarSeg('Speaker A', 0, 3)];
    alignSegmentsToDiarization([seg], diar, REC_START);
    expect(seg.speaker).toBe('You');
  });
});
