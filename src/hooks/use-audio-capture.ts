import { useRef, useState, useCallback } from 'react';
import { SimpleVAD } from '@/lib/vad';
import { float32ToArrayBuffer } from '@/lib/audio-utils';
import type { AudioSource } from '@/types/transcription';

interface AudioPipeline {
  stream: MediaStream;
  audioContext: AudioContext;
  workletNode: AudioWorkletNode;
  vad: SimpleVAD;
}

interface AudioCaptureCallbacks {
  onSpeechEnd: (source: AudioSource, audioBuffer: ArrayBuffer) => void;
  onRMS: (source: AudioSource, rms: number) => void;
}

export type SystemAudioStatus = 'inactive' | 'active' | 'no-permission' | 'failed';

export function useAudioCapture(callbacks: AudioCaptureCallbacks) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [systemAudioStatus, setSystemAudioStatus] = useState<SystemAudioStatus>('inactive');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const micMutedRef = useRef(false);
  const micPipeline = useRef<AudioPipeline | null>(null);
  const sysPipeline = useRef<AudioPipeline | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  // Accumulates all 16kHz mono Float32 chunks from both mic and system for post-recording diarization
  const audioAccumulator = useRef<Float32Array[]>([]);

  const log = useCallback((msg: string) => {
    console.log(`[audio-capture] ${msg}`);
    setDebugInfo((prev) => [...prev, msg]);
  }, []);

  const toggleMicMute = useCallback(() => {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setIsMicMuted(next);
    if (micPipeline.current) {
      // Mute at the track level — the browser fills audio frames with silence,
      // which is more reliable than dropping packets in the message handler.
      micPipeline.current.stream.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      if (next) {
        micPipeline.current.vad.flush();
      }
    }
  }, []);

  const createPipeline = useCallback(
    async (stream: MediaStream, source: AudioSource, isMutedFn?: () => boolean): Promise<AudioPipeline> => {
      const audioContext = new AudioContext({ sampleRate: 48000 });
      await audioContext.audioWorklet.addModule('/pcm-worklet-processor.js');

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-worklet-processor');

      const vad = new SimpleVAD();
      vad.setSpeechEndCallback((audio) => {
        callbacksRef.current.onSpeechEnd(source, float32ToArrayBuffer(audio));
      });
      vad.setRMSCallback((rms) => {
        callbacksRef.current.onRMS(source, rms);
      });

      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'pcm') {
          const muted = isMutedFn?.() ?? false;
          // Don't accumulate muted audio into the diarization buffer.
          // The VAD still processes the (silent) samples so the RMS meter
          // drops to zero naturally via the track-level mute.
          if (!muted) {
            audioAccumulator.current.push(new Float32Array(event.data.samples));
          }
          vad.process(event.data.samples);
        }
      };

      sourceNode.connect(workletNode);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      workletNode.connect(silentGain);
      silentGain.connect(audioContext.destination);

      return { stream, audioContext, workletNode, vad };
    },
    [],
  );

  const getFullAudioBuffer = useCallback((): ArrayBuffer => {
    const chunks = audioAccumulator.current;
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const combined = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined.buffer;
  }, []);

  const startCapture = useCallback(async () => {
    setDebugInfo([]);
    audioAccumulator.current = [];

    // Check permissions first
    const permissions = await window.electronAPI.getMediaPermissions();
    log(`Permissions: mic=${permissions.mic}, screen=${permissions.screen}`);

    // Request mic permission if needed
    if (permissions.mic !== 'granted') {
      const granted = await window.electronAPI.requestMicPermission();
      log(`Mic permission request result: ${granted}`);
    }

    // 1. Mic capture
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      },
    });
    const micTracks = micStream.getAudioTracks();
    log(`Mic stream: ${micTracks.length} audio tracks, state=${micTracks[0]?.readyState}, enabled=${micTracks[0]?.enabled}`);
    micPipeline.current = await createPipeline(micStream, 'mic', () => micMutedRef.current);

    // 2. System audio capture via getDisplayMedia
    if (permissions.screen !== 'granted') {
      log(`Screen permission not granted (${permissions.screen}), skipping system audio`);
      setSystemAudioStatus('no-permission');
    } else {
      try {
        log('Calling getDisplayMedia...');
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        log(`getDisplayMedia returned: ${displayStream.getTracks().length} total tracks`);

        const videoTracks = displayStream.getVideoTracks();
        log(`Video tracks: ${videoTracks.length} (disabling, not stopping)`);
        videoTracks.forEach((track) => {
          track.enabled = false;
        });

        const audioTracks = displayStream.getAudioTracks();
        log(`Audio tracks: ${audioTracks.length}`);
        audioTracks.forEach((track, i) => {
          log(`  Audio track ${i}: label="${track.label}", state=${track.readyState}, enabled=${track.enabled}, muted=${track.muted}`);
          const settings = track.getSettings();
          log(`  Settings: sampleRate=${settings.sampleRate}, channelCount=${settings.channelCount}, deviceId=${settings.deviceId}`);
        });

        if (audioTracks.length > 0 && audioTracks[0].readyState === 'live') {
          sysPipeline.current = await createPipeline(displayStream, 'system');
          setSystemAudioStatus('active');
          log('System audio pipeline created successfully');
        } else if (audioTracks.length > 0 && audioTracks[0].readyState === 'ended') {
          log('Audio track exists but state=ended → missing "System Audio Recording" permission');
          setSystemAudioStatus('no-permission');
        } else {
          log('No audio tracks in display stream → missing "System Audio Recording" permission');
          setSystemAudioStatus('no-permission');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`getDisplayMedia failed: ${msg}`);
        setSystemAudioStatus('failed');
      }
    }

    setIsCapturing(true);
  }, [createPipeline, log]);

  const stopCapture = useCallback(async () => {
    for (const pipeline of [micPipeline.current, sysPipeline.current]) {
      if (pipeline) {
        pipeline.vad.flush();
        pipeline.stream.getTracks().forEach((track) => track.stop());
        await pipeline.audioContext.close();
      }
    }
    micPipeline.current = null;
    sysPipeline.current = null;
    micMutedRef.current = false;
    setIsMicMuted(false);
    setIsCapturing(false);
    setSystemAudioStatus('inactive');
  }, []);

  return { isCapturing, systemAudioStatus, debugInfo, isMicMuted, startCapture, stopCapture, toggleMicMute, getFullAudioBuffer };
}
