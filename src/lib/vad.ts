import { calculateRMS, concatFloat32Arrays } from './audio-utils';

/** Minimum average RMS across the full segment to emit — rejects noise spikes followed by silence */
const MIN_SEGMENT_RMS = 0.008;

export interface VADCallbacks {
  onSpeechEnd?: (audio: Float32Array, speechStartMs: number) => void;
  onRMS?: (rms: number) => void;
  onSpeechState?: (isSpeaking: boolean) => void;
}

export interface VADOptions {
  /** RMS threshold below which audio is considered silence (default: 0.01) */
  silenceThreshold?: number;
  /** Milliseconds of silence before speech is considered ended (default: 800) */
  silenceDurationMs?: number;
  /** Maximum segment duration in milliseconds (default: 30000) */
  maxSegmentMs?: number;
  /** Minimum segment duration in milliseconds to emit (default: 500) */
  minSegmentMs?: number;
}

export class SimpleVAD {
  private silenceThreshold: number;
  private silenceDurationMs: number;
  private maxSegmentMs: number;
  private minSegmentMs: number;

  private chunks: Float32Array[] = [];
  private totalSamples = 0;
  private isSpeaking = false;
  private silenceStartTime: number | null = null;
  private segmentStartTime: number | null = null;
  private isGated = false;

  private onSpeechEnd: ((audio: Float32Array, speechStartMs: number) => void) | null = null;
  private onRMS: ((rms: number) => void) | null = null;
  private onSpeechState: ((isSpeaking: boolean) => void) | null = null;

  constructor(options: VADOptions = {}, callbacks: VADCallbacks = {}) {
    this.silenceThreshold = options.silenceThreshold ?? 0.015;
    this.silenceDurationMs = options.silenceDurationMs ?? 800;
    this.maxSegmentMs = options.maxSegmentMs ?? 30000;
    this.minSegmentMs = options.minSegmentMs ?? 800;

    if (callbacks.onSpeechEnd) this.onSpeechEnd = callbacks.onSpeechEnd;
    if (callbacks.onRMS) this.onRMS = callbacks.onRMS;
    if (callbacks.onSpeechState) this.onSpeechState = callbacks.onSpeechState;
  }

  setSpeechEndCallback(cb: (audio: Float32Array, speechStartMs: number) => void) {
    this.onSpeechEnd = cb;
  }

  setRMSCallback(cb: (rms: number) => void) {
    this.onRMS = cb;
  }

  setSpeechStateCallback(cb: (isSpeaking: boolean) => void) {
    this.onSpeechState = cb;
  }

  /**
   * Gate the mic VAD to suppress echo from system audio.
   * When gated=true: speech segments are discarded instead of emitted.
   * When gated=false: accumulated buffer is discarded (echo tail cleanup) and VAD resets.
   */
  setGated(gated: boolean) {
    this.isGated = gated;
    if (!gated) {
      this.reset();
    }
  }

  /** Feed 16kHz mono Float32 PCM samples */
  process(samples: Float32Array) {
    const rms = calculateRMS(samples);
    this.onRMS?.(rms);

    const now = Date.now();
    const isAboveThreshold = rms > this.silenceThreshold;

    if (isAboveThreshold) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.segmentStartTime = now;
        this.onSpeechState?.(true);
      }
      this.silenceStartTime = null;
      this.chunks.push(new Float32Array(samples));
      this.totalSamples += samples.length;
    } else if (this.isSpeaking) {
      // Still accumulate audio during silence gap
      this.chunks.push(new Float32Array(samples));
      this.totalSamples += samples.length;

      if (this.silenceStartTime === null) {
        this.silenceStartTime = now;
      }

      const silenceElapsed = now - this.silenceStartTime;
      if (silenceElapsed >= this.silenceDurationMs) {
        this.emitSegment();
      }
    }

    // Force emit if segment is too long
    if (
      this.isSpeaking &&
      this.segmentStartTime !== null &&
      now - this.segmentStartTime >= this.maxSegmentMs
    ) {
      this.emitSegment();
    }
  }

  /** Flush any remaining audio (call when stopping recording) */
  flush() {
    if (this.chunks.length > 0 && this.isSpeaking) {
      this.emitSegment();
    }
  }

  private emitSegment() {
    if (!this.isGated) {
      const durationMs = (this.totalSamples / 16000) * 1000;
      if (durationMs >= this.minSegmentMs && this.onSpeechEnd) {
        const audio = concatFloat32Arrays(this.chunks);
        const segmentRMS = calculateRMS(audio);
        if (segmentRMS >= MIN_SEGMENT_RMS) {
          this.onSpeechEnd(audio, this.segmentStartTime ?? Date.now());
        }
      }
    }
    this.reset();
  }

  private reset() {
    if (this.isSpeaking) this.onSpeechState?.(false);
    this.chunks = [];
    this.totalSamples = 0;
    this.isSpeaking = false;
    this.silenceStartTime = null;
    this.segmentStartTime = null;
  }
}
