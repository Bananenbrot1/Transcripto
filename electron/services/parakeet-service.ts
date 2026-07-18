import { app } from 'electron';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { TranscribeResult, FileTranscribeProgress, TranscribeSegment } from '../../shared/types.js';
import type {
  ParakeetTranscribeRequest,
  ParakeetTranscribeResponse,
  ParakeetErrorResponse,
  ParakeetReadyMessage,
} from '../workers/parakeet-worker.js';

const TRANSCRIBE_TIMEOUT_MS = 20_000;
const MAX_QUEUE_DEPTH = 50;
const QUEUE_FULL_WAIT_MS = 120_000;
const isDev = !app.isPackaged;

function log(...args: unknown[]) {
  if (isDev) console.log(...args);
}

let micWorker: Worker | null = null;
let sysWorker: Worker | null = null;

let micHead: Promise<void> = Promise.resolve();
let sysHead: Promise<void> = Promise.resolve();
let micQueueDepth = 0;
let sysQueueDepth = 0;

let nextRequestId = 0;

const WORKER_PATH = path.join(import.meta.dirname, '..', 'workers', 'parakeet-worker.js');

function createWorker(modelDir: string): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { modelDir },
      stderr: true,
    });

    let stderrOutput = '';
    worker.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    const onMessage = (msg: ParakeetReadyMessage | ParakeetTranscribeResponse | ParakeetErrorResponse) => {
      if (msg.type === 'ready') {
        worker.removeListener('error', onError);
        resolve(worker);
      }
    };

    const onError = (err: Error) => {
      worker.removeListener('message', onMessage);
      const detail = stderrOutput ? `\n${stderrOutput.trim()}` : '';
      reject(new Error(`Parakeet worker failed to start: ${err.message}${detail}`));
    };

    worker.on('message', onMessage);
    worker.once('error', onError);
  });
}

export async function initialize(modelDir: string): Promise<void> {
  log(`[parakeet] initialize: modelDir=${modelDir}`);
  if (micWorker || sysWorker) {
    log('[parakeet] releasing existing workers before re-init');
    await release();
  }

  [micWorker, sysWorker] = await Promise.all([
    createWorker(modelDir),
    createWorker(modelDir),
  ]);

  micHead = Promise.resolve();
  sysHead = Promise.resolve();
  micQueueDepth = 0;
  sysQueueDepth = 0;
  log('[parakeet] initialize: workers ready');
}

function doTranscribe(
  source: 'mic' | 'system',
  audioBuffer: ArrayBuffer,
  _language: string,
  releaseGate: () => void,
): Promise<TranscribeResult> {
  const worker = source === 'mic' ? micWorker : sysWorker;
  if (!worker) {
    releaseGate();
    throw new Error('Parakeet not initialized');
  }

  const float32 = new Float32Array(audioBuffer);
  const requestId = nextRequestId++;

  log(`[parakeet] transcribe start: source=${source}, float32Samples=${float32.length}`);

  return new Promise<TranscribeResult>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        releaseGate();
        reject(new Error(`[parakeet] transcribeData timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`));
      }
    }, TRANSCRIBE_TIMEOUT_MS);

    const onMessage = (msg: ParakeetTranscribeResponse | ParakeetErrorResponse | ParakeetReadyMessage) => {
      if ('id' in msg && msg.id !== requestId) return;
      if (msg.type !== 'result' && msg.type !== 'error') return;

      if (settled) return;
      settled = true;
      clearTimeout(timer);
      releaseGate();
      worker.removeListener('message', onMessage);

      if (msg.type === 'error') {
        reject(new Error((msg as ParakeetErrorResponse).message));
      } else {
        const text = (msg as ParakeetTranscribeResponse).text.trim();
        log(`[parakeet] transcribe done: text="${text.slice(0, 80)}..."`);
        resolve({
          text,
          segments: text ? [{ text, t0: 0, t1: 0, speakerTurn: false }] : [],
        });
      }
    };

    worker.on('message', onMessage);

    worker.postMessage({
      type: 'transcribe',
      id: requestId,
      samples: float32,
      sampleRate: 16000,
    } as ParakeetTranscribeRequest);
  });
}

