import * as whisperNode from '@fugood/whisper.node';
import type { WhisperContext, NewSegmentsEvent } from '@fugood/whisper.node';

interface TranscribeResult {
  text: string;
  segments: Array<{
    text: string;
    t0: number;
    t1: number;
    speakerTurn: boolean;
  }>;
}

const TURN_MARKER = ' [SPEAKER_TURN]';
const TRANSCRIBE_TIMEOUT_MS = 20_000;

let micContext: WhisperContext | null = null;
let sysContext: WhisperContext | null = null;

// Each slot is a promise that resolves only when the underlying NATIVE whisper
// operation finishes (not just when our timeout fires).  This prevents calling
// transcribeData on a context that is still busy, which causes a deadlock.
let micHead: Promise<void> = Promise.resolve();
let sysHead: Promise<void> = Promise.resolve();

export async function initialize(modelPath: string): Promise<void> {
  console.log(`[whisper] initialize: modelPath=${modelPath}`);
  if (micContext || sysContext) {
    console.log('[whisper] releasing existing contexts before re-init');
    await release();
  }

  [micContext, sysContext] = await Promise.all([
    whisperNode.initWhisper({ filePath: modelPath, useGpu: true }),
    whisperNode.initWhisper({ filePath: modelPath, useGpu: true }),
  ]);
  micHead = Promise.resolve();
  sysHead = Promise.resolve();
  console.log('[whisper] initialize: contexts ready', { mic: !!micContext, sys: !!sysContext });
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
  console.log(`[whisper] transcribe start: source=${source}, lang=${language}, float32Samples=${float32Length}`);

  const float32 = new Float32Array(audioBuffer);
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  console.log(`[whisper] transcribe: converted to ${int16.length} int16 samples`);

  const collectedSegments: Array<{ text: string; t0: number; t1: number }> = [];

  console.log('[whisper] transcribe: calling ctx.transcribeData...');
  const { promise: nativePromise } = ctx.transcribeData(int16.buffer, {
    language: language || 'auto',
    maxLen: 0,
    temperature: 0.0,
    tdrzEnable: true,
    onNewSegments: (event: NewSegmentsEvent) => {
      console.log('[whisper] onNewSegments received:', typeof event, JSON.stringify(event));
      try {
        for (const seg of event.segments) {
          collectedSegments.push({ text: seg.text ?? '', t0: seg.t0 ?? 0, t1: seg.t1 ?? 0 });
        }
        console.log(`[whisper] onNewSegments: pushed ${event.segments.length} segment(s), total=${collectedSegments.length}`);
      } catch (err) {
        console.error('[whisper] onNewSegments push error:', err);
      }
    },
  });

  // Release the gate when the native op finishes — regardless of timeout
  nativePromise.then(releaseGate, releaseGate);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[whisper] transcribeData timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`)), TRANSCRIBE_TIMEOUT_MS),
  );

  console.log('[whisper] transcribe: awaiting promise (timeout=' + TRANSCRIBE_TIMEOUT_MS + 'ms)...');
  try {
    await Promise.race([nativePromise, timeout]);
    console.log(`[whisper] transcribe: promise resolved, collectedSegments=${collectedSegments.length}`);
  } catch (err) {
    if (collectedSegments.length > 0) {
      // The native promise didn't resolve but segments were delivered — use them.
      // The gate will release once the native op eventually finishes.
      console.warn(`[whisper] timeout but ${collectedSegments.length} segment(s) already collected — using partial result`);
    } else {
      console.error('[whisper] transcribe: no segments and timed out:', err);
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
  console.log(`[whisper] transcribe done: text="${result.text.slice(0, 80)}...", segments=${result.segments.length}`);
  return result;
}

export function transcribe(
  source: 'mic' | 'system',
  audioBuffer: ArrayBuffer,
  language: string,
): Promise<TranscribeResult> {
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

  return prevHead.then(() => doTranscribe(source, audioBuffer, language, releaseGate));
}

export async function release(): Promise<void> {
  console.log('[whisper] release called');
  micHead = Promise.resolve();
  sysHead = Promise.resolve();
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
  console.log('[whisper] release done');
}
