import { useState, useCallback, useRef } from 'react';
import type { TranscriptSegment } from '@/types/transcription';
import type { FileTranscribeProgress, TranscribeSegment } from '../../shared/types';

export type FileImportState = 'idle' | 'extracting' | 'decoding' | 'transcribing' | 'done' | 'error';

interface UseFileImportOptions {
  language: string;
  onImportStart: () => void;
  onSegmentsBatch: (segments: TranscriptSegment[]) => void;
  onTitleReady: (title: string) => void;
  onComplete: () => void;
}

function resampleTo16kMono(audioBuffer: AudioBuffer): Float32Array {
  const targetRate = 16000;
  const sourceRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;

  // Mix to mono
  const monoLength = audioBuffer.length;
  const mono = new Float32Array(monoLength);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < monoLength; i++) {
      mono[i] += channelData[i] / numChannels;
    }
  }

  // Resample if needed
  if (sourceRate === targetRate) {
    return mono;
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.floor(monoLength / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, monoLength - 1);
    const frac = srcIndex - low;
    output[i] = mono[low] * (1 - frac) + mono[high] * frac;
  }
  return output;
}

function transcribeSegmentsToTranscript(segments: TranscribeSegment[], counterRef: React.RefObject<number>): TranscriptSegment[] {
  const now = Date.now();
  return segments.map((seg) => ({
    id: `file-seg-${++counterRef.current}`,
    source: 'file' as const,
    speaker: 'Speaker',
    text: seg.text,
    timestamp: now,
    speechStartMs: now,
    startTime: seg.t0,
    endTime: seg.t1,
  }));
}

export function useFileImport({ language, onImportStart, onSegmentsBatch, onTitleReady, onComplete }: UseFileImportOptions) {
  const [fileImportState, setFileImportState] = useState<FileImportState>('idle');
  const [fileProgress, setFileProgress] = useState<FileTranscribeProgress | null>(null);
  const [fileDurationSec, setFileDurationSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const segmentCounterRef = useRef(0);
  const languageRef = useRef(language);
  languageRef.current = language;

  const importFile = useCallback(async () => {
    try {
      const selected = await window.electronAPI.selectAudioFile();
      if (!selected) return;

      const { fileName, isVideo } = selected;
      const titleFromFile = fileName.replace(/\.[^.]+$/, '');
      onTitleReady(titleFromFile);
      onImportStart();
      setErrorMessage('');
      setFileProgress(null);
      segmentCounterRef.current = 0;

      const unsubscribe = window.electronAPI.onTranscribeFileProgress((progress) => {
        setFileProgress(progress);
        if (progress.newSegments.length > 0) {
          const transcriptSegs = transcribeSegmentsToTranscript(progress.newSegments, segmentCounterRef);
          onSegmentsBatch(transcriptSegs);
        }
      });

      try {
        if (isVideo) {
          // Video: audio already extracted to a temp WAV by main process.
          // Pass only the path — the large buffer never enters renderer memory.
          setFileImportState('transcribing');
          await window.electronAPI.transcribeVideoFile(selected.tempWavPath, languageRef.current);
        } else {
          // Audio: decode and resample in renderer, then send to main for transcription.
          setFileImportState('decoding');
          const audioCtx = new AudioContext();
          let audioBuffer: AudioBuffer;
          try {
            audioBuffer = await audioCtx.decodeAudioData(selected.data.slice(0));
          } finally {
            await audioCtx.close();
          }
          const duration = audioBuffer.duration;
          setFileDurationSec(duration);
          const pcm16k = resampleTo16kMono(audioBuffer);
          setFileImportState('transcribing');
          await window.electronAPI.transcribeFile(pcm16k.buffer as ArrayBuffer, languageRef.current, duration);
        }
      } finally {
        unsubscribe();
      }

      setFileImportState('done');
      onComplete();
    } catch (err) {
      console.error('[file-import] Error:', err);
      setErrorMessage((err as Error).message);
      setFileImportState('error');
    }
  }, [onImportStart, onSegmentsBatch, onTitleReady, onComplete]);

  const resetFileImport = useCallback(() => {
    setFileImportState('idle');
    setFileProgress(null);
    setFileDurationSec(0);
    setErrorMessage('');
  }, []);

  return {
    fileImportState,
    fileProgress,
    fileDurationSec,
    errorMessage,
    importFile,
    resetFileImport,
  };
}
