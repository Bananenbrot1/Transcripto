import { useCallback } from 'react';
import { useStoreValue } from './use-store';
import { STORE_DEFAULTS } from '../../shared/store-defaults';
import type { VADOptions } from '@/lib/vad';

export interface VADSettings extends Required<VADOptions> {}

export function useVADSettings() {
  const [vad, setVad] = useStoreValue('vad');

  const setSilenceThreshold = useCallback((v: number) => {
    setVad({ ...vad, silenceThreshold: v });
  }, [vad, setVad]);

  const setSilenceDurationMs = useCallback((v: number) => {
    setVad({ ...vad, silenceDurationMs: v });
  }, [vad, setVad]);

  const setMaxSegmentMs = useCallback((v: number) => {
    setVad({ ...vad, maxSegmentMs: v });
  }, [vad, setVad]);

  const setMinSegmentMs = useCallback((v: number) => {
    setVad({ ...vad, minSegmentMs: v });
  }, [vad, setVad]);

  const resetDefaults = useCallback(() => {
    setVad(STORE_DEFAULTS.vad);
  }, [setVad]);

  const settings: VADSettings = vad;

  return {
    settings,
    setSilenceThreshold,
    setSilenceDurationMs,
    setMaxSegmentMs,
    setMinSegmentMs,
    resetDefaults,
  };
}
