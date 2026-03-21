import { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '@/types/transcription';
import type { SummaryResult } from '../../shared/types';

const KEY_SEGMENTS = 'transcripto-session-segments';
const KEY_SPEAKER_NAMES = 'transcripto-session-speaker-names';
const KEY_RECORDING_START = 'transcripto-session-recording-start';
const KEY_SUMMARY = 'transcripto-session-summary';
const MAX_SEGMENTS = 500; // guard against storing unreasonably large sessions

export interface PersistedSession {
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
  recordingStartTime: number;
  summary: SummaryResult | null;
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(KEY_SEGMENTS);
    if (!raw) return null;
    const segments: TranscriptSegment[] = JSON.parse(raw);
    const speakerNames: Record<string, string> = JSON.parse(
      localStorage.getItem(KEY_SPEAKER_NAMES) ?? '{}',
    );
    const recordingStartTime = parseInt(
      localStorage.getItem(KEY_RECORDING_START) ?? '0',
      10,
    );
    if (!Array.isArray(segments) || segments.length === 0) return null;
    let summary: SummaryResult | null = null;
    try {
      const rawSummary = localStorage.getItem(KEY_SUMMARY);
      if (rawSummary) summary = JSON.parse(rawSummary);
    } catch { /* ignore */ }
    return { segments, speakerNames, recordingStartTime, summary };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(KEY_SEGMENTS);
  localStorage.removeItem(KEY_SPEAKER_NAMES);
  localStorage.removeItem(KEY_RECORDING_START);
  localStorage.removeItem(KEY_SUMMARY);
}

export function saveSummary(summary: SummaryResult | null): void {
  if (summary) {
    localStorage.setItem(KEY_SUMMARY, JSON.stringify(summary));
  } else {
    localStorage.removeItem(KEY_SUMMARY);
  }
}

/**
 * Persists transcript state to localStorage on every change.
 * Uses a debounce so rapid segment additions only write once per 500ms.
 */
export function useSessionPersistence(
  segments: TranscriptSegment[],
  speakerNames: Record<string, string>,
  recordingStartTime: number,
  isRecording: boolean,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't persist mid-recording — wait until recording is complete so we
    // don't write a partial session that could be confused with the last one.
    if (isRecording) return;
    if (segments.length === 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const toStore = segments.slice(-MAX_SEGMENTS);
        localStorage.setItem(KEY_SEGMENTS, JSON.stringify(toStore));
        localStorage.setItem(KEY_SPEAKER_NAMES, JSON.stringify(speakerNames));
        localStorage.setItem(KEY_RECORDING_START, String(recordingStartTime));
      } catch (err) {
        console.warn('[session-persistence] Failed to save session:', err);
      }
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [segments, speakerNames, recordingStartTime, isRecording]);
}
