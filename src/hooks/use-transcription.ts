import { useState, useCallback, useRef } from 'react';
import { useAudioCapture } from './use-audio-capture';
import { useSessionPersistence, loadSession, clearSession } from './use-session-persistence';
import { useDiarization } from './use-diarization';
import { useRetranscription } from './use-retranscription';
import type { VADOptions } from '@/lib/vad';
import type {
  AudioSource,
  RecordingState,
  TranscriptSegment,
} from '@/types/transcription';

export type { DiarizationState } from './use-diarization';

export type TranscriptView = 'realtime' | 'diarized';

interface UseTranscriptionOptions {
  language: string;
  vadOptions?: VADOptions;
  correctionEnabled?: boolean;
}

export function useTranscription({ language, vadOptions, correctionEnabled = false }: UseTranscriptionOptions) {
  const [realtimeSegments, setRealtimeSegments] = useState<TranscriptSegment[]>(() => loadSession()?.segments ?? []);
  const [diarizedSegments, setDiarizedSegments] = useState<TranscriptSegment[]>([]);
  const [activeView, setActiveView] = useState<TranscriptView>('realtime');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [micRMS, setMicRMS] = useState(0);
  const [systemRMS, setSystemRMS] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState(() => loadSession()?.recordingStartTime ?? 0);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(() => loadSession()?.speakerNames ?? {});
  const [correctingIds, setCorrectingIds] = useState<Set<string>>(new Set());
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  const pendingRef = useRef(0);
  const drainResolveRef = useRef<(() => void) | null>(null);
  const segmentCounterRef = useRef(0);
  const systemSpeakerRef = useRef(1);
  const languageRef = useRef(language);
  const recordingStartTimeRef = useRef(0);
  const correctionEnabledRef = useRef(correctionEnabled);
  const activeViewRef = useRef<TranscriptView>('realtime');
  languageRef.current = language;
  correctionEnabledRef.current = correctionEnabled;
  activeViewRef.current = activeView;

  const segments = activeView === 'diarized' ? diarizedSegments : realtimeSegments;

  const correctSegmentAsync = useCallback((segmentId: string, rawText: string) => {
    setCorrectingIds((prev) => new Set([...prev, segmentId]));

    Promise.race([
      window.electronAPI.correctSegment(rawText),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2000),
      ),
    ])
      .then((correctedText) => {
        setRealtimeSegments((prev) =>
          prev.map((s) => (s.id === segmentId ? { ...s, text: correctedText } : s)),
        );
      })
      .catch(() => {
        // Silently fall back to raw Whisper text
      })
      .finally(() => {
        setCorrectingIds((prev) => {
          const next = new Set(prev);
          next.delete(segmentId);
          return next;
        });
      });
  }, []);

  const onSpeechEnd = useCallback(
    async (source: 'mic' | 'system', audioBuffer: ArrayBuffer, speechStartMs: number) => {
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
            setRealtimeSegments((prev) => [...prev, newSegment]);
            if (correctionEnabledRef.current) {
              correctSegmentAsync(newSegment.id, result.text);
            }
          } else {
            const newSegments: TranscriptSegment[] = [];
            let currentTexts: string[] = [];
            let groupStart = result.segments[0]?.t0 ?? 0;

            for (const seg of result.segments) {
              currentTexts.push(seg.text);

              if (seg.speakerTurn) {
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
                systemSpeakerRef.current = systemSpeakerRef.current === 1 ? 2 : 1;
                currentTexts = [];
                groupStart = seg.t1;
              }
            }

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
              setRealtimeSegments((prev) => [...prev, ...newSegments]);
              if (correctionEnabledRef.current) {
                for (const seg of newSegments) {
                  correctSegmentAsync(seg.id, seg.text);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`[transcription] IPC error (${source}):`, err);
        const message = err instanceof Error ? err.message : String(err);
        setTranscriptionError(
          message.includes('queue full')
            ? `A ${source} speech segment was dropped — transcription could not keep up.`
            : `Failed to transcribe a ${source} segment: ${message}`,
        );
      } finally {
        pendingRef.current--;
        console.log(`[transcription] onSpeechEnd done: source=${source}, pending=${pendingRef.current}`);
        if (pendingRef.current === 0 && drainResolveRef.current) {
          drainResolveRef.current();
          drainResolveRef.current = null;
        }
      }
    },
    [correctSegmentAsync],
  );

  const onRMS = useCallback((source: AudioSource, rms: number) => {
    if (source === 'mic') setMicRMS(rms);
    else setSystemRMS(rms);
  }, []);

  const { isCapturing, systemAudioStatus, debugInfo, isMicMuted, isPaused, startCapture, stopCapture, toggleMicMute, togglePause } = useAudioCapture(
    { onSpeechEnd, onRMS },
    vadOptions,
  );

  const { diarizationState, setDiarizationState, elapsedMs, checkModels, runDiarization: runDiarizationCore } = useDiarization();
  const { retranscribe, progress: retranscribeProgress } = useRetranscription();

  const runDiarization = useCallback(async (numSpeakers: number) => {
    setDiarizationState('processing');
    let diar;
    try {
      diar = await runDiarizationCore(numSpeakers);
    } catch (err) {
      console.error('Diarization failed:', err);
      setDiarizationState('error');
      window.electronAPI.cleanupAfterRetranscription();
      return;
    }

    try {
      const rebuilt = await retranscribe(
        diar.segments,
        diar.mixedPath,
        recordingStartTimeRef.current,
        languageRef.current,
      );
      setDiarizedSegments(rebuilt);
      setActiveView('diarized');
      setDiarizationState('done');
    } catch (err) {
      console.error('Re-transcription failed:', err);
      setDiarizationState('error');
    } finally {
      window.electronAPI.cleanupAfterRetranscription();
    }
  }, [runDiarizationCore, retranscribe, setDiarizationState]);

  const startRecording = useCallback(async () => {
    clearSession();
    setCaptureError(null);
    setTranscriptionError(null);
    setRecordingState('recording');
    const now = Date.now();
    setRecordingStartTime(now);
    recordingStartTimeRef.current = now;
    segmentCounterRef.current = 0;
    systemSpeakerRef.current = 1;
    setRealtimeSegments([]);
    setDiarizedSegments([]);
    setActiveView('realtime');
    setSpeakerNames({});
    setCorrectingIds(new Set());
    try {
      await startCapture();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setRecordingState('idle');
      const message = err instanceof Error ? err.message : String(err);
      setCaptureError(
        /permission|denied|NotAllowed/i.test(message)
          ? 'Microphone access was denied. Allow microphone access in System Settings, then try again.'
          : `Could not start recording: ${message}`,
      );
    }
  }, [startCapture]);

  const clearCaptureError = useCallback(() => setCaptureError(null), []);
  const clearTranscriptionError = useCallback(() => setTranscriptionError(null), []);

  const stopRecording = useCallback(async () => {
    setRecordingState('stopping');
    await stopCapture();

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

  const updateSegmentText = useCallback((id: string, text: string) => {
    const setter = activeViewRef.current === 'diarized' ? setDiarizedSegments : setRealtimeSegments;
    setter((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  }, []);

  const deleteSegment = useCallback((id: string) => {
    const setter = activeViewRef.current === 'diarized' ? setDiarizedSegments : setRealtimeSegments;
    setter((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const dismissTranscript = useCallback(() => {
    clearSession();
    setRealtimeSegments([]);
    setDiarizedSegments([]);
    setActiveView('realtime');
    setSpeakerNames({});
    setRecordingStartTime(0);
    recordingStartTimeRef.current = 0;
    setCorrectingIds(new Set());
    window.electronAPI.cleanupAudioRecording();
  }, []);

  const restoreTranscript = useCallback((restoredSegments: TranscriptSegment[], restoredSpeakerNames: Record<string, string>) => {
    setRealtimeSegments(restoredSegments);
    setSpeakerNames(restoredSpeakerNames);
  }, []);

  const appendFileSegments = useCallback((newSegments: TranscriptSegment[]) => {
    setRealtimeSegments((prev) => [...prev, ...newSegments]);
    segmentCounterRef.current += newSegments.length;
  }, []);

  useSessionPersistence(realtimeSegments, speakerNames, recordingStartTime);

  return {
    segments,
    realtimeSegments,
    diarizedSegments,
    activeView,
    setActiveView,
    retranscribeProgress,
    correctingIds,
    recordingState,
    recordingStartTime,
    isCapturing,
    systemAudioStatus,
    debugInfo,
    micRMS,
    systemRMS,
    isMicMuted,
    isPaused,
    diarizationState,
    elapsedMs,
    speakerNames,
    captureError,
    transcriptionError,
    clearCaptureError,
    clearTranscriptionError,
    startRecording,
    stopRecording,
    toggleMicMute,
    togglePause,
    checkDiarizationModels: checkModels,
    runDiarization,
    renameSpeaker,
    updateSegmentText,
    deleteSegment,
    dismissTranscript,
    restoreTranscript,
    appendFileSegments,
  };
}
