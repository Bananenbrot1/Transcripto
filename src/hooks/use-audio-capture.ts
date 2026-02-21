import { useRef, useState, useCallback } from 'react';
import { SimpleVAD, type VADOptions } from '@/lib/vad';
import { float32ToArrayBuffer } from '@/lib/audio-utils';
import type { AudioSource } from '@/types/transcription';

interface AudioPipeline {
  stream: MediaStream;
  audioContext: AudioContext;
  workletNode: AudioWorkletNode;
  vad: SimpleVAD;
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
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const micMutedRef = useRef(false);
  const micPipeline = useRef<AudioPipeline | null>(null);
  const sysPipeline = useRef<AudioPipeline | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  // Separate 16kHz mono accumulators for mic and system audio.
  // Kept separate so getFullAudioBuffer() can produce a proper mixed-down
  // mono signal rather than an interleaved scramble from two async pipelines.
  const micAccumulator = useRef<Float32Array[]>([]);
  const sysAccumulator = useRef<Float32Array[]>([]);

  const log = useCallback((msg: string) => {
    console.log(`[audio-capture] ${msg}`);
    setDebugInfo((prev) => [...prev.slice(-199), msg]);
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

      const vad = new SimpleVAD(vadOptions);
      vad.setSpeechEndCallback((audio, speechStartMs) => {
        callbacksRef.current.onSpeechEnd(source, float32ToArrayBuffer(audio), speechStartMs);
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
            const acc = source === 'mic' ? micAccumulator : sysAccumulator;
            acc.current.push(new Float32Array(event.data.samples));
          }
          vad.process(event.data.samples);
        }
      };

      sourceNode.connect(workletNode);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      workletNode.connect(silentGain);
      silentGain.connect(audioContext.destination);

      // Resume the context automatically if it gets suspended (e.g. window loses focus).
      audioContext.addEventListener('statechange', () => {
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch((err) => console.warn('[audio-capture] resume failed:', err));
        }
      });

      return { stream, audioContext, workletNode, vad };
    },
    [],
  );

  const getFullAudioBuffer = useCallback((): ArrayBuffer => {
    // Flatten each stream into a contiguous Float32Array.
    const flatten = (chunks: Float32Array[]) => {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Float32Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      return out;
    };

    const mic = flatten(micAccumulator.current);
    const sys = flatten(sysAccumulator.current);

    // Additive mono mix: sum both streams sample-by-sample and clamp to [-1,1].
    // Pad the shorter stream with silence so the mixed buffer covers the full
    // recording duration for both sources.
    const len = Math.max(mic.length, sys.length);
    const mixed = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const m = i < mic.length ? mic[i] : 0;
      const s = i < sys.length ? sys[i] : 0;
      mixed[i] = Math.max(-1, Math.min(1, m + s));
    }
    return mixed.buffer;
  }, []);

  const startCapture = useCallback(async () => {
    setDebugInfo([]);
    micAccumulator.current = [];
    sysAccumulator.current = [];

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
        log(`Video tracks: ${videoTracks.length} (stopping to dismiss screen-recording indicator)`);
        // Stop (not just disable) the video track — stopping dismisses the
        // macOS screen-recording indicator. Audio tracks are unaffected.
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
