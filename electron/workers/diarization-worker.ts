import { workerData, parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mixMicAndSystem } from './diarization-mix.js';

const SAMPLE_RATE = 16000;

const require = createRequire(import.meta.url);

interface WorkerData {
  micPath: string;
  sysPath: string;
  segmentationModelPath: string;
  embeddingModelPath: string;
  /** Explicit cluster count (required from UI; never -1 on the happy path). */
  numSpeakers: number;
}

const READ_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB read buffer

function readF32File(filePath: string, out: Float32Array, offset: number): void {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let pos = 0;
    let bytesRead: number;
    do {
      bytesRead = fs.readSync(fd, buf, 0, READ_CHUNK_BYTES, pos);
      if (bytesRead === 0) break;
      // Align to 4-byte boundary (Float32 samples)
      const alignedBytes = bytesRead - (bytesRead % 4);
      if (alignedBytes === 0) break;
      const samples = new Float32Array(buf.buffer, buf.byteOffset, alignedBytes / 4);
      out.set(samples, offset + pos / 4);
      pos += alignedBytes;
    } while (bytesRead === READ_CHUNK_BYTES);
  } finally {
    fs.closeSync(fd);
  }
}

async function run(): Promise<void> {
  const { micPath, sysPath, segmentationModelPath, embeddingModelPath, numSpeakers } =
    workerData as WorkerData;

  const micSize = fs.existsSync(micPath) ? fs.statSync(micPath).size : 0;
  const sysSize = fs.existsSync(sysPath) ? fs.statSync(sysPath).size : 0;

  const micSamples = Math.floor(micSize / 4);
  const sysSamples = Math.floor(sysSize / 4);
  const totalSamples = Math.max(micSamples, sysSamples);

  if (totalSamples === 0) {
    parentPort!.postMessage({ type: 'error', message: 'No audio data to diarize' });
    return;
  }

  const mic = new Float32Array(micSamples);
  const sys = new Float32Array(sysSamples);
  if (micSamples > 0) readF32File(micPath, mic, 0);
  if (sysSamples > 0) readF32File(sysPath, sys, 0);

  const mixed = mixMicAndSystem(mic, sys, totalSamples);

  const mixedPath = path.join(path.dirname(micPath), 'mixed-session.f32');
  fs.writeFileSync(mixedPath, Buffer.from(mixed.buffer, mixed.byteOffset, mixed.byteLength));

  const sherpaOnnx = require('sherpa-onnx-node');

  // Sole entry point for OfflineSpeakerDiarization — numClusters is init-time only,
  // so this worker is spawned fresh per diarizeFromFile() call with the requested count.
  const diarizer = new sherpaOnnx.OfflineSpeakerDiarization({
    segmentation: {
      pyannote: { model: segmentationModelPath },
    },
    embedding: {
      model: embeddingModelPath,
    },
    clustering: {
      // Fixed speaker count from the UI (passed as numClusters).
      numClusters: numSpeakers,
      // Only consulted when numClusters == -1 (auto-detect). Kept as inert default.
      // Valid range typically ~0.1–1.0; lower → more clusters.
      threshold: 0.5,
    },
    // Drop speech regions shorter than this (seconds). Floor for conversational speech.
    minDurationOn: 0.2,
    // Fill gaps shorter than this (seconds). 0.2 allows rapid turn-taking (~200ms).
    // Valid range typically 0.0–0.5; lower → sharper speaker boundaries.
    minDurationOff: 0.2,
  });

  const rawSegments = diarizer.process(mixed);

  const segments = rawSegments.map((seg: { speaker: number; start: number; end: number }) => ({
    speaker: `Speaker ${String.fromCharCode(65 + seg.speaker)}`,
    start: seg.start,
    end: seg.end,
    startByte: Math.floor(seg.start * SAMPLE_RATE) * 4,
    endByte: Math.floor(seg.end * SAMPLE_RATE) * 4,
  }));

  parentPort!.postMessage({ type: 'result', segments, mixedPath });
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  parentPort!.postMessage({ type: 'error', message });
});
