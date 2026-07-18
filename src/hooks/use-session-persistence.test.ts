import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, loadSession, persistSession } from './use-session-persistence';
import type { TranscriptSegment } from '@/types/transcription';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

function seg(id: string): TranscriptSegment {
  return {
    id,
    source: 'mic',
    speaker: 'You',
    text: `hello ${id}`,
    timestamp: 1,
    speechStartMs: 1,
    startTime: 0,
    endTime: 1,
  };
}

describe('persistSession / loadSession', () => {
  beforeEach(() => {
    store.clear();
    clearSession();
  });

  it('round-trips segments during an active recording', () => {
    persistSession([seg('a'), seg('b')], { 'Speaker A': 'Alice' }, 12345);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.segments).toHaveLength(2);
    expect(loaded!.speakerNames['Speaker A']).toBe('Alice');
    expect(loaded!.recordingStartTime).toBe(12345);
  });

  it('does not write empty sessions', () => {
    persistSession([], {}, 0);
    expect(loadSession()).toBeNull();
  });
});
