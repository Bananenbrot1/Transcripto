import { describe, it, expect, vi } from 'vitest';
import {
  CamPlusPlusSpeakerEmbeddingService,
  ERes2NetV2SpeakerEmbeddingService,
  createSpeakerEmbeddingService,
  SPEAKER_EMBEDDING_MODEL_IDS,
} from './speaker-embedding-service.js';
import type * as SherpaOnnxType from 'sherpa-onnx-node';

// ---------------------------------------------------------------------------
// Minimal mock of the sherpa-onnx-node SpeakerEmbeddingExtractor API
// ---------------------------------------------------------------------------

type MockOnlineStream = {
  acceptWaveform: ReturnType<typeof vi.fn>;
};

function makeMockStream(): MockOnlineStream {
  return { acceptWaveform: vi.fn() };
}

function makeMockExtractor(embedding: Float32Array): SherpaOnnxType.SpeakerEmbeddingExtractor {
  const stream = makeMockStream();
  return {
    dim: 192,
    createStream: vi.fn(() => stream as unknown as SherpaOnnxType.OnlineStream),
    isReady: vi.fn(() => true),
    compute: vi.fn(() => embedding),
  } as unknown as SherpaOnnxType.SpeakerEmbeddingExtractor;
}

function makeMockModule(
  embedding: Float32Array,
): { module: typeof import('sherpa-onnx-node'); extractor: SherpaOnnxType.SpeakerEmbeddingExtractor } {
  const extractor = makeMockExtractor(embedding);
  // Must be a real constructor (class) because the service calls `new SpeakerEmbeddingExtractor(...)`.
  // Arrow functions cannot be used with `new`.
  const ExtractorCtor = vi.fn(function MockExtractor() {
    // Return the shared extractor so callers can inspect calls on it.
    return extractor;
  });
  const module = {
    SpeakerEmbeddingExtractor: ExtractorCtor,
  } as unknown as typeof import('sherpa-onnx-node');
  return { module, extractor };
}

// ---------------------------------------------------------------------------

