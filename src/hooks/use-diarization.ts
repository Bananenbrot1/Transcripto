import { useState, useCallback } from 'react';
import type { DiarizationSegment } from '@/types/transcription';

export type DiarizationState = 'idle' | 'models-missing' | 'available' | 'processing' | 'done' | 'error';

export function useDiarization() {
  const [diarizationState, setDiarizationState] = useState<DiarizationState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);

  const checkModels = useCallback(async () => {
    try {
      const status = await window.electronAPI.checkDiarizationModels();
      const modelsReady = status.segmentation && status.embedding;
      setDiarizationState(modelsReady ? 'available' : 'models-missing');
    } catch (err) {
      console.error('Failed to check diarization models:', err);
      setDiarizationState('models-missing');
    }
  }, []);

  /** Run diarization only. Returns the raw segments and the mixed audio path. */
  const runDiarization = useCallback(
    async (numSpeakers: number): Promise<{ segments: DiarizationSegment[]; mixedPath: string }> => {
      setElapsedMs(0);
      const unsubscribeProgress = window.electronAPI.onDiarizationProgress(({ elapsedMs: ms }) => {
        setElapsedMs(ms);
      });
      try {
        return await window.electronAPI.diarize(numSpeakers);
      } finally {
        unsubscribeProgress();
      }
    },
    [],
  );

  return {
    diarizationState,
    setDiarizationState,
    elapsedMs,
    checkModels,
    runDiarization,
  };
}
