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
  console.log('[whisper] initialize: contexts ready', { mic: !!micContext, sys: !!sysContext });
}

export async function transcribe(
  source: 'mic' | 'system',
  audioBuffer: ArrayBuffer,
  language: string,
): Promise<TranscribeResult> {
  const float32Length = audioBuffer.byteLength / 4;
  console.log(`[whisper] transcribe start: source=${source}, lang=${language}, float32Samples=${float32Length}`);

  const ctx = source === 'mic' ? micContext : sysContext;
  if (!ctx) {
    console.error('[whisper] transcribe: no context — whisper not initialized');
    throw new Error('Whisper not initialized');
  }

  const float32 = new Float32Array(audioBuffer);
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  console.log(`[whisper] transcribe: converted to ${int16.length} int16 samples`);

  const collectedSegments: Array<{ text: string; t0: number; t1: number }> = [];

  console.log('[whisper] transcribe: calling ctx.transcribeData...');
  const { promise } = ctx.transcribeData(int16.buffer, {
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

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[whisper] transcribeData timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`)), TRANSCRIBE_TIMEOUT_MS),
  );

  console.log('[whisper] transcribe: awaiting promise (timeout=' + TRANSCRIBE_TIMEOUT_MS + 'ms)...');
  try {
    await Promise.race([promise, timeout]);
    console.log(`[whisper] transcribe: promise resolved, collectedSegments=${collectedSegments.length}`);
  } catch (err) {
    console.error('[whisper] transcribe: promise rejected or timed out:', err);
    throw err;
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

export async function release(): Promise<void> {
  console.log('[whisper] release called');
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
