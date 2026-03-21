import { useState, useEffect, useRef, useCallback } from 'react';
import type { TranscriptSegment, SummaryResult, LiveSummaryGenerationStatus, StoreSchema } from '../../shared/types';

const SEGMENT_TRIGGER_COUNT = 5;
const COLD_START_SEGMENTS = 10;
const SLIDING_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface UseLiveSummaryOptions {
  segments: TranscriptSegment[];
  isRecording: boolean;
  liveSummarySettings: StoreSchema['liveSummary'];
  hasSummaryApiKey: boolean;
}

interface UseLiveSummaryReturn {
  liveSummary: SummaryResult | null;
  liveSummaryStatus: LiveSummaryGenerationStatus;
  liveSummaryError: string;
  corrections: string[];
  addCorrection: (correction: string) => void;
  removeCorrection: (index: number) => void;
}

export function useLiveSummary({
  segments,
  isRecording,
  liveSummarySettings,
  hasSummaryApiKey,
}: UseLiveSummaryOptions): UseLiveSummaryReturn {
  const [liveSummary, setLiveSummary] = useState<SummaryResult | null>(null);
  const [status, setStatus] = useState<LiveSummaryGenerationStatus>('idle');
  const [error, setError] = useState('');
  const [corrections, setCorrections] = useState<string[]>([]);

  const lastProcessedIndexRef = useRef(0);
  const previousSummaryRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGeneratingRef = useRef(false);
  // Keep a ref in sync with state so the generate callback always has current corrections
  const correctionsRef = useRef<string[]>([]);
  useEffect(() => { correctionsRef.current = corrections; }, [corrections]);

  const enabled = liveSummarySettings.enabled && hasSummaryApiKey;
  const intervalMs = liveSummarySettings.intervalSeconds * 1000;

  const addCorrection = useCallback((correction: string) => {
    const trimmed = correction.trim();
    if (!trimmed) return;
    setCorrections((prev) => [...prev, trimmed]);
  }, []);

  const removeCorrection = useCallback((index: number) => {
    setCorrections((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const generate = useCallback(async (currentSegments: TranscriptSegment[]) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setStatus('generating');
    setError('');

    try {
      // Build sliding window: segments from the last 15 minutes
      const now = Date.now();
      const windowStart = now - SLIDING_WINDOW_MS;
      const recentSegments = currentSegments
        .filter((s) => s.timestamp >= windowStart)
        .map((s) => ({
          speaker: s.speaker,
          text: s.text,
          timestamp: s.timestamp,
        }));

      // If no recent segments (shouldn't happen), use all
      const segmentsToSend = recentSegments.length > 0 ? recentSegments : currentSegments.map((s) => ({
        speaker: s.speaker,
        text: s.text,
        timestamp: s.timestamp,
      }));

      const result = await window.electronAPI.liveSummarize({
        previousSummary: previousSummaryRef.current,
        corrections: correctionsRef.current,
        recentSegments: segmentsToSend,
        formatTemplate: liveSummarySettings.formatTemplate,
      });

      previousSummaryRef.current = result.text;
      lastProcessedIndexRef.current = currentSegments.length;
      setLiveSummary(result);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    } finally {
      isGeneratingRef.current = false;
    }
  }, [liveSummarySettings.formatTemplate]);

  // Reset state when recording starts/stops
  useEffect(() => {
    if (!isRecording) {
      // Clear timer when recording stops
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Reset on new recording
    lastProcessedIndexRef.current = 0;
    previousSummaryRef.current = '';
    setCorrections([]);
    setLiveSummary(null);
    setStatus('idle');
    setError('');
  }, [isRecording]);

  // Hybrid trigger: segment count or time interval
  useEffect(() => {
    if (!isRecording || !enabled) return;

    const newSegmentCount = segments.length - lastProcessedIndexRef.current;

    // Cold start: wait for enough segments
    if (segments.length < COLD_START_SEGMENTS) return;

    // Segment-count trigger
    if (newSegmentCount >= SEGMENT_TRIGGER_COUNT && !isGeneratingRef.current) {
      // Clear any existing timer and generate immediately
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      generate(segments);
      return;
    }

    // Time-interval trigger: set up timer if not already running
    if (!timerRef.current && !isGeneratingRef.current && newSegmentCount > 0) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (!isGeneratingRef.current && segments.length > lastProcessedIndexRef.current) {
          generate(segments);
        }
      }, intervalMs);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [segments, isRecording, enabled, intervalMs, generate]);

  return {
    liveSummary,
    liveSummaryStatus: status,
    liveSummaryError: error,
    corrections,
    addCorrection,
    removeCorrection,
  };
}
