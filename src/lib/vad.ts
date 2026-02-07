import { calculateRMS, concatFloat32Arrays } from './audio-utils';

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

  private onSpeechEnd: ((audio: Float32Array) => void) | null = null;
  private onRMS: ((rms: number) => void) | null = null;

  constructor(options: VADOptions = {}) {
    this.silenceThreshold = options.silenceThreshold ?? 0.01;
    this.silenceDurationMs = options.silenceDurationMs ?? 800;
    this.maxSegmentMs = options.maxSegmentMs ?? 30000;
    this.minSegmentMs = options.minSegmentMs ?? 500;
  }

  setSpeechEndCallback(cb: (audio: Float32Array) => void) {
    this.onSpeechEnd = cb;
  }

  setRMSCallback(cb: (rms: number) => void) {
    this.onRMS = cb;
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
    const durationMs = (this.totalSamples / 16000) * 1000;
    if (durationMs >= this.minSegmentMs && this.onSpeechEnd) {
      const audio = concatFloat32Arrays(this.chunks);
      this.onSpeechEnd(audio);
    }
    this.reset();
  }

  private reset() {
    this.chunks = [];
    this.totalSamples = 0;
    this.isSpeaking = false;
    this.silenceStartTime = null;
    this.segmentStartTime = null;
  }
}
