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
      const text = chunk.toString();
      stderrOutput += text;
      process.stderr.write(`[parakeet-worker] ${text}`);
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

export function isMicContextBusy(): boolean {
  return micQueueDepth > 0;
}

export async function transcribeFile(
  audioBuffer: ArrayBuffer,
  language: string,
  totalDurationSec: number,
  onProgress: (progress: FileTranscribeProgress) => void,
): Promise<TranscribeResult> {
  if (!micWorker) {
    throw new Error('Parakeet not initialized');
  }
  if (micQueueDepth > 0) {
    throw new Error('Mic worker is busy — cannot transcribe file while recording');
  }

  micQueueDepth++;
  try {
    const float32 = new Float32Array(audioBuffer);
    const requestId = nextRequestId++;

    log(`[parakeet] transcribeFile: ${float32.length} samples, duration=${totalDurationSec}s`);

    const result = await new Promise<TranscribeResult>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('[parakeet] file transcription timed out after 10 minutes'));
        }
      }, 600_000);

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
          const text = (msg as ParakeetTranscribeResponse).text.trim();

          const segments: TranscribeSegment[] = text
            ? [{ text, t0: 0, t1: totalDurationSec, speakerTurn: false }]
            : [];

          // Report final progress
          onProgress({
            segmentsCompleted: segments.length,
            durationProcessedSec: totalDurationSec,
            totalDurationSec,
            newSegments: segments,
          });

          resolve({ text, segments });
        }
      };

      micWorker!.on('message', onMessage);
      micWorker!.postMessage({
        type: 'transcribe',
        id: requestId,
        samples: float32,
        sampleRate: 16000,
      } as ParakeetTranscribeRequest);
    });

    log(`[parakeet] transcribeFile done: segments=${result.segments.length}`);
    return result;
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
