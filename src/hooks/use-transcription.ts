import { useState, useCallback, useRef } from 'react';
import { useAudioCapture } from './use-audio-capture';
import { useSessionPersistence, loadSession, clearSession } from './use-session-persistence';
import { useDiarization } from './use-diarization';
import type { VADOptions } from '@/lib/vad';
import type {
  AudioSource,
  RecordingState,
  TranscriptSegment,
} from '@/types/transcription';

export type { DiarizationState } from './use-diarization';

interface UseTranscriptionOptions {
  language: string;
  vadOptions?: VADOptions;
}

export function useTranscription({ language, vadOptions }: UseTranscriptionOptions) {
  const [segments, setSegments] = useState<TranscriptSegment[]>(() => loadSession()?.segments ?? []);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [micRMS, setMicRMS] = useState(0);
  const [systemRMS, setSystemRMS] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState(() => loadSession()?.recordingStartTime ?? 0);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(() => loadSession()?.speakerNames ?? {});
  const pendingRef = useRef(0);
  const drainResolveRef = useRef<(() => void) | null>(null);
  const segmentCounterRef = useRef(0);
  const systemSpeakerRef = useRef(1);
  const languageRef = useRef(language);
  const recordingStartTimeRef = useRef(0);
  languageRef.current = language;

  const onSpeechEnd = useCallback(
    async (source: AudioSource, audioBuffer: ArrayBuffer, speechStartMs: number) => {
      const timestamp = Date.now();
      pendingRef.current++;
      console.log(`[transcription] onSpeechEnd: source=${source}, byteLength=${audioBuffer.byteLength}, pending=${pendingRef.current}`);

      try {
        const result = await window.electronAPI.transcribe(source, audioBuffer, languageRef.current);
        console.log(`[transcription] IPC result: source=${source}, text="${result.text.slice(0, 80)}", segments=${result.segments.length}`);

        if (result.text) {
          if (source === 'mic') {
            const newSegment: TranscriptSegment = {
              id: `seg-${++segmentCounterRef.current}`,
              source,
              speaker: 'You',
              text: result.text,
              timestamp,
              speechStartMs,
              startTime: result.segments[0]?.t0 ?? 0,
              endTime: result.segments[result.segments.length - 1]?.t1 ?? 0,
            };
            setSegments((prev) => [...prev, newSegment]);
          } else {
            // System audio: split into separate segments at speaker turns
            const newSegments: TranscriptSegment[] = [];
            let currentTexts: string[] = [];
            let groupStart = result.segments[0]?.t0 ?? 0;

            for (const seg of result.segments) {
              currentTexts.push(seg.text);

              if (seg.speakerTurn) {
                // Emit accumulated segment for current speaker
                newSegments.push({
                  id: `seg-${++segmentCounterRef.current}`,
                  source,
                  speaker: `Speaker ${systemSpeakerRef.current}`,
                  text: currentTexts.join(' ').trim(),
                  timestamp,
                  speechStartMs,
                  startTime: groupStart,
                  endTime: seg.t1,
                });
                // Toggle speaker
                systemSpeakerRef.current = systemSpeakerRef.current === 1 ? 2 : 1;
                currentTexts = [];
                groupStart = seg.t1;
              }
            }

            // Emit remaining text
            if (currentTexts.length > 0) {
              const joinedText = currentTexts.join(' ').trim();
              if (joinedText) {
                const lastSeg = result.segments[result.segments.length - 1];
                newSegments.push({
                  id: `seg-${++segmentCounterRef.current}`,
                  source,
                  speaker: `Speaker ${systemSpeakerRef.current}`,
                  text: joinedText,
                  timestamp,
                  speechStartMs,
                  startTime: groupStart,
                  endTime: lastSeg?.t1 ?? 0,
                });
              }
            }

            if (newSegments.length > 0) {
              setSegments((prev) => [...prev, ...newSegments]);
            }
          }
        }
      } catch (err) {
        console.error(`[transcription] IPC error (${source}):`, err);
      } finally {
        pendingRef.current--;
        console.log(`[transcription] onSpeechEnd done: source=${source}, pending=${pendingRef.current}`);
        if (pendingRef.current === 0 && drainResolveRef.current) {
          drainResolveRef.current();
          drainResolveRef.current = null;
        }
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
  }, vadOptions);

  const { diarizationState, elapsedMs, checkModels, runDiarization } = useDiarization(
    recordingStartTimeRef,
    setSegments,
  );

  const startRecording = useCallback(async () => {
    clearSession();
    setRecordingState('recording');
    const now = Date.now();
    setRecordingStartTime(now);
    recordingStartTimeRef.current = now;
    segmentCounterRef.current = 0;
    systemSpeakerRef.current = 1;
    setSegments([]);
    setSpeakerNames({});
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

    // Wait for pending transcriptions to drain (max 10s)
    if (pendingRef.current > 0) {
      await Promise.race([
        new Promise<void>((resolve) => { drainResolveRef.current = resolve; }),
        new Promise<void>((resolve) => setTimeout(resolve, 10000)),
      ]);
      drainResolveRef.current = null;
    }

    setRecordingState('idle');
    await checkModels();
  }, [stopCapture, checkModels]);

  const renameSpeaker = useCallback((speakerId: string, name: string) => {
    setSpeakerNames((prev) => ({ ...prev, [speakerId]: name }));
  }, []);

  const dismissTranscript = useCallback(() => {
    clearSession();
    setSegments([]);
    setSpeakerNames({});
    setRecordingStartTime(0);
    recordingStartTimeRef.current = 0;
    window.electronAPI.cleanupAudioRecording();
  }, []);

  useSessionPersistence(segments, speakerNames, recordingStartTime, recordingState !== 'idle');

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
    diarizationState,
    elapsedMs,
    speakerNames,
    startRecording,
    stopRecording,
    toggleMicMute,
    runDiarization,
    renameSpeaker,
    dismissTranscript,
  };
}
