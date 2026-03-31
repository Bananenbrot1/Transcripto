import { useState, useCallback, useRef, useEffect } from 'react';
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

  // Tracks the most recently embedding-assigned speaker per source so that short
  // segments (<1 s) can inherit the identity instead of being embedded separately.
  const lastSpeakerBySourceRef = useRef<{
    mic?: { speakerId: string; speakerLabel: string };
    system?: { speakerId: string; speakerLabel: string };
  }>({});

  const onSpeechEnd = useCallback(
    async (source: 'mic' | 'system', audioBuffer: ArrayBuffer, speechStartMs: number) => {
      const timestamp = Date.now();
      pendingRef.current++;
      console.log(`[transcription] onSpeechEnd: source=${source}, byteLength=${audioBuffer.byteLength}, pending=${pendingRef.current}`);

      // Segments shorter than 1 s produce unreliable embeddings. Skip the
      // worker call and inherit the most recently assigned speaker instead.
      // Audio is Float32 PCM at 16 kHz → 4 bytes/sample → samples = byteLength/4.
      const durationSecs = audioBuffer.byteLength / 4 / 16_000;
      const isShort = durationSecs < 1.0;

      try {
        const result = await window.electronAPI.transcribe(source, audioBuffer, languageRef.current);
        console.log(`[transcription] IPC result: source=${source}, text="${result.text.slice(0, 80)}", segments=${result.segments.length}`);

        if (result.text) {
          // Read the inherited speaker AFTER transcription so we get the most
          // up-to-date value in case another segment's embedding resolved while
          // we were waiting for the transcribe call.
          const inheritedSpeaker = lastSpeakerBySourceRef.current[source];

          const newSegmentIds: string[] = [];

          if (source === 'mic') {
            const segId = `seg-${++segmentCounterRef.current}`;
            newSegmentIds.push(segId);
            // For short segments inherit the last assigned speaker; otherwise
            // default to 'You' until the embedding pipeline resolves.
            const speaker = isShort && inheritedSpeaker ? inheritedSpeaker.speakerLabel : 'You';
            const speakerId = isShort && inheritedSpeaker ? inheritedSpeaker.speakerId : undefined;
            const newSegment: TranscriptSegment = {
              id: segId,
              source,
              speaker,
              speakerId,
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
                const segId = `seg-${++segmentCounterRef.current}`;
                newSegmentIds.push(segId);
                const speaker = isShort && inheritedSpeaker
                  ? inheritedSpeaker.speakerLabel
                  : `Speaker ${systemSpeakerRef.current}`;
                const speakerId = isShort && inheritedSpeaker ? inheritedSpeaker.speakerId : undefined;
                newSegments.push({
                  id: segId,
                  source,
                  speaker,
                  speakerId,
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
                const segId = `seg-${++segmentCounterRef.current}`;
                newSegmentIds.push(segId);
                const speaker = isShort && inheritedSpeaker
                  ? inheritedSpeaker.speakerLabel
                  : `Speaker ${systemSpeakerRef.current}`;
                const speakerId = isShort && inheritedSpeaker ? inheritedSpeaker.speakerId : undefined;
                newSegments.push({
                  id: segId,
                  source,
                  speaker,
                  speakerId,
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

          // Request speaker embedding extraction for segments that are long enough.
          // Short segments are skipped — their speaker label was already set above.
          if (!isShort && newSegmentIds.length > 0) {
            window.electronAPI.requestEmbedding(source, audioBuffer, newSegmentIds);
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

  const { isCapturing, systemAudioStatus, debugInfo, isMicMuted, isPaused, startCapture, stopCapture, toggleMicMute, togglePause } = useAudioCapture({
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

  const updateSegmentText = useCallback((id: string, text: string) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  }, []);

  const deleteSegment = useCallback((id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const dismissTranscript = useCallback(() => {
    clearSession();
    setSegments([]);
    setSpeakerNames({});
    setRecordingStartTime(0);
    recordingStartTimeRef.current = 0;
    window.electronAPI.cleanupAudioRecording();
  }, []);

  const restoreTranscript = useCallback((restoredSegments: TranscriptSegment[], restoredSpeakerNames: Record<string, string>) => {
    setSegments(restoredSegments);
    setSpeakerNames(restoredSpeakerNames);
  }, []);

  const appendFileSegments = useCallback((newSegments: TranscriptSegment[]) => {
    setSegments((prev) => [...prev, ...newSegments]);
    segmentCounterRef.current += newSegments.length;
  }, []);

  useSessionPersistence(segments, speakerNames, recordingStartTime, recordingState !== 'idle');

  // Subscribe to speaker assignment push events from the main process.
  // When the embedding worker resolves a speaker identity, update the matching
  // segments in state and remember the last known speaker per source so that
  // subsequent short segments can inherit the identity.
  useEffect(() => {
    const unsubscribe = window.electronAPI.onSpeakerAssigned((assignments) => {
      // Update last-speaker tracking first (ref is always current — safe outside setState).
      for (const a of assignments) {
        lastSpeakerBySourceRef.current[a.source] = {
          speakerId: a.speakerId,
          speakerLabel: a.speakerLabel,
        };
      }
      // Apply speaker identity to the matching segments.
      setSegments((prev) =>
        prev.map((seg) => {
          const match = assignments.find((a) => a.segmentId === seg.id);
          if (!match) return seg;
          return { ...seg, speaker: match.speakerLabel, speakerId: match.speakerId };
        }),
      );
    });
    return unsubscribe;
  }, []);

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
    isPaused,
    diarizationState,
    elapsedMs,
    speakerNames,
    startRecording,
    stopRecording,
    toggleMicMute,
    togglePause,
    runDiarization,
    renameSpeaker,
    updateSegmentText,
    deleteSegment,
    dismissTranscript,
    restoreTranscript,
    appendFileSegments,
  };
}
