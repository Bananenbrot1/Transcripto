import { createRequire } from 'node:module';
import type * as SherpaOnnxType from 'sherpa-onnx-node';

const _require = createRequire(import.meta.url);

// Lazy-loaded on first initialize() call so a load failure doesn't crash the
// main process at startup and break unrelated features (e.g. transcription).
type SherpaOnnxModule = typeof SherpaOnnxType;

function log(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'test') console.log(...args);
}

/**
 * Stable interface for speaker embedding extraction.
 * Concrete implementations are swappable (e.g. CAM++ vs ERes2NetV2)
 * without changing callers.
 */
export interface SpeakerEmbeddingService {
  /**
   * Loads the underlying model from disk. Must be called before
   * extractEmbedding(). Calling initialize() again on an already-initialized
   * instance re-initializes with the new model path.
   */
  initialize(modelPath: string): Promise<void>;

  /**
   * Extracts a speaker embedding from a mono Float32Array audio segment
   * resampled to 16 kHz (the same format whisper.node expects).
   *
   * @throws if called before initialize().
   */
  extractEmbedding(audio: Float32Array): Promise<Float32Array>;

  /**
   * Frees the underlying native handle to prevent memory leaks.
   * Safe to call multiple times.
   */
  release(): void;
}

/**
 * SpeakerEmbeddingService implementation backed by the CAM++ model
 * (3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx) via
 * SpeakerEmbeddingExtractor from sherpa-onnx-node.
 *
 * Accepts an optional moduleFactory in the constructor so unit tests can
 * inject a mock without intercepting the native createRequire call.
 */
export class CamPlusPlusSpeakerEmbeddingService implements SpeakerEmbeddingService {
  private readonly moduleFactory: () => SherpaOnnxModule;
  private extractor: SherpaOnnxType.SpeakerEmbeddingExtractor | null = null;

  constructor(moduleFactory?: () => SherpaOnnxModule) {
    this.moduleFactory = moduleFactory ?? (() => _require('sherpa-onnx-node') as SherpaOnnxModule);
  }

  async initialize(modelPath: string): Promise<void> {
    const sherpaOnnx = this.moduleFactory();
    this.extractor = new sherpaOnnx.SpeakerEmbeddingExtractor({
      model: modelPath,
      numThreads: 1,
      debug: false,
    });
    log(`[speaker-embedding] CAM++ extractor initialized, dim=${this.extractor.dim}`);
  }

  async extractEmbedding(audio: Float32Array): Promise<Float32Array> {
    if (!this.extractor) {
      throw new Error(
        'SpeakerEmbeddingService is not initialized. Call initialize() first.',
      );
    }
    const stream = this.extractor.createStream();
    stream.acceptWaveform({ sampleRate: 16000, samples: audio });
    return this.extractor.compute(stream);
  }

  release(): void {
    // Null the reference so the native handle can be garbage-collected.
    // Idempotent: safe to call multiple times.
    this.extractor = null;
  }
}
