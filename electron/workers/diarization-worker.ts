import { workerData, parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';

const require = createRequire(import.meta.url);

interface WorkerData {
  micPath: string;
  sysPath: string;
  segmentationModelPath: string;
  embeddingModelPath: string;
  numSpeakers: number; // -1 = auto-detect
  /**
   * 'diarize-dual' — run OfflineSpeakerDiarization separately on each stream and
   * return two independent segment arrays. Omit (or any other value) for the
   * default single-stream mix-and-diarize mode.
   */
  type?: 'diarize-dual';
}

interface RawSegment {
  speaker: number;
  start: number;
  end: number;
}

interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
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

function readF32FileToArray(filePath: string): Float32Array | null {
  const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  if (size === 0) return null;
  const samples = Math.floor(size / 4);
  const audio = new Float32Array(samples);
  readF32File(filePath, audio, 0);
  return audio;
}

function mapSegments(rawSegments: RawSegment[]): DiarizationSegment[] {
  return rawSegments.map((seg) => ({
    speaker: `Speaker ${String.fromCharCode(65 + seg.speaker)}`,
    start: seg.start,
    end: seg.end,
  }));
}

function clamp(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function makeDiarizer(
  sherpaOnnx: { OfflineSpeakerDiarization: new (cfg: unknown) => { process: (audio: Float32Array) => RawSegment[] } },
  segmentationModelPath: string,
  embeddingModelPath: string,
  numSpeakers: number,
) {
  return new sherpaOnnx.OfflineSpeakerDiarization({
    segmentation: {
      pyannote: { model: segmentationModelPath },
    },
    embedding: {
      model: embeddingModelPath,
    },
    clustering: {
      numClusters: numSpeakers,
      // Only used when numClusters == -1 (auto-detect).
      threshold: 0.5,
    },
    minDurationOn: 0.2,
    minDurationOff: 0.5,
  });
}

// ---------------------------------------------------------------------------
// Single-stream mode (original behaviour)
// ---------------------------------------------------------------------------

async function runSingle(data: WorkerData): Promise<void> {
  const { micPath, sysPath, segmentationModelPath, embeddingModelPath, numSpeakers } = data;

  const micSize = fs.existsSync(micPath) ? fs.statSync(micPath).size : 0;
  const sysSize = fs.existsSync(sysPath) ? fs.statSync(sysPath).size : 0;

  const micSamples = Math.floor(micSize / 4);
  const sysSamples = Math.floor(sysSize / 4);
  const totalSamples = Math.max(micSamples, sysSamples);

  if (totalSamples === 0) {
    parentPort!.postMessage({ type: 'error', message: 'No audio data to diarize' });
    return;
  }

  // Single allocation for the mixed output
  const mixed = new Float32Array(totalSamples);

  // Pass 1: read mic into mixed
  if (micSamples > 0) {
    readF32File(micPath, mixed, 0);
  }

  // Pass 2: read sys and add to mixed (clamp)
  if (sysSamples > 0) {
    const fd = fs.openSync(sysPath, 'r');
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
        const sampleOffset = pos / 4;
        for (let i = 0; i < samples.length; i++) {
          mixed[sampleOffset + i] = clamp(mixed[sampleOffset + i] + samples[i]);
        }
        pos += alignedBytes;
      } while (bytesRead === READ_CHUNK_BYTES);
    } finally {
      fs.closeSync(fd);
    }
  }

  const sherpaOnnx = require('sherpa-onnx-node');
  const diarizer = makeDiarizer(sherpaOnnx, segmentationModelPath, embeddingModelPath, numSpeakers);
  const rawSegments = diarizer.process(mixed);
  const segments = mapSegments(rawSegments);

  parentPort!.postMessage({ type: 'result', segments });
}

// ---------------------------------------------------------------------------
// Dual-stream mode (new behaviour)
// ---------------------------------------------------------------------------

async function runDual(data: WorkerData): Promise<void> {
  const { micPath, sysPath, segmentationModelPath, embeddingModelPath, numSpeakers } = data;

  const micAudio = readF32FileToArray(micPath);
  const sysAudio = readF32FileToArray(sysPath);

  if (!micAudio && !sysAudio) {
    parentPort!.postMessage({ type: 'error', message: 'No audio data to diarize' });
    return;
  }

  const sherpaOnnx = require('sherpa-onnx-node');
  const diarizer = makeDiarizer(sherpaOnnx, segmentationModelPath, embeddingModelPath, numSpeakers);

  const micSegments: DiarizationSegment[] = micAudio
    ? mapSegments(diarizer.process(micAudio))
    : [];

  const sysSegments: DiarizationSegment[] = sysAudio
    ? mapSegments(diarizer.process(sysAudio))
    : [];

  parentPort!.postMessage({ type: 'dual-result', micSegments, sysSegments });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const data = workerData as WorkerData;
  if (data.type === 'diarize-dual') {
    await runDual(data);
  } else {
    await runSingle(data);
  }
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  parentPort!.postMessage({ type: 'error', message });
});
