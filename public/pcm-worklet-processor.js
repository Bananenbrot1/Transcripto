/**
 * AudioWorklet processor that resamples input audio from the native sample rate
 * (typically 48kHz) to 16kHz mono Float32 and posts chunks via the MessagePort.
 */
class PcmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
    // Accumulate ~100ms of 16kHz audio before posting (1600 samples)
    this._chunkSize = 1600;
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
    const resampled = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const index = Math.floor(srcIndex);
      const frac = srcIndex - index;
      const s0 = channelData[index] || 0;
      const s1 = channelData[Math.min(index + 1, channelData.length - 1)] || 0;
      resampled[i] = s0 + frac * (s1 - s0); // linear interpolation
    }

    // Append to buffer
    const newBuffer = new Float32Array(this._buffer.length + resampled.length);
    newBuffer.set(this._buffer);
    newBuffer.set(resampled, this._buffer.length);
    this._buffer = newBuffer;

    // Post chunks when we have enough data
    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._chunkSize);
      this._buffer = this._buffer.slice(this._chunkSize);
      this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-worklet-processor', PcmWorkletProcessor);
