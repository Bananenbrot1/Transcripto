import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

// Re-export the shared DiarizationSegment as DiarizedSegment for backward compat
import type { DiarizationSegment } from '../../shared/types.js';
export type DiarizedSegment = DiarizationSegment;

const WORKER_PATH = path.join(import.meta.dirname, '..', 'workers', 'diarization-worker.js');

// Maximum time (ms) the diarization worker is allowed to run before we kill it.
const DIARIZATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Canonical diarization entry point — runs OfflineSpeakerDiarization in a worker. */
export function diarizeFromFile(
  micPath: string,
  sysPath: string,
  segModelPath: string,
  embModelPath: string,
  numSpeakers: number,
): Promise<{ segments: DiarizedSegment[]; mixedPath: string }> {
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

    worker.on('message', (msg: { type: string; segments?: DiarizedSegment[]; mixedPath?: string; message?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (msg.type === 'result') {
        resolve({ segments: msg.segments ?? [], mixedPath: msg.mixedPath ?? '' });
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
