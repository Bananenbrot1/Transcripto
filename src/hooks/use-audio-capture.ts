import { useRef, useState, useCallback } from 'react';
import { SimpleVAD, type VADOptions } from '@/lib/vad';
import { float32ToArrayBuffer } from '@/lib/audio-utils';
import type { AudioSource } from '@/types/transcription';

const FLUSH_INTERVAL_MS = 1000;

interface AudioPipeline {
  stream: MediaStream;
  audioContext: AudioContext;
  workletNode: AudioWorkletNode;
  vad: SimpleVAD;
  onStateChange: () => void;
}

interface AudioCaptureCallbacks {
  onSpeechEnd: (source: AudioSource, audioBuffer: ArrayBuffer, speechStartMs: number) => void;
  onRMS: (source: AudioSource, rms: number) => void;
  vadOptions?: VADOptions;
}

export type SystemAudioStatus = 'inactive' | 'active' | 'no-permission' | 'failed';

export function useAudioCapture(callbacks: AudioCaptureCallbacks, vadOptions?: VADOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [systemAudioStatus, setSystemAudioStatus] = useState<SystemAudioStatus>('inactive');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const micMutedRef = useRef(false);
  const micPipeline = useRef<AudioPipeline | null>(null);
  const sysPipeline = useRef<AudioPipeline | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Debug log stored in a ref; only flushed to state via getDebugInfo()
  const debugLogRef = useRef<string[]>([]);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  // Per-source pending chunk buffers flushed every FLUSH_INTERVAL_MS
  const micPendingRef = useRef<Float32Array[]>([]);
  const sysPendingRef = useRef<Float32Array[]>([]);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // RMS throttle: only push state updates at ~15fps via requestAnimationFrame
  const micRMSRef = useRef(0);
  const sysRMSRef = useRef(0);
  const rmsRafRef = useRef<number | null>(null);

  const scheduleRMSUpdate = useCallback(() => {
    if (rmsRafRef.current !== null) return;
    rmsRafRef.current = requestAnimationFrame(() => {
      rmsRafRef.current = null;
      callbacksRef.current.onRMS('mic', micRMSRef.current);
      callbacksRef.current.onRMS('system', sysRMSRef.current);
    });
  }, []);

  const log = useCallback((msg: string) => {
    console.log(`[audio-capture] ${msg}`);
    debugLogRef.current = [...debugLogRef.current.slice(-199), msg];
  }, []);

  const flushDebugLog = useCallback(() => {
    setDebugInfo([...debugLogRef.current]);
  }, []);

  const togglePause = useCallback(() => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
    if (micPipeline.current) {
      micPipeline.current.stream.getAudioTracks().forEach((track) => {
        track.enabled = next ? false : !micMutedRef.current;
      });
      if (next) micPipeline.current.vad.flush();
    }
    if (sysPipeline.current) {
      if (next) sysPipeline.current.vad.flush();
    }
  }, []);

  const toggleMicMute = useCallback(() => {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setIsMicMuted(next);
    if (micPipeline.current) {
      micPipeline.current.stream.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      if (next) {
        micPipeline.current.vad.flush();
      }
    }
  }, []);

  /** Concatenate an array of Float32Array chunks into a single buffer. */
  const concatChunks = (chunks: Float32Array[]): Float32Array => {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  };

  /** Flush pending chunks for one source to disk via IPC (fire-and-forget). */
  const flushSource = useCallback((source: 'mic' | 'sys') => {
    const pendingRef = source === 'mic' ? micPendingRef : sysPendingRef;
    if (pendingRef.current.length === 0) return;
    const combined = concatChunks(pendingRef.current);
    pendingRef.current = [];
    window.electronAPI.writeAudioChunk(source, combined.buffer as ArrayBuffer);
  }, []);

  const createPipeline = useCallback(
    async (stream: MediaStream, source: AudioSource, isMutedFn?: () => boolean): Promise<AudioPipeline> => {
      const audioContext = new AudioContext({ sampleRate: 48000 });
      await audioContext.audioWorklet.addModule('./pcm-worklet-processor.js');

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-worklet-processor');

      const vad = new SimpleVAD(vadOptions, {
        onSpeechEnd: (audio, speechStartMs) => {
          callbacksRef.current.onSpeechEnd(source, float32ToArrayBuffer(audio), speechStartMs);
        },
        onRMS: (rms) => {
          if (source === 'mic') {
            micRMSRef.current = rms;
          } else {
            sysRMSRef.current = rms;
          }
          scheduleRMSUpdate();
        },
      });

      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'pcm') {
          if (isPausedRef.current) return;
          const muted = isMutedFn?.() ?? false;
          if (!muted) {
            const ipcSource = source === 'mic' ? 'mic' : 'sys';
            const pendingRef = ipcSource === 'mic' ? micPendingRef : sysPendingRef;
            pendingRef.current.push(new Float32Array(event.data.samples));
            vad.process(event.data.samples);
          }
        }
      };

      sourceNode.connect(workletNode);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      workletNode.connect(silentGain);
      silentGain.connect(audioContext.destination);

      const onStateChange = () => {
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch((err) => console.warn('[audio-capture] resume failed:', err));
        }
      };
      audioContext.addEventListener('statechange', onStateChange);

      return { stream, audioContext, workletNode, vad, onStateChange };
    },
    [scheduleRMSUpdate],
  );

  const startCapture = useCallback(async () => {
    debugLogRef.current = [];
    setDebugInfo([]);
    micPendingRef.current = [];
    sysPendingRef.current = [];

    await window.electronAPI.openAudioRecording();

    const permissions = await window.electronAPI.getMediaPermissions();
    log(`Permissions: mic=${permissions.mic}, screen=${permissions.screen}`);

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
        log(`Video tracks: ${videoTracks.length} (stopping to dismiss screen-recording indicator)`);
        videoTracks.forEach((track) => track.stop());

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

    // Flush debug log to state now that startup is done
    flushDebugLog();

    // Start periodic flush
    flushIntervalRef.current = setInterval(() => {
      flushSource('mic');
      flushSource('sys');
    }, FLUSH_INTERVAL_MS);

    setIsCapturing(true);
  }, [createPipeline, log, flushSource, flushDebugLog]);

  const stopCapture = useCallback(async () => {
    // Stop flush interval
    if (flushIntervalRef.current !== null) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
    // Cancel pending RMS animation frame
    if (rmsRafRef.current !== null) {
      cancelAnimationFrame(rmsRafRef.current);
      rmsRafRef.current = null;
    }

    for (const pipeline of [micPipeline.current, sysPipeline.current]) {
      if (pipeline) {
        pipeline.vad.flush();
        pipeline.audioContext.removeEventListener('statechange', pipeline.onStateChange);
        pipeline.stream.getTracks().forEach((track) => track.stop());
        try {
          await pipeline.audioContext.close();
        } catch {
          // AudioContext may already be closed or in an invalid state
        }
      }
    }
    micPipeline.current = null;
    sysPipeline.current = null;
    micMutedRef.current = false;
    isPausedRef.current = false;
    setIsMicMuted(false);
    setIsPaused(false);
    setIsCapturing(false);
    setSystemAudioStatus('inactive');

    // Flush any remaining buffered audio chunks to disk, then close recording files
    flushSource('mic');
    flushSource('sys');
    await window.electronAPI.closeAudioRecording();
  }, [flushSource]);

  return { isCapturing, systemAudioStatus, debugInfo, isMicMuted, isPaused, startCapture, stopCapture, toggleMicMute, togglePause };
}
