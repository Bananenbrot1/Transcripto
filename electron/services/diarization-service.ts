import * as path from 'node:path';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import type * as SherpaOnnxType from 'sherpa-onnx-node';
import type { DiarizationSegment, MergedSegment } from '../../shared/types.js';
import {
  CrossStreamReconciler,
  type CrossStreamReconcilerOptions,
} from './cross-stream-reconciler.js';

const require = createRequire(import.meta.url);

// Lazy-loaded on first initialize() call so a load failure doesn't crash the
// main process at startup and break unrelated features (e.g. transcription).
type SherpaOnnxModule = typeof SherpaOnnxType;
let sherpaOnnx: SherpaOnnxModule | null = null;
let diarizer: SherpaOnnxType.OfflineSpeakerDiarization | null = null;

// Re-export the shared DiarizationSegment as DiarizedSegment for backward compat
export type DiarizedSegment = DiarizationSegment;

/** Result from a dual-stream diarization run. */
export interface DualDiarizationResult {
  /** Diarization segments from the microphone recording. */
  micSegments: DiarizedSegment[];
  /** Diarization segments from the system audio recording. */
  sysSegments: DiarizedSegment[];
  /**
   * Merged, interleaved, and cross-stream-reconciled result from both streams.
   * Produced by CrossStreamReconciler.mergeStreamResults.
   */
  mergedSegments: MergedSegment[];
}

export function initialize(segmentationModelPath: string, embeddingModelPath: string): void {
  // Already initialized — skip the expensive model reload.
  if (diarizer) return;

  if (!sherpaOnnx) {
    sherpaOnnx = require('sherpa-onnx-node') as SherpaOnnxModule;
  }

  diarizer = new sherpaOnnx.OfflineSpeakerDiarization({
    segmentation: {
      pyannote: { model: segmentationModelPath },
    },
    embedding: {
      model: embeddingModelPath,
    },
    clustering: {
      numClusters: -1,   // auto-detect speaker count
      threshold: 0.5,
    },
    minDurationOn: 0.2,
    minDurationOff: 0.5,
  });
}

export async function diarize(audioBuffer: ArrayBuffer): Promise<DiarizedSegment[]> {
  if (!diarizer) throw new Error('Diarization not initialized');

  const float32 = new Float32Array(audioBuffer);
  const segments = await Promise.resolve(diarizer.process(float32));

  return segments.map((seg) => ({
    speaker: `Speaker ${String.fromCharCode(65 + seg.speaker)}`, // 0→A, 1→B, …
    start: seg.start,
    end: seg.end,
  }));
}

export function release(): void {
  diarizer = null;
}

const WORKER_PATH = path.join(import.meta.dirname, '..', 'workers', 'diarization-worker.js');

// Maximum time (ms) the diarization worker is allowed to run before we kill it.
const DIARIZATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function diarizeFromFile(
  micPath: string,
  sysPath: string,
  segModelPath: string,
  embModelPath: string,
  numSpeakers = -1,
): Promise<DiarizedSegment[]> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const worker = new Worker(WORKER_PATH, {
      workerData: {
        micPath,
        sysPath,
        segmentationModelPath: segModelPath,
        embeddingModelPath: embModelPath,
        numSpeakers,
      },
      stderr: true,
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.terminate();
        reject(new Error('Diarization timed out after 5 minutes'));
      }
    }, DIARIZATION_TIMEOUT_MS);

    // Collect stderr for better error diagnostics
    let stderrOutput = '';
    worker.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    worker.on('message', (msg: { type: string; segments?: DiarizedSegment[]; message?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (msg.type === 'result') {
        resolve(msg.segments ?? []);
      } else if (msg.type === 'error') {
        reject(new Error(msg.message ?? 'Diarization worker error'));
      }
    });

    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    worker.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const detail = stderrOutput ? `\n${stderrOutput.trim()}` : '';
      reject(new Error(`Diarization worker exited with code ${code}${detail}`));
    });
  });
}

/**
 * Run OfflineSpeakerDiarization separately on the mic and system audio streams,
 * then merge the two segment arrays via CrossStreamReconciler.
 *
 * The mic and system audio files must be raw Float32 PCM at 16 kHz mono — the
 * same format produced by the AudioWorklet and stored by AudioFileService.
 *
 * @param micPath         Path to the microphone raw audio file.
 * @param sysPath         Path to the system audio raw audio file.
 * @param segModelPath    Path to the pyannote segmentation ONNX model.
 * @param embModelPath    Path to the speaker embedding ONNX model.
 * @param numSpeakers     Expected speaker count (-1 = auto-detect). Default: -1.
 * @param reconcilerOpts  Optional CrossStreamReconciler threshold overrides.
 */
export function diarizeFromFileDual(
  micPath: string,
  sysPath: string,
  segModelPath: string,
  embModelPath: string,
  numSpeakers = -1,
  reconcilerOpts?: CrossStreamReconcilerOptions,
): Promise<DualDiarizationResult> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const worker = new Worker(WORKER_PATH, {
      workerData: {
        type: 'diarize-dual',
        micPath,
        sysPath,
        segmentationModelPath: segModelPath,
        embeddingModelPath: embModelPath,
        numSpeakers,
      },
      stderr: true,
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.terminate();
        reject(new Error('Diarization timed out after 5 minutes'));
      }
    }, DIARIZATION_TIMEOUT_MS);

    // Collect stderr for better error diagnostics
    let stderrOutput = '';
    worker.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    worker.on(
      'message',
      (msg: {
        type: string;
        micSegments?: DiarizedSegment[];
        sysSegments?: DiarizedSegment[];
        message?: string;
      }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (msg.type === 'dual-result') {
          const micSegments = msg.micSegments ?? [];
          const sysSegments = msg.sysSegments ?? [];
          const reconciler = new CrossStreamReconciler(reconcilerOpts);
          const mergedSegments = reconciler.mergeStreamResults(micSegments, sysSegments);
          resolve({ micSegments, sysSegments, mergedSegments });
        } else if (msg.type === 'error') {
          reject(new Error(msg.message ?? 'Diarization worker error'));
        }
      },
    );

    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    worker.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const detail = stderrOutput ? `\n${stderrOutput.trim()}` : '';
      reject(new Error(`Diarization worker exited with code ${code}${detail}`));
    });
  });
}
