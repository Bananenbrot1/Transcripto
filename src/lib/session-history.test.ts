import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveSession,
  clearSessionHistory,
  deleteSessionHistoryEntry,
  listSessionHistory,
} from './session-history';
import type { TranscriptSegment } from '@/types/transcription';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  },
  configurable: true,
});

function seg(text: string): TranscriptSegment {
  return {
    id: `s-${text}`,
    source: 'mic',
    speaker: 'You',
    text,
    timestamp: 1,
    speechStartMs: 1,
    startTime: 0,
    endTime: 1,
  };
}

describe('session-history', () => {
  beforeEach(() => {
    store.clear();
    clearSessionHistory();
  });

  it('archives a session at the front of the list', () => {
    archiveSession({
      title: 'Standup',
      recordingStartTime: 100,
      segments: [seg('hello')],
      speakerNames: {},
    });
    const list = listSessionHistory();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Standup');
    expect(list[0].preview).toBe('hello');
  });

  it('ignores empty transcripts', () => {
    expect(archiveSession({
      title: 'Empty',
      recordingStartTime: 0,
      segments: [],
      speakerNames: {},
    })).toBeNull();
    expect(listSessionHistory()).toHaveLength(0);
  });

  it('deletes a history entry', () => {
    const entry = archiveSession({
      title: 'A',
      recordingStartTime: 1,
      segments: [seg('a')],
      speakerNames: {},
    })!;
    deleteSessionHistoryEntry(entry.id);
    expect(listSessionHistory()).toHaveLength(0);
  });
});
