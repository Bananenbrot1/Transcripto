import { useState, useCallback } from 'react';
import type { VADOptions } from '@/lib/vad';

const KEYS = {
  silenceThreshold: 'transcripto-vad-silence-threshold',
  silenceDurationMs: 'transcripto-vad-silence-duration-ms',
  maxSegmentMs: 'transcripto-vad-max-segment-ms',
  minSegmentMs: 'transcripto-vad-min-segment-ms',
} as const;

const DEFAULTS: Required<VADOptions> = {
  silenceThreshold: 0.01,
  silenceDurationMs: 800,
  maxSegmentMs: 30000,
  minSegmentMs: 500,
};

function readNum(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = parseFloat(raw);
    return isNaN(n) ? fallback : n;
  } catch {
    return fallback;
  }
}

export interface VADSettings extends Required<VADOptions> {}

export function useVADSettings() {
  const [silenceThreshold, setSilenceThresholdState] = useState(() =>
    readNum(KEYS.silenceThreshold, DEFAULTS.silenceThreshold),
  );
  const [silenceDurationMs, setSilenceDurationMsState] = useState(() =>
    readNum(KEYS.silenceDurationMs, DEFAULTS.silenceDurationMs),
  );
  const [maxSegmentMs, setMaxSegmentMsState] = useState(() =>
    readNum(KEYS.maxSegmentMs, DEFAULTS.maxSegmentMs),
  );
  const [minSegmentMs, setMinSegmentMsState] = useState(() =>
    readNum(KEYS.minSegmentMs, DEFAULTS.minSegmentMs),
  );

  const setSilenceThreshold = useCallback((v: number) => {
    localStorage.setItem(KEYS.silenceThreshold, String(v));
    setSilenceThresholdState(v);
  }, []);

  const setSilenceDurationMs = useCallback((v: number) => {
    localStorage.setItem(KEYS.silenceDurationMs, String(v));
    setSilenceDurationMsState(v);
  }, []);

  const setMaxSegmentMs = useCallback((v: number) => {
    localStorage.setItem(KEYS.maxSegmentMs, String(v));
    setMaxSegmentMsState(v);
  }, []);

  const setMinSegmentMs = useCallback((v: number) => {
    localStorage.setItem(KEYS.minSegmentMs, String(v));
    setMinSegmentMsState(v);
  }, []);

  const resetDefaults = useCallback(() => {
    setSilenceThreshold(DEFAULTS.silenceThreshold);
    setSilenceDurationMs(DEFAULTS.silenceDurationMs);
    setMaxSegmentMs(DEFAULTS.maxSegmentMs);
    setMinSegmentMs(DEFAULTS.minSegmentMs);
  }, [setSilenceThreshold, setSilenceDurationMs, setMaxSegmentMs, setMinSegmentMs]);

  const settings: VADSettings = {
    silenceThreshold,
    silenceDurationMs,
    maxSegmentMs,
    minSegmentMs,
  };

  return {
    settings,
    setSilenceThreshold,
    setSilenceDurationMs,
    setMaxSegmentMs,
    setMinSegmentMs,
    resetDefaults,
  };
}