export async function transcribe(
  source: 'mic' | 'system',
  audioBuffer: ArrayBuffer,
  language: string,
): Promise<TranscribeResult> {
  const start = Date.now();
  while (true) {
    const depth = source === 'mic' ? micQueueDepth : sysQueueDepth;
    if (depth < MAX_QUEUE_DEPTH) break;
    if (Date.now() - start >= QUEUE_FULL_WAIT_MS) {
      log(`[parakeet] queue full (depth=${depth}) for source=${source} after waiting ${QUEUE_FULL_WAIT_MS}ms — dropping segment`);
      throw new Error(`Parakeet queue full for ${source}, segment dropped`);
    }
    log(`[parakeet] queue full (depth=${depth}) for source=${source}, waiting for slot...`);
    await new Promise((r) => setTimeout(r, 500));
  }

  if (source === 'mic') micQueueDepth++;
  else sysQueueDepth++;

  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });

  const prevHead = source === 'mic' ? micHead : sysHead;
  if (source === 'mic') {
    micHead = gate;
  } else {
    sysHead = gate;
  }

  return prevHead
    .then(() => {
      const worker = source === 'mic' ? micWorker : sysWorker;
      if (!worker) {
        releaseGate();
        throw new Error('Parakeet released while segment was queued');
      }
      return doTranscribe(source, audioBuffer, language, releaseGate);
    })
    .finally(() => {
      if (source === 'mic') micQueueDepth--;
      else sysQueueDepth--;
    });
}

export interface TranscribeBufferOptions {
  prompt?: string;
}

/**
 * Offline re-transcription of a single audio slice. Runs post-recording when the
 * workers are otherwise idle, so it reuses the mic worker. `options` is accepted
 * for interface parity with the Whisper engine but Parakeet has no prompt input.
 */
export function transcribeBuffer(
  audioBuffer: ArrayBuffer,
  _language: string,
  _options: TranscribeBufferOptions = {},
): Promise<TranscribeResult> {
  const worker = micWorker ?? sysWorker;
  if (!worker) {
    return Promise.reject(new Error('Parakeet not initialized'));
  }

  const float32 = new Float32Array(audioBuffer);
  if (float32.length === 0) {
    return Promise.resolve({ text: '', segments: [] });
  }
  const requestId = nextRequestId++;

  return new Promise<TranscribeResult>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.removeListener('message', onMessage);
        reject(new Error(`[parakeet] transcribeBuffer timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`));
      }
    }, TRANSCRIBE_TIMEOUT_MS);

    const onMessage = (msg: ParakeetTranscribeResponse | ParakeetErrorResponse | ParakeetReadyMessage) => {
      if ('id' in msg && msg.id !== requestId) return;
      if (msg.type !== 'result' && msg.type !== 'error') return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeListener('message', onMessage);

      if (msg.type === 'error') {
        reject(new Error((msg as ParakeetErrorResponse).message));
      } else {
        const text = (msg as ParakeetTranscribeResponse).text.trim();
        resolve({
          text,
          segments: text ? [{ text, t0: 0, t1: 0, speakerTurn: false }] : [],
        });
      }
    };

    worker.on('message', onMessage);
    worker.postMessage({
      type: 'transcribe',
      id: requestId,
      samples: float32,
      sampleRate: 16000,
    } as ParakeetTranscribeRequest);
  });
}

export function isMicContextBusy(): boolean {
  return micQueueDepth > 0;
}

/** True if either mic or system queue has in-flight / waiting work. */
export function isBusy(): boolean {
  return micQueueDepth > 0 || sysQueueDepth > 0;
}

/**
 * Compute accurate t0/t1 for a chunk segment using token-level timestamps.
 * timestamps[i] is seconds relative to chunk start.
 * Falls back to chunk boundaries if timestamps are missing or empty.
 */
function chunkSegmentTimes(
  timestamps: number[] | undefined,
  chunkStartSec: number,
  chunkEndSec: number,
): { t0: number; t1: number } {
  if (!timestamps || timestamps.length === 0) {
    return { t0: chunkStartSec, t1: chunkEndSec };
  }
  return {
    t0: chunkStartSec + timestamps[0],
    t1: chunkStartSec + timestamps[timestamps.length - 1],
  };
}

