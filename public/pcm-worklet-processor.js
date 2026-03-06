/**
 * AudioWorklet processor that resamples input audio from the native sample rate
 * (typically 48kHz) to 16kHz mono Float32 and posts chunks via the MessagePort.
 *
 * Uses a pre-allocated ring buffer to avoid O(n²) allocations on every process()
 * call. The buffer is sized to hold ~200ms of 16kHz audio (3200 samples), which
 * is more than enough for the typical ~42 samples produced per 128-sample input.
 */
class PcmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Accumulate ~100ms of 16kHz audio before posting (1600 samples)
    this._chunkSize = 1600;
    // Ring buffer: 2x chunk size should always be enough headroom
    this._bufferSize = this._chunkSize * 2;
    this._buffer = new Float32Array(this._bufferSize);
    this._writePos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Take first channel (mono)
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // Resample from sampleRate to 16000
    const ratio = sampleRate / 16000;
    const outputLength = Math.floor(channelData.length / ratio);

    // Write resampled data directly into the ring buffer
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const index = Math.floor(srcIndex);
      const frac = srcIndex - index;
      const s0 = channelData[index] || 0;
      const s1 = channelData[Math.min(index + 1, channelData.length - 1)] || 0;
      this._buffer[this._writePos++] = s0 + frac * (s1 - s0);
    }

    // Post chunks when we have enough data
    while (this._writePos >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._chunkSize);
      // Shift remaining data to front of buffer
      const remaining = this._writePos - this._chunkSize;
      if (remaining > 0) {
        this._buffer.copyWithin(0, this._chunkSize, this._writePos);
      }
      this._writePos = remaining;
      this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-worklet-processor', PcmWorkletProcessor);
