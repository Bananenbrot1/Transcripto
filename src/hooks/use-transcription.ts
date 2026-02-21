import { useState, useCallback, useRef } from 'react';
import { useAudioCapture } from './use-audio-capture';
import type { VADOptions } from '@/lib/vad';
import type {
  AudioSource,
  RecordingState,
  TranscriptSegment,
} from '@/types/transcription';

export type DiarizationState = 'idle' | 'models-missing' | 'available' | 'processing' | 'done' | 'error';

interface UseTranscriptionOptions {
  language: string;
  vadOptions?: VADOptions;
}

export function useTranscription({ language, vadOptions }: UseTranscriptionOptions) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [micRMS, setMicRMS] = useState(0);
  const [systemRMS, setSystemRMS] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState(0);
  const [diarizationState, setDiarizationState] = useState<DiarizationState>('idle');
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const pendingRef = useRef(0);
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
            setSegments((prev) => [...prev, newSegment].sort((a, b) => a.timestamp - b.timestamp));
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
              setSegments((prev) => [...prev, ...newSegments].sort((a, b) => a.timestamp - b.timestamp));
            }
          }
        }
      } catch (err) {
        console.error(`[transcription] IPC error (${source}):`, err);
      } finally {
        pendingRef.current--;
        console.log(`[transcription] onSpeechEnd done: source=${source}, pending=${pendingRef.current}`);
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

  const { isCapturing, systemAudioStatus, debugInfo, isMicMuted, startCapture, stopCapture, toggleMicMute, getFullAudioBuffer } = useAudioCapture({
    onSpeechEnd,
    onRMS,
  }, vadOptions);

  const startRecording = useCallback(async () => {
    setRecordingState('recording');
    const now = Date.now();
    setRecordingStartTime(now);
    recordingStartTimeRef.current = now;
    segmentCounterRef.current = 0;
    systemSpeakerRef.current = 1;
    setSegments([]);
    setDiarizationState('idle');
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

    // Wait for pending transcriptions to finish (max 10s)
    const start = Date.now();
    while (pendingRef.current > 0 && Date.now() - start < 10000) {
      await new Promise((r) => setTimeout(r, 200));
    }

    setRecordingState('idle');

    // Check if diarization models are available
    try {
      const status = await window.electronAPI.checkDiarizationModels();
      const modelsReady = status.segmentation && status.embedding;
      setDiarizationState(modelsReady ? 'available' : 'models-missing');
    } catch (err) {
      console.error('Failed to check diarization models:', err);
      setDiarizationState('models-missing');
    }
  }, [stopCapture]);

  const runDiarization = useCallback(async () => {
    setDiarizationState('processing');
    try {
      await window.electronAPI.initializeDiarization();
      const buffer = getFullAudioBuffer();
      const diarSegments = await window.electronAPI.diarize(buffer);

      const recStart = recordingStartTimeRef.current;
      setSegments((prev) =>
        prev.map((seg) => {
          // Use speechStartMs (when VAD detected speech onset) rather than
          // timestamp (when VAD emitted the segment after the silence gap).
          // This gives a much more accurate offset into the diarization timeline.
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
    }
  }, [getFullAudioBuffer]);

  const renameSpeaker = useCallback((speakerId: string, name: string) => {
    setSpeakerNames((prev) => ({ ...prev, [speakerId]: name }));
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
    diarizationState,
    speakerNames,
    startRecording,
    stopRecording,
    toggleMicMute,
    runDiarization,
    renameSpeaker,
  };
}