const CHUNK_SAMPLES = 30 * 16000; // 30 seconds at 16kHz

export async function transcribeFile(
  audioBuffer: ArrayBuffer,
  language: string,
  totalDurationSec: number,
  onProgress: (progress: FileTranscribeProgress) => void,
): Promise<TranscribeResult> {
  if (!micWorker) throw new Error('Parakeet not initialized');
  if (micQueueDepth > 0) throw new Error('Mic worker is busy — cannot transcribe file while recording');

  micQueueDepth++;
  try {
    const float32 = new Float32Array(audioBuffer);
    const totalSamples = float32.length;
    log(`[parakeet] transcribeFile: ${totalSamples} samples, duration=${totalDurationSec}s`);

    const allSegments: TranscribeSegment[] = [];
    let allText = '';
    let samplesProcessed = 0;
    let chunkIndex = 0;

    while (samplesProcessed < totalSamples) {
      const chunkStart = samplesProcessed;
      const chunkEnd = Math.min(chunkStart + CHUNK_SAMPLES, totalSamples);
      const chunk = float32.slice(chunkStart, chunkEnd);
      const chunkStartSec = chunkStart / 16000;
      const chunkEndSec = chunkEnd / 16000;

      log(`[parakeet] transcribeFile chunk ${chunkIndex}: samples=${chunk.length}, t=${chunkStartSec.toFixed(1)}–${chunkEndSec.toFixed(1)}s`);

      const requestId = nextRequestId++;
      const chunkResult = await new Promise<{ text: string; tokens?: string[]; timestamps?: number[] }>((resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error(`[parakeet] chunk ${chunkIndex} timed out after 60s`));
          }
        }, 60_000);

        const onMessage = (msg: ParakeetTranscribeResponse | ParakeetErrorResponse | ParakeetReadyMessage) => {
          if ('id' in msg && msg.id !== requestId) return;
          if (msg.type !== 'result' && msg.type !== 'error') return;
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          micWorker!.removeListener('message', onMessage);
          if (msg.type === 'error') {
            reject(new Error((msg as ParakeetErrorResponse).message));
          } else {
            const m = msg as ParakeetTranscribeResponse;
            resolve({ text: m.text.trim(), tokens: m.tokens, timestamps: m.timestamps });
          }
        };

        micWorker!.on('message', onMessage);
        micWorker!.postMessage({
          type: 'transcribe',
          id: requestId,
          samples: chunk,
          sampleRate: 16000,
        } as ParakeetTranscribeRequest);
      });

      samplesProcessed = chunkEnd;
      chunkIndex++;

      if (chunkResult.text) {
        const { t0, t1 } = chunkSegmentTimes(chunkResult.timestamps, chunkStartSec, chunkEndSec);
        const segment: TranscribeSegment = {
          text: chunkResult.text,
          t0,
          t1,
          speakerTurn: false,
        };
        allSegments.push(segment);
        allText += (allText ? ' ' : '') + chunkResult.text;
        onProgress({
          segmentsCompleted: allSegments.length,
          durationProcessedSec: samplesProcessed / 16000,
          totalDurationSec,
          newSegments: [segment],
        });
      } else {
        // Silent chunk — report progress without a new segment
        onProgress({
          segmentsCompleted: allSegments.length,
          durationProcessedSec: samplesProcessed / 16000,
          totalDurationSec,
          newSegments: [],
        });
      }
    }

    log(`[parakeet] transcribeFile done: ${allSegments.length} segments`);
    return { text: allText, segments: allSegments };
  } finally {
    micQueueDepth--;
  }
}

export async function release(): Promise<void> {
  log('[parakeet] release called');
  micHead = Promise.resolve();
  sysHead = Promise.resolve();
  micQueueDepth = 0;
  sysQueueDepth = 0;

  const promises: Promise<number>[] = [];
  if (micWorker) {
    promises.push(micWorker.terminate());
    micWorker = null;
  }
  if (sysWorker) {
    promises.push(sysWorker.terminate());
    sysWorker = null;
  }
  await Promise.all(promises);
  log('[parakeet] release done');
}
