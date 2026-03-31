/**
 * Unit tests for the EmbeddingWorker message-handling logic.
 *
 * We test createEmbeddingWorkerHandler directly (imported from the worker
 * module) rather than spawning a real Worker thread. This keeps the tests
 * fast, avoids native-module loading, and is consistent with how the other
 * services in this project handle testable extraction of native-backed logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEmbeddingWorkerHandler,
  type EmbeddingWorkerInboundMessage,
  type EmbeddingWorkerOutboundMessage,
} from '../workers/embedding-worker.js';
import type { SpeakerEmbeddingService } from './speaker-embedding-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockService(
  embedding: Float32Array = new Float32Array(192).fill(0.5),
  throwOnExtract?: Error,
): SpeakerEmbeddingService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    extractEmbedding: throwOnExtract
      ? vi.fn().mockRejectedValue(throwOnExtract)
      : vi.fn().mockResolvedValue(embedding),
    release: vi.fn(),
  };
}

function makeSetup(opts?: {
  service?: SpeakerEmbeddingService;
  throwOnFactory?: Error;
  onShutdown?: () => void;
}) {
  const service = opts?.service ?? makeMockService();
  const serviceFactory = opts?.throwOnFactory
    ? vi.fn(() => { throw opts.throwOnFactory; })
    : vi.fn(() => service);

  const posted: EmbeddingWorkerOutboundMessage[] = [];
  const post = vi.fn((msg: EmbeddingWorkerOutboundMessage) => { posted.push(msg); });

  const onShutdown = opts?.onShutdown ?? vi.fn();

  const handler = createEmbeddingWorkerHandler(
    serviceFactory as (modelId: string) => SpeakerEmbeddingService,
    post,
    { onShutdown },
  );

  return { handler, service, serviceFactory, post, posted, onShutdown };
}

// ---------------------------------------------------------------------------

describe('createEmbeddingWorkerHandler', () => {
  // ── init ──────────────────────────────────────────────────────────────────

  describe('{ type: "init" }', () => {
    it('posts { type: "ready" } after successful initialization', async () => {
      const { handler, posted } = makeSetup();

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });

      expect(posted).toHaveLength(1);
      expect(posted[0]).toEqual({ type: 'ready' });
    });

    it('calls serviceFactory with the provided modelId', async () => {
      const { handler, serviceFactory } = makeSetup();

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });

      expect(serviceFactory).toHaveBeenCalledWith('cam++');
    });

    it('calls service.initialize with the provided modelPath', async () => {
      const { handler, service } = makeSetup();

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });

      expect(service.initialize).toHaveBeenCalledWith('/models/campplus.onnx');
    });

    it('posts { type: "error" } when serviceFactory throws', async () => {
      const { handler, posted } = makeSetup({
        throwOnFactory: new Error('model not found'),
      });

      await handler({ type: 'init', modelPath: '/x.onnx', modelId: 'cam++' });

      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({ type: 'error', message: 'model not found' });
    });

    it('posts { type: "error" } when service.initialize rejects', async () => {
      const service = makeMockService();
      (service.initialize as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('init failed'),
      );
      const { handler, posted } = makeSetup({ service });

      await handler({ type: 'init', modelPath: '/x.onnx', modelId: 'cam++' });

      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({ type: 'error', message: 'init failed' });
    });
  });

  // ── identify ──────────────────────────────────────────────────────────────

  describe('{ type: "identify" }', () => {
    const FAKE_AUDIO = new Float32Array(16000).fill(0.1);

    it('posts { type: "result" } with the embedding for valid audio after init', async () => {
      const expectedEmbedding = new Float32Array(192).fill(0.7);
      const service = makeMockService(expectedEmbedding);
      const { handler, posted } = makeSetup({ service });

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });

      const identifyMsg: EmbeddingWorkerInboundMessage = {
        type: 'identify',
        source: 'mic',
        audio: FAKE_AUDIO,
        segmentId: 'seg-001',
      };
      await handler(identifyMsg);

      const resultMsg = posted.find((m) => m.type === 'result');
      expect(resultMsg).toBeDefined();
      expect(resultMsg).toMatchObject({
        type: 'result',
        segmentId: 'seg-001',
        source: 'mic',
        embedding: expectedEmbedding,
      });
    });

    it('preserves the source field from the identify message', async () => {
      const { handler, posted } = makeSetup();

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });
      await handler({ type: 'identify', source: 'system', audio: FAKE_AUDIO, segmentId: 'seg-sys' });

      const resultMsg = posted.find((m) => m.type === 'result');
      expect(resultMsg).toMatchObject({ source: 'system' });
    });

    it('posts { type: "error" } when identify is called before init', async () => {
      const { handler, posted } = makeSetup();

      await handler({ type: 'identify', source: 'mic', audio: FAKE_AUDIO, segmentId: 'seg-002' });

      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({
        type: 'error',
        message: expect.stringContaining('not initialized'),
      });
    });

    it('posts { type: "error" } when extractEmbedding throws', async () => {
      const service = makeMockService(new Float32Array(0), new Error('extraction failed'));
      const { handler, posted } = makeSetup({ service });

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });
      await handler({ type: 'identify', source: 'mic', audio: FAKE_AUDIO, segmentId: 'seg-003' });

      const errorMsg = posted.find((m) => m.type === 'error');
      expect(errorMsg).toMatchObject({ type: 'error', message: 'extraction failed' });
    });

    it('passes the audio to extractEmbedding', async () => {
      const service = makeMockService();
      const { handler } = makeSetup({ service });

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });
      await handler({ type: 'identify', source: 'mic', audio: FAKE_AUDIO, segmentId: 'seg-004' });

      expect(service.extractEmbedding).toHaveBeenCalledWith(FAKE_AUDIO);
    });
  });

  // ── shutdown ──────────────────────────────────────────────────────────────

  describe('{ type: "shutdown" }', () => {
    it('calls service.release() on shutdown', async () => {
      const service = makeMockService();
      const { handler } = makeSetup({ service });

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });
      await handler({ type: 'shutdown' });

      expect(service.release).toHaveBeenCalledOnce();
    });

    it('calls onShutdown callback', async () => {
      const onShutdown = vi.fn();
      const { handler } = makeSetup({ onShutdown });

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });
      await handler({ type: 'shutdown' });

      expect(onShutdown).toHaveBeenCalledOnce();
    });

    it('can be called before init without throwing', async () => {
      const { handler, onShutdown } = makeSetup();

      await expect(handler({ type: 'shutdown' })).resolves.not.toThrow();
      expect(onShutdown).toHaveBeenCalledOnce();
    });

    it('posts { type: "error" } for identify messages sent after shutdown', async () => {
      const FAKE_AUDIO = new Float32Array(16000);
      const { handler, posted } = makeSetup();

      await handler({ type: 'init', modelPath: '/models/campplus.onnx', modelId: 'cam++' });
      await handler({ type: 'shutdown' });

      const countBeforeIdentify = posted.length;
      await handler({ type: 'identify', source: 'mic', audio: FAKE_AUDIO, segmentId: 'seg-post-shutdown' });

      const newMessages = posted.slice(countBeforeIdentify);
      expect(newMessages).toHaveLength(1);
      expect(newMessages[0]).toMatchObject({
        type: 'error',
        message: expect.stringContaining('not initialized'),
      });
    });
  });
});
