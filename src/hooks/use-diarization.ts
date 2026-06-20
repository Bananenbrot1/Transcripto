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

  const runDiarization = useCallback(async (numSpeakers?: number) => {
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
          // For file imports, segment.startTime is whisper t0 measured in
          // milliseconds (despite the type doc saying seconds — pre-existing
          // unit mismatch elsewhere in the file-import pipeline). For live
          // recordings, derive seconds from the wall-clock speechStartMs
          // relative to recordingStart.
          const startSec = seg.source === 'file'
            ? (seg.startTime ?? 0) / 1000
            : (seg.speechStartMs - recStart) / 1000;
          const endSec = seg.source === 'file'
            ? (seg.endTime ?? seg.startTime ?? 0) / 1000
            : startSec;
          const midSec = (startSec + endSec) / 2;

          // Prefer the sherpa segment that contains the whisper midpoint.
          // If none does (e.g. whisper segments at t=0 sometimes precede the
          // first sherpa detection that starts at t≈1s of voiced audio),
          // fall back to the nearest sherpa segment by time distance.
          let match = diarSegments.find((d) => midSec >= d.start && midSec <= d.end);
          if (!match && diarSegments.length > 0) {
            let bestDist = Infinity;
            for (const d of diarSegments) {
              const dist = midSec < d.start
                ? d.start - midSec
                : midSec > d.end
                  ? midSec - d.end
                  : 0;
              if (dist < bestDist) {
                bestDist = dist;
                match = d;
              }
            }
          }
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
