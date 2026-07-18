import { useState, useCallback } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { TranscriptSegment } from '@/types/transcription';

export type DiarizationState = 'idle' | 'models-missing' | 'available' | 'processing' | 'done' | 'error';

export function useDiarization(
  recordingStartTimeRef: MutableRefObject<number>,
  setSegments: Dispatch<SetStateAction<TranscriptSegment[]>>,
) {
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

  const runDiarization = useCallback(async (numSpeakers: number) => {
    setDiarizationState('processing');
    setElapsedMs(0);

    const unsubscribeProgress = window.electronAPI.onDiarizationProgress(({ elapsedMs: ms }) => {
      setElapsedMs(ms);
    });

    try {
      const diarSegments = await window.electronAPI.diarize(numSpeakers);

      const recStart = recordingStartTimeRef.current;
      setSegments((prev) =>
        prev.map((seg) => {
          const relSec = (seg.speechStartMs - recStart) / 1000;
          const match = diarSegments.find((d) => relSec >= d.start && relSec <= d.end);
          if (!match) return seg;
          return { ...seg, speaker: match.speaker, speakerId: match.speaker };
        }),
      );

      setDiarizationState('done');
    } catch (err) {
      console.error('Diarization failed:', err);
      setDiarizationState('error');
    } finally {
      unsubscribeProgress();
    }
  }, [recordingStartTimeRef, setSegments]);

  return {
    diarizationState,
    setDiarizationState,
    elapsedMs,
    checkModels,
    runDiarization,
  };
}
