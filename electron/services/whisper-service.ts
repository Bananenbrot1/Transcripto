import { app } from 'electron';
import * as whisperNode from '@fugood/whisper.node';
import type { WhisperContext, NewSegmentsEvent } from '@fugood/whisper.node';
import type { TranscribeResult } from '../../shared/types.js';

const TURN_MARKER = ' [SPEAKER_TURN]';
const TRANSCRIBE_TIMEOUT_MS = 20_000;
const isDev = !app.isPackaged;

function log(...args: unknown[]) {
  if (isDev) console.log(...args);
}
// Maximum segments that may be queued (running + waiting) per source.
// Excess segments are dropped rather than piling up unboundedly in memory.
// Kept high enough so that mic + system can both run without dropping when both are active.
// Increased for long meetings where speech can outpace transcription.
const MAX_QUEUE_DEPTH = 50;
// When queue is full, wait up to this long for a slot before dropping the segment.
const QUEUE_FULL_WAIT_MS = 120_000;

let micContext: WhisperContext | null = null;
let sysContext: WhisperContext | null = null;

// Each slot is a promise that resolves only when the underlying NATIVE whisper
// operation finishes (not just when our timeout fires).  This prevents calling
// transcribeData on a context that is still busy, which causes a deadlock.
let micHead: Promise<void> = Promise.resolve();
let sysHead: Promise<void> = Promise.resolve();
let micQueueDepth = 0;
let sysQueueDepth = 0;

export async function initialize(modelPath: string): Promise<void> {
  log(`[whisper] initialize: modelPath=${modelPath}`);
  if (micContext || sysContext) {
    log('[whisper] releasing existing contexts before re-init');
    await release();
  }

  [micContext, sysContext] = await Promise.all([
    whisperNode.initWhisper({ filePath: modelPath, useGpu: true }),
    whisperNode.initWhisper({ filePath: modelPath, useGpu: true }),
  ]);
  micHead = Promise.resolve();
  sysHead = Promise.resolve();
  micQueueDepth = 0;
  sysQueueDepth = 0;
  log('[whisper] initialize: contexts ready', { mic: !!micContext, sys: !!sysContext });
}

async function doTranscribe(
  source: 'mic' | 'system',
  audioBuffer: ArrayBuffer,
  language: string,
  releaseGate: () => void,
): Promise<TranscribeResult> {
  const ctx = source === 'mic' ? micContext : sysContext;
  if (!ctx) {
    releaseGate(); // unblock the queue even if context is missing
    throw new Error('Whisper not initialized');
  }

  const float32Length = audioBuffer.byteLength / 4;
  log(`[whisper] transcribe start: source=${source}, lang=${language}, float32Samples=${float32Length}`);

  const float32 = new Float32Array(audioBuffer);
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  log(`[whisper] transcribe: converted to ${int16.length} int16 samples`);

  const collectedSegments: Array<{ text: string; t0: number; t1: number }> = [];

  log('[whisper] transcribe: calling ctx.transcribeData...');
  const { promise: nativePromise } = ctx.transcribeData(int16.buffer, {
    language: language || 'auto',
    maxLen: 0,
    temperature: 0.0,
    tdrzEnable: true,
    onNewSegments: (event: NewSegmentsEvent) => {
      log('[whisper] onNewSegments received:', typeof event, JSON.stringify(event));
      try {
        for (const seg of event.segments) {
          collectedSegments.push({ text: seg.text ?? '', t0: seg.t0 ?? 0, t1: seg.t1 ?? 0 });
        }
        log(`[whisper] onNewSegments: pushed ${event.segments.length} segment(s), total=${collectedSegments.length}`);
      } catch (err) {
        log('[whisper] onNewSegments push error:', err);
      }
    },
  });

  // Release the gate when the native op finishes — regardless of timeout
  nativePromise.then(releaseGate, releaseGate);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[whisper] transcribeData timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`)), TRANSCRIBE_TIMEOUT_MS),
  );

  log('[whisper] transcribe: awaiting promise (timeout=' + TRANSCRIBE_TIMEOUT_MS + 'ms)...');
  try {
    await Promise.race([nativePromise, timeout]);
    log(`[whisper] transcribe: promise resolved, collectedSegments=${collectedSegments.length}`);
  } catch (err) {
    if (collectedSegments.length > 0) {
      // The native promise didn't resolve but segments were delivered — use them.
      // The gate will release once the native op eventually finishes.
      log(`[whisper] timeout but ${collectedSegments.length} segment(s) already collected — using partial result`);
    } else {
      log('[whisper] transcribe: no segments and timed out:', err);
      throw err;
    }
  }

  const processed = collectedSegments.map((seg) => {
    const hasTurn = seg.text.endsWith(TURN_MARKER);
    return {
      text: hasTurn ? seg.text.slice(0, -TURN_MARKER.length).trim() : seg.text.trim(),
      t0: seg.t0,
      t1: seg.t1,
      speakerTurn: hasTurn,
    };
  });

  const result: TranscribeResult = {
    text: processed.map((s) => s.text).join(' ').trim(),
    segments: processed,
  };
  log(`[whisper] transcribe done: text="${result.text.slice(0, 80)}...", segments=${result.segments.length}`);
  return result;
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
      log(`[whisper] queue full (depth=${depth}) for source=${source} after waiting ${QUEUE_FULL_WAIT_MS}ms — dropping segment`);
      throw new Error(`Whisper queue full for ${source}, segment dropped`);
    }
    log(`[whisper] queue full (depth=${depth}) for source=${source}, waiting for slot...`);
    await new Promise((r) => setTimeout(r, 500));
  }

  if (source === 'mic') micQueueDepth++;
  else sysQueueDepth++;

  // Claim the gate immediately so the next caller queues behind us.
  // The gate only opens once the previous NATIVE whisper op finishes.
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
      // Context may have been released while we were queued
      const ctx = source === 'mic' ? micContext : sysContext;
      if (!ctx) {
        releaseGate();
        throw new Error('Whisper released while segment was queued');
      }
      return doTranscribe(source, audioBuffer, language, releaseGate);
    })
    .finally(() => {
      if (source === 'mic') micQueueDepth--;
      else sysQueueDepth--;
    });
}

export async function release(): Promise<void> {
  log('[whisper] release called');
  micHead = Promise.resolve();
  sysHead = Promise.resolve();
  micQueueDepth = 0;
  sysQueueDepth = 0;
  const promises: Promise<void>[] = [];
  if (micContext) {
    promises.push(micContext.release());
    micContext = null;
  }
  if (sysContext) {
    promises.push(sysContext.release());
    sysContext = null;
  }
  await Promise.all(promises);
  log('[whisper] release done');
}
