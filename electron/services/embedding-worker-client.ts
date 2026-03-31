import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type {
  EmbeddingWorkerInboundMessage,
  EmbeddingWorkerOutboundMessage,
  EmbeddingWorkerResultMessage,
  EmbeddingWorkerErrorMessage,
} from '../workers/embedding-worker.js';

const WORKER_PATH = path.join(import.meta.dirname, '..', 'workers', 'embedding-worker.js');

function log(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'test') console.log(...args);
}

/**
 * Manages the lifecycle of the embedding worker thread.
 *
 * The main process creates one instance at module scope.
 * - Call start() when recording begins to spawn and initialize the worker.
 * - Call identify() to route audio segments for speaker embedding extraction.
 * - Call stop() when recording ends to release the worker.
 *
 * If the worker is not running, identify() throws so callers can apply a
 * fallback (e.g. labeling by source). Use isRunning to check first.
 */
export class EmbeddingWorkerClient {
  private worker: Worker | null = null;
  private readonly pendingResults = new Map<
    string,
    { resolve: (embedding: Float32Array) => void; reject: (err: Error) => void }
  >();

  /** True when the worker thread has been spawned and successfully initialized. */
  get isRunning(): boolean {
    return this.worker !== null;
  }

  /**
   * Spawns the worker thread and sends an init message.
   * Resolves when the worker posts { type: 'ready' }.
   *
   * If a worker is already running, it is stopped before spawning a new one.
   *
   * @throws if the worker fails to start or initialize.
   */
  async start(modelPath: string, modelId: string): Promise<void> {
    if (this.worker) {
      log('[embedding-worker-client] worker already running — stopping before restart');
      await this.stop();
    }

    log(`[embedding-worker-client] starting worker: modelId=${modelId}, modelPath=${modelPath}`);

    return new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_PATH, { stderr: true });

      let stderrOutput = '';
      worker.stderr?.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString();
      });

      const onInitMessage = (msg: EmbeddingWorkerOutboundMessage) => {
        if (msg.type === 'ready') {
          // Init succeeded — install the persistent message handler.
          worker.removeListener('message', onInitMessage);
          worker.removeListener('error', onInitError);
          this.worker = worker;
          worker.on('message', (m: EmbeddingWorkerOutboundMessage) => this.onWorkerMessage(m));
          worker.on('error', (err: Error) => this.onWorkerError(err));
          log('[embedding-worker-client] worker ready');
          resolve();
        } else if (msg.type === 'error') {
          worker.removeListener('message', onInitMessage);
          worker.removeListener('error', onInitError);
          const detail = stderrOutput ? `\n${stderrOutput.trim()}` : '';
          reject(
            new Error(
              `EmbeddingWorker initialization failed: ${(msg as EmbeddingWorkerErrorMessage).message}${detail}`,
            ),
          );
        }
      };

      const onInitError = (err: Error) => {
        worker.removeListener('message', onInitMessage);
        const detail = stderrOutput ? `\n${stderrOutput.trim()}` : '';
        reject(new Error(`EmbeddingWorker failed to start: ${err.message}${detail}`));
      };

      worker.on('message', onInitMessage);
      worker.once('error', onInitError);

      // Tell the worker which model to load.
      worker.postMessage({
        type: 'init',
        modelPath,
        modelId,
      } satisfies EmbeddingWorkerInboundMessage);
    });
  }

  /**
   * Sends a shutdown message to the worker, rejects all pending identify
   * promises, and then terminates the thread.
   *
   * Safe to call when the worker is not running.
   */
  async stop(): Promise<void> {
    if (!this.worker) return;

    log('[embedding-worker-client] stopping worker');

    // Reject any in-flight requests before the worker disappears.
    for (const [segmentId, { reject }] of this.pendingResults) {
      reject(new Error(`EmbeddingWorker stopped while segment ${segmentId} was in flight`));
    }
    this.pendingResults.clear();

    const worker = this.worker;
    this.worker = null;

    // Best-effort shutdown message; ignore errors if the worker already exited.
    try {
      worker.postMessage({ type: 'shutdown' } satisfies EmbeddingWorkerInboundMessage);
    } catch {
      // Worker may have already exited — nothing to do.
    }

    await worker.terminate();
    log('[embedding-worker-client] worker stopped');
  }

  /**
   * Sends an audio segment to the worker for speaker embedding extraction.
   * Returns a promise that resolves with the embedding Float32Array.
   *
   * Segments with the same segmentId are deduplicated: a second call with the
   * same ID while the first is in-flight will replace the pending callbacks.
   *
   * @throws if the worker is not running.
   */
  async identify(
    source: 'mic' | 'system',
    audio: Float32Array,
    segmentId: string,
  ): Promise<Float32Array> {
    if (!this.worker) {
      throw new Error('EmbeddingWorkerClient is not running. Call start() before identify().');
    }

    return new Promise((resolve, reject) => {
      this.pendingResults.set(segmentId, { resolve, reject });
      this.worker!.postMessage({
        type: 'identify',
        source,
        audio,
        segmentId,
      } satisfies EmbeddingWorkerInboundMessage);
    });
  }

  // ─── Private message handlers ───────────────────────────────────────────────

  private onWorkerMessage(msg: EmbeddingWorkerOutboundMessage): void {
    if (msg.type === 'result') {
      const result = msg as EmbeddingWorkerResultMessage;
      const pending = this.pendingResults.get(result.segmentId);
      if (pending) {
        this.pendingResults.delete(result.segmentId);
        pending.resolve(result.embedding);
      }
    } else if (msg.type === 'error') {
      const error = msg as EmbeddingWorkerErrorMessage;
      log(`[embedding-worker-client] worker reported error: ${error.message}`);
      // Reject all pending requests — a worker error is likely fatal.
      for (const [, { reject }] of this.pendingResults) {
        reject(new Error(`EmbeddingWorker error: ${error.message}`));
      }
      this.pendingResults.clear();
    }
  }

  private onWorkerError(err: Error): void {
    log(`[embedding-worker-client] unhandled worker error: ${err.message}`);
    for (const [, { reject }] of this.pendingResults) {
      reject(err);
    }
    this.pendingResults.clear();
    this.worker = null;
  }
}
