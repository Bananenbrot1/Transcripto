const { initWhisper } = require('@fugood/whisper.node');

let micContext = null;
let sysContext = null;

async function initialize(modelPath) {
  // Create two separate contexts for concurrent transcription
  [micContext, sysContext] = await Promise.all([
    initWhisper({ filePath: modelPath, useGpu: true }),
    initWhisper({ filePath: modelPath, useGpu: true }),
  ]);
}

async function transcribe(source, audioBuffer, language) {
  const ctx = source === 'mic' ? micContext : sysContext;
  if (!ctx) {
    throw new Error('Whisper not initialized');
  }

  // audioBuffer is an ArrayBuffer of Float32 PCM 16kHz mono
  // whisper.node expects ArrayBuffer of 16-bit PCM — we convert Float32 → Int16
  const float32 = new Float32Array(audioBuffer);
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const { promise } = ctx.transcribeData(int16.buffer, {
    language: language || 'auto',
    maxLen: 0, // no max length per segment
    temperature: 0.0,
  });

  const result = await promise;

  return {
    text: (result.result || '').trim(),
    segments: (result.segments || []).map((seg) => ({
      text: (seg.text || '').trim(),
      t0: seg.t0 || 0,
      t1: seg.t1 || 0,
    })),
  };
}

async function release() {
  const promises = [];
  if (micContext) {
    promises.push(micContext.release());
    micContext = null;
  }
  if (sysContext) {
    promises.push(sysContext.release());
    sysContext = null;
  }
  await Promise.all(promises);
}

module.exports = { initialize, transcribe, release };