describe('CamPlusPlusSpeakerEmbeddingService', () => {
  const FAKE_MODEL_PATH = '/models/campplus.onnx';
  const SAMPLE_RATE = 16000;
  const fakeSamples = new Float32Array(SAMPLE_RATE); // 1 second of silence

  describe('extractEmbedding', () => {
    it('returns a non-empty Float32Array after initialization', async () => {
      const expectedEmbedding = new Float32Array(192).fill(0.5);
      const { module } = makeMockModule(expectedEmbedding);

      const service = new CamPlusPlusSpeakerEmbeddingService(() => module);
      await service.initialize(FAKE_MODEL_PATH);

      const result = await service.extractEmbedding(fakeSamples);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result).toBe(expectedEmbedding);
    });

    it('passes audio to acceptWaveform with sampleRate 16000', async () => {
      const expectedEmbedding = new Float32Array(192);
      const { module, extractor } = makeMockModule(expectedEmbedding);

      const service = new CamPlusPlusSpeakerEmbeddingService(() => module);
      await service.initialize(FAKE_MODEL_PATH);
      await service.extractEmbedding(fakeSamples);

      const stream = extractor.createStream() as unknown as MockOnlineStream;
      expect(stream.acceptWaveform).toHaveBeenCalledWith({
        sampleRate: 16000,
        samples: fakeSamples,
      });
    });
  });

  describe('before initialize()', () => {
    it('throws a descriptive error when extractEmbedding is called', async () => {
      const service = new CamPlusPlusSpeakerEmbeddingService();

      await expect(service.extractEmbedding(fakeSamples)).rejects.toThrow(
        /not initialized/i,
      );
    });
  });

  describe('release()', () => {
    it('can be called before initialize() without throwing', () => {
      const service = new CamPlusPlusSpeakerEmbeddingService();
      expect(() => service.release()).not.toThrow();
    });

    it('can be called multiple times without throwing', async () => {
      const expectedEmbedding = new Float32Array(192);
      const { module } = makeMockModule(expectedEmbedding);

      const service = new CamPlusPlusSpeakerEmbeddingService(() => module);
      await service.initialize(FAKE_MODEL_PATH);

      expect(() => {
        service.release();
        service.release();
        service.release();
      }).not.toThrow();
    });

    it('causes extractEmbedding to throw after release', async () => {
      const expectedEmbedding = new Float32Array(192);
      const { module } = makeMockModule(expectedEmbedding);

      const service = new CamPlusPlusSpeakerEmbeddingService(() => module);
      await service.initialize(FAKE_MODEL_PATH);
      service.release();

      await expect(service.extractEmbedding(fakeSamples)).rejects.toThrow(
        /not initialized/i,
      );
    });
  });

  describe('initialize()', () => {
    it('constructs SpeakerEmbeddingExtractor with the given model path', async () => {
      const expectedEmbedding = new Float32Array(192);
      const { module } = makeMockModule(expectedEmbedding);
      const ExtractorCtor = module.SpeakerEmbeddingExtractor as ReturnType<typeof vi.fn>;

      const service = new CamPlusPlusSpeakerEmbeddingService(() => module);
      await service.initialize(FAKE_MODEL_PATH);

      expect(ExtractorCtor).toHaveBeenCalledWith(
        expect.objectContaining({ model: FAKE_MODEL_PATH }),
      );
    });

    it('can be called again to re-initialize with a different model path', async () => {
      const expectedEmbedding = new Float32Array(192);
      const { module } = makeMockModule(expectedEmbedding);
      const ExtractorCtor = module.SpeakerEmbeddingExtractor as ReturnType<typeof vi.fn>;

      const service = new CamPlusPlusSpeakerEmbeddingService(() => module);
      await service.initialize(FAKE_MODEL_PATH);
      await service.initialize('/models/other.onnx');

      expect(ExtractorCtor).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// ERes2NetV2SpeakerEmbeddingService
// ---------------------------------------------------------------------------

describe('ERes2NetV2SpeakerEmbeddingService', () => {
  const FAKE_MODEL_PATH = '/models/eres2netv2.onnx';
  const SAMPLE_RATE = 16000;
  const fakeSamples = new Float32Array(SAMPLE_RATE); // 1 second of silence

  it('returns a non-empty Float32Array after initialization', async () => {
    const expectedEmbedding = new Float32Array(256).fill(0.3);
    const { module } = makeMockModule(expectedEmbedding);

    const service = new ERes2NetV2SpeakerEmbeddingService(() => module);
    await service.initialize(FAKE_MODEL_PATH);

    const result = await service.extractEmbedding(fakeSamples);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toBe(expectedEmbedding);
  });

  it('throws a descriptive error when extractEmbedding is called before initialize()', async () => {
    const service = new ERes2NetV2SpeakerEmbeddingService();

    await expect(service.extractEmbedding(fakeSamples)).rejects.toThrow(
      /not initialized/i,
    );
  });

  it('can be released multiple times without throwing', async () => {
    const { module } = makeMockModule(new Float32Array(256));
    const service = new ERes2NetV2SpeakerEmbeddingService(() => module);
    await service.initialize(FAKE_MODEL_PATH);

    expect(() => {
      service.release();
      service.release();
    }).not.toThrow();
  });

  it('constructs SpeakerEmbeddingExtractor with the given model path', async () => {
    const { module } = makeMockModule(new Float32Array(256));
    const ExtractorCtor = module.SpeakerEmbeddingExtractor as ReturnType<typeof vi.fn>;

    const service = new ERes2NetV2SpeakerEmbeddingService(() => module);
    await service.initialize(FAKE_MODEL_PATH);

    expect(ExtractorCtor).toHaveBeenCalledWith(
      expect.objectContaining({ model: FAKE_MODEL_PATH }),
    );
  });
});

// ---------------------------------------------------------------------------
// createSpeakerEmbeddingService factory
// ---------------------------------------------------------------------------

describe('createSpeakerEmbeddingService', () => {
  it('returns a CamPlusPlusSpeakerEmbeddingService for the cam++ identifier', () => {
    const service = createSpeakerEmbeddingService(SPEAKER_EMBEDDING_MODEL_IDS.CAM_PLUS_PLUS);
    expect(service).toBeInstanceOf(CamPlusPlusSpeakerEmbeddingService);
  });

  it('returns an ERes2NetV2SpeakerEmbeddingService for the eres2netv2 identifier', () => {
    const service = createSpeakerEmbeddingService(SPEAKER_EMBEDDING_MODEL_IDS.ERES2NETV2);
    expect(service).toBeInstanceOf(ERes2NetV2SpeakerEmbeddingService);
  });

  it('throws a descriptive error for an unknown model identifier', () => {
    expect(() => createSpeakerEmbeddingService('unknown-model')).toThrow(
      /unknown speaker embedding model identifier.*unknown-model/i,
    );
  });

  it('forwards the moduleFactory to the created service', async () => {
    const expectedEmbedding = new Float32Array(192).fill(0.7);
    const { module, extractor } = makeMockModule(expectedEmbedding);

    const service = createSpeakerEmbeddingService(
      SPEAKER_EMBEDDING_MODEL_IDS.CAM_PLUS_PLUS,
      () => module,
    );
    await service.initialize('/models/campplus.onnx');
    const result = await service.extractEmbedding(new Float32Array(16000));

    expect(result).toBe(expectedEmbedding);
    expect(extractor.compute).toHaveBeenCalledTimes(1);
  });
});
