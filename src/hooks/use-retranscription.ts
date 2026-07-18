import { useState, useCallback } from 'react';
import type { DiarizationSegment, TranscriptSegment } from '@/types/transcription';
import {
  buildDiarizedSegment,
  buildPromptWindow,
  mergeShortSegments,
} from '@/lib/retranscription';

export interface RetranscriptionProgress {
  current: number;
  total: number;
  elapsedMs: number;
}

export function useRetranscription() {
  const [progress, setProgress] = useState<RetranscriptionProgress | null>(null);

  const retranscribe = useCallback(
    async (
      diarSegments: DiarizationSegment[],
      mixedPath: string,
      recordingStartTime: number,
      language: string,
    ): Promise<TranscriptSegment[]> => {
      const merged = mergeShortSegments(diarSegments);
      const rebuilt: TranscriptSegment[] = [];
      const promptWords: string[] = [];
      const startedAt = Date.now();

      setProgress({ current: 0, total: merged.length, elapsedMs: 0 });

      for (let i = 0; i < merged.length; i++) {
        const d = merged[i];
        const prompt = buildPromptWindow(promptWords);
        try {
          const result = await window.electronAPI.transcribeRegion({
            sourcePath: mixedPath,
            start: d.start,
            end: d.end,
            language,
            prompt: prompt || undefined,
            startByte: d.startByte,
            endByte: d.endByte,
          });
          if (result.text) {
            rebuilt.push(buildDiarizedSegment(i, d, result.text, recordingStartTime));
            promptWords.push(...result.text.split(/\s+/).filter(Boolean));
          }
        } catch (err) {
          console.warn(`[retranscription] segment ${i} failed, skipping:`, err);
        }
        setProgress({ current: i + 1, total: merged.length, elapsedMs: Date.now() - startedAt });
      }

      setProgress(null);
      return rebuilt;
    },
    [],
  );

  return { retranscribe, progress };
}
