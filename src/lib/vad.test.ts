import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SimpleVAD } from './vad';

/** Create a Float32Array filled with a constant value */
function makeChunk(value: number, length = 1600): Float32Array {
  return new Float32Array(length).fill(value);
}

/** Number of samples needed for a given duration at 16kHz */
function samplesForMs(ms: number): number {
  return (ms / 1000) * 16000;
}

describe('SimpleVAD', () => {
  let vad: SimpleVAD;
  let speechEndCb: Mock<(audio: Float32Array) => void>;

  beforeEach(() => {
    vad = new SimpleVAD({
      silenceThreshold: 0.01,
      silenceDurationMs: 100, // short for testing
      maxSegmentMs: 5000,
      minSegmentMs: 200,
    });
    speechEndCb = vi.fn<(audio: Float32Array) => void>();
    vad.setSpeechEndCallback(speechEndCb);
  });

  it('speech above threshold triggers accumulation, silence after emits segment', () => {
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => time);

    vad = new SimpleVAD({
      silenceThreshold: 0.01,
      silenceDurationMs: 100,
      maxSegmentMs: 5000,
      minSegmentMs: 200,
    });
    speechEndCb = vi.fn<(audio: Float32Array) => void>();
    vad.setSpeechEndCallback(speechEndCb);

    // Feed loud audio at t=1000
    vad.process(makeChunk(0.5, 3200));
    expect(speechEndCb).not.toHaveBeenCalled();

    // First silence chunk sets silenceStartTime
    time = 1050;
    vad.process(makeChunk(0, 1600));
    expect(speechEndCb).not.toHaveBeenCalled();

    // Second silence chunk triggers emission (150ms > 100ms silenceDurationMs)
    time = 1200;
    vad.process(makeChunk(0, 1600));

    expect(speechEndCb).toHaveBeenCalledTimes(1);
    const emittedAudio = speechEndCb.mock.calls[0][0];
    expect(emittedAudio).toBeInstanceOf(Float32Array);
    expect(emittedAudio.length).toBe(3200 + 1600 + 1600); // loud + 2 silence chunks

    vi.restoreAllMocks();
  });

  it('segments below minSegmentMs are discarded', () => {
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => time);

    vad = new SimpleVAD({
      silenceThreshold: 0.01,
      silenceDurationMs: 100,
      maxSegmentMs: 5000,
      minSegmentMs: 500,
    });
    speechEndCb = vi.fn<(audio: Float32Array) => void>();
    vad.setSpeechEndCallback(speechEndCb);

    // Feed only a tiny amount of loud audio (100 samples = 6.25ms, way below 500ms)
    vad.process(makeChunk(0.5, 100));

    // Silence to trigger end
    time = 1200;
    vad.process(makeChunk(0, 1600));

    // Should not emit because segment is too short
    expect(speechEndCb).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('segments exceeding maxSegmentMs are force-emitted', () => {
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => time);

    vad = new SimpleVAD({
      silenceThreshold: 0.01,
      silenceDurationMs: 100,
      maxSegmentMs: 500,
      minSegmentMs: 100,
    });
    speechEndCb = vi.fn<(audio: Float32Array) => void>();
    vad.setSpeechEndCallback(speechEndCb);

    // Feed loud audio at t=1000
    vad.process(makeChunk(0.5, 3200));
    expect(speechEndCb).not.toHaveBeenCalled();

    // Advance time past maxSegmentMs and feed more loud audio
    time = 1600; // 600ms later, > 500ms max
    vad.process(makeChunk(0.5, 1600));

    expect(speechEndCb).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('flush() emits remaining audio', () => {
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => time);

    vad = new SimpleVAD({
      silenceThreshold: 0.01,
      silenceDurationMs: 100,
      maxSegmentMs: 5000,
      minSegmentMs: 200,
    });
    speechEndCb = vi.fn<(audio: Float32Array) => void>();
    vad.setSpeechEndCallback(speechEndCb);

    // Feed enough loud audio to meet minSegmentMs
    vad.process(makeChunk(0.5, 3200));
    expect(speechEndCb).not.toHaveBeenCalled();

    vad.flush();
    expect(speechEndCb).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('flush() on empty state does nothing', () => {
    vad.flush();
    expect(speechEndCb).not.toHaveBeenCalled();
  });

  it('RMS callback fires on every process() call', () => {
    const rmsCb = vi.fn();
    vad.setRMSCallback(rmsCb);

    vad.process(makeChunk(0.5, 1600));
    vad.process(makeChunk(0, 1600));
    vad.process(makeChunk(0.3, 1600));

    expect(rmsCb).toHaveBeenCalledTimes(3);
    // First call should have RMS of 0.5
    expect(rmsCb.mock.calls[0][0]).toBeCloseTo(0.5);
    // Second call should have RMS of 0
    expect(rmsCb.mock.calls[1][0]).toBe(0);
  });

  it('custom options override defaults', () => {
    const customVad = new SimpleVAD({
      silenceThreshold: 0.05,
      silenceDurationMs: 2000,
      maxSegmentMs: 60000,
      minSegmentMs: 1000,
    });

    // Verify by feeding audio below default threshold (0.01) but above nothing
    // With threshold 0.05, audio at 0.02 should be treated as silence
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => time);

    const cb = vi.fn();
    customVad.setSpeechEndCallback(cb);

    customVad.process(makeChunk(0.02, 3200));

    // Should not trigger speech since 0.02 < 0.05 threshold
    time = 3100;
    customVad.process(makeChunk(0, 1600));

    expect(cb).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
