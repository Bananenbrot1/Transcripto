import { useState, useCallback, useRef } from 'react';
import { useAudioCapture } from './use-audio-capture';
import type {
  AudioSource,
  RecordingState,
  TranscriptSegment,
} from '@/types/transcription';

interface UseTranscriptionOptions {
  language: string;
}

export function useTranscription({ language }: UseTranscriptionOptions) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [micRMS, setMicRMS] = useState(0);
  const [systemRMS, setSystemRMS] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState(0);
  const pendingRef = useRef(0);
  const segmentCounterRef = useRef(0);
  const languageRef = useRef(language);
  languageRef.current = language;

  const onSpeechEnd = useCallback(
    async (source: AudioSource, audioBuffer: ArrayBuffer) => {
      const timestamp = Date.now();
      pendingRef.current++;

      try {
        const result = await window.electronAPI.transcribe(source, audioBuffer, languageRef.current);

        if (result.text) {
          const newSegment: TranscriptSegment = {
            id: `seg-${++segmentCounterRef.current}`,
            source,
            text: result.text,
            timestamp,
            startTime: result.segments[0]?.t0 ?? 0,
            endTime: result.segments[result.segments.length - 1]?.t1 ?? 0,
          };

          setSegments((prev) => [...prev, newSegment].sort((a, b) => a.timestamp - b.timestamp));
        }
      } catch (err) {
        console.error(`Transcription error (${source}):`, err);
      } finally {
        pendingRef.current--;
      }
    },
    [],
  );

  const onRMS = useCallback((source: AudioSource, rms: number) => {
    if (source === 'mic') {
      setMicRMS(rms);
    } else {
      setSystemRMS(rms);
    }
  }, []);

  const { isCapturing, systemAudioStatus, debugInfo, isMicMuted, startCapture, stopCapture, toggleMicMute } = useAudioCapture({
    onSpeechEnd,
    onRMS,
  });

  const startRecording = useCallback(async () => {
    setRecordingState('recording');
    setRecordingStartTime(Date.now());
    segmentCounterRef.current = 0;
    setSegments([]);
    try {
      await startCapture();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setRecordingState('idle');
    }
  }, [startCapture]);

  const stopRecording = useCallback(async () => {
    setRecordingState('stopping');
    await stopCapture();

    // Wait for pending transcriptions to finish (max 10s)
    const start = Date.now();
    while (pendingRef.current > 0 && Date.now() - start < 10000) {
      await new Promise((r) => setTimeout(r, 200));
    }

    setRecordingState('idle');
  }, [stopCapture]);

  return {
    segments,
    recordingState,
    recordingStartTime,
    isCapturing,
    systemAudioStatus,
    debugInfo,
    micRMS,
    systemRMS,
    isMicMuted,
    startRecording,
    stopRecording,
    toggleMicMute,
  };
}
