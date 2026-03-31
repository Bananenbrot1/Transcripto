import { parentPort } from 'node:worker_threads';
import {
  createSpeakerEmbeddingService,
  type SpeakerEmbeddingService,
} from '../services/speaker-embedding-service.js';

// ─── Inbound message types ────────────────────────────────────────────────────

export interface EmbeddingWorkerInitMessage {
  type: 'init';
  modelPath: string;
  modelId: string;
}

export interface EmbeddingWorkerIdentifyMessage {
  type: 'identify';
  source: 'mic' | 'system';
  audio: Float32Array;
  segmentId: string;
}

export interface EmbeddingWorkerShutdownMessage {
  type: 'shutdown';
}

export type EmbeddingWorkerInboundMessage =
  | EmbeddingWorkerInitMessage
  | EmbeddingWorkerIdentifyMessage
  | EmbeddingWorkerShutdownMessage;

// ─── Outbound message types ───────────────────────────────────────────────────

export interface EmbeddingWorkerReadyMessage {
  type: 'ready';
}

export interface EmbeddingWorkerResultMessage {
  type: 'result';
  segmentId: string;
  embedding: Float32Array;
  source: 'mic' | 'system';
}

export interface EmbeddingWorkerErrorMessage {
  type: 'error';
  message: string;
}

export type EmbeddingWorkerOutboundMessage =
  | EmbeddingWorkerReadyMessage
  | EmbeddingWorkerResultMessage
  | EmbeddingWorkerErrorMessage;

// ─── Testable handler factory ─────────────────────────────────────────────────

export interface EmbeddingWorkerHandlerOptions {
  /**
   * Called when the worker receives a { type: 'shutdown' } message.
   * Production code uses this to drain the event loop and exit the thread.
   */
  onShutdown?: () => void;
}

/**
 * Creates the stateful message handler for the embedding worker.
 *
 * Extracted from the worker entry point so the logic can be unit-tested
 * without spawning a real Worker thread. Production code wires this to
 * parentPort; tests inject a mock post function and a mock serviceFactory.
 *
 * @param serviceFactory - Creates a SpeakerEmbeddingService for the given
 *   model identifier. Injected so tests can supply a mock.
 * @param post           - Sends a message back to the parent. Injected so
 *   tests can capture outbound messages.
 * @param opts           - Optional lifecycle hooks.
 */
export function createEmbeddingWorkerHandler(
  serviceFactory: (modelId: string) => SpeakerEmbeddingService,
  post: (msg: EmbeddingWorkerOutboundMessage) => void,
  opts: EmbeddingWorkerHandlerOptions = {},
): (msg: EmbeddingWorkerInboundMessage) => Promise<void> {
  let service: SpeakerEmbeddingService | null = null;

  return async function handleMessage(msg: EmbeddingWorkerInboundMessage): Promise<void> {
    switch (msg.type) {
      case 'init': {
        try {
          service = serviceFactory(msg.modelId);
          await service.initialize(msg.modelPath);
          post({ type: 'ready' });
        } catch (err) {
          post({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case 'identify': {
        if (!service) {
          post({
            type: 'error',
            message:
              "EmbeddingWorker is not initialized. Send { type: 'init' } before sending identify messages.",
          });
          return;
        }
        try {
          const embedding = await service.extractEmbedding(msg.audio);
          post({
            type: 'result',
            segmentId: msg.segmentId,
            embedding,
            source: msg.source,
          });
        } catch (err) {
          post({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case 'shutdown': {
        service?.release();
        service = null;
        opts.onShutdown?.();
        break;
      }
    }
  };
}

// ─── Worker entry point ───────────────────────────────────────────────────────
// Only runs when this file is executed as a Worker thread (parentPort != null).

if (parentPort) {
  const handler = createEmbeddingWorkerHandler(
    (modelId) => createSpeakerEmbeddingService(modelId),
    (msg) => parentPort!.postMessage(msg),
    {
      onShutdown: () => {
        // Remove the message listener so the event loop drains and the
        // thread exits naturally without needing process.exit().
        parentPort!.removeAllListeners('message');
      },
    },
  );

  parentPort.on('message', (msg: EmbeddingWorkerInboundMessage) => {
    handler(msg).catch((err: unknown) => {
      parentPort!.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      } as EmbeddingWorkerErrorMessage);
    });
  });

  // Catch synchronous throws that escape the message handler (e.g. native
  // module load failures during init).
  process.on('uncaughtException', (err) => {
    parentPort!.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } as EmbeddingWorkerErrorMessage);
    process.exit(1);
  });
}
