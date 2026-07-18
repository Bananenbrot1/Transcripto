import type { TranscriptSegment } from '@/types/transcription';

const KEY = 'transcripto-session-history';
const MAX_ENTRIES = 20;

export interface SessionHistoryEntry {
  id: string;
  title: string;
  savedAt: number;
  recordingStartTime: number;
  segmentCount: number;
  preview: string;
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
}

function readAll(): SessionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: SessionHistoryEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function listSessionHistory(): SessionHistoryEntry[] {
  return readAll();
}

export function archiveSession(input: {
  title: string;
  recordingStartTime: number;
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
}): SessionHistoryEntry | null {
  if (input.segments.length === 0) return null;

  const entry: SessionHistoryEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim() || 'Untitled',
    savedAt: Date.now(),
    recordingStartTime: input.recordingStartTime,
    segmentCount: input.segments.length,
    preview: input.segments[0]?.text.slice(0, 120) ?? '',
    segments: input.segments.slice(-500),
    speakerNames: { ...input.speakerNames },
  };

  const next = [entry, ...readAll().filter((e) => e.id !== entry.id)];
  writeAll(next);
  return entry;
}

export function getSessionHistoryEntry(id: string): SessionHistoryEntry | null {
  return readAll().find((e) => e.id === id) ?? null;
}

export function deleteSessionHistoryEntry(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

export function clearSessionHistory(): void {
  localStorage.removeItem(KEY);
}
