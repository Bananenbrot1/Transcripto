declare module 'sherpa-onnx-node' {
  // --- Online Stream (shared by SpeakerEmbeddingExtractor and OnlineRecognizer) ---

  export class OnlineStream {
    acceptWaveform(config: { sampleRate: number; samples: Float32Array }): void;
  }

  // --- Speaker Embedding ---

  export interface SpeakerEmbeddingExtractorConfig {
    model: string;
    numThreads?: number;
    /** Accept boolean or numeric (0/1) for compatibility with the native addon. */
    debug?: boolean | number;
    provider?: string;
  }

  /**
   * Extracts fixed-dimension speaker embeddings from streaming audio.
   *
   * Typical usage:
   *   const extractor = new SpeakerEmbeddingExtractor({ model: '/path/to/model.onnx' });
   *   const stream = extractor.createStream();
   *   stream.acceptWaveform({ sampleRate: 16000, samples });
   *   const embedding = extractor.compute(stream);  // Float32Array of length extractor.dim
   */
  export class SpeakerEmbeddingExtractor {
    constructor(config: SpeakerEmbeddingExtractorConfig);
    /** Dimensionality of the produced embedding vector (e.g. 192 for CAM++). */
    readonly dim: number;
    createStream(): OnlineStream;
    isReady(stream: OnlineStream): boolean;
    compute(stream: OnlineStream, enableExternalBuffer?: boolean): Float32Array;
  }

  export interface SpeakerEmbeddingEntry {
    name: string;
    v: Float32Array;
  }

  export interface SpeakerEmbeddingManagerSearchObj {
    v: Float32Array;
    threshold: number;
  }

  export interface SpeakerEmbeddingManagerVerifyObj {
    name: string;
    v: Float32Array;
    threshold: number;
  }

  export class SpeakerEmbeddingManager {
    constructor(dim: number);
    readonly dim: number;
    add(obj: SpeakerEmbeddingEntry): boolean;
    addMulti(obj: { name: string; v: Float32Array[] }): boolean;
    remove(name: string): boolean;
    search(obj: SpeakerEmbeddingManagerSearchObj): string;
    verify(obj: SpeakerEmbeddingManagerVerifyObj): boolean;
    contains(name: string): boolean;
    getNumSpeakers(): number;
    getAllSpeakerNames(): string[];
  }

  // --- Speaker Diarization ---

  export interface DiarizationResult {
    speaker: number;
    start: number;
    end: number;
  }

  export interface OfflineSpeakerDiarizationConfig {
    segmentation: {
      pyannote: { model: string };
    };
    embedding: {
      model: string;
    };
    clustering: {
      numClusters: number;
      threshold: number;
    };
    minDurationOn?: number;
    minDurationOff?: number;
  }

  export class OfflineSpeakerDiarization {
    constructor(config: OfflineSpeakerDiarizationConfig);
    readonly sampleRate: number;
    process(samples: Float32Array): DiarizationResult[];
  }

  // --- Offline Speech Recognition ---

  export interface OfflineTransducerModelConfig {
    encoder: string;
    decoder: string;
    joiner: string;
  }

  export interface OfflineModelConfig {
    transducer: OfflineTransducerModelConfig;
    tokens: string;
    numThreads?: number;
    provider?: string;
    debug?: number;
    modelType?: string;
  }

  export interface OfflineFeatConfig {
    sampleRate?: number;
    featureDim?: number;
  }

  export interface OfflineRecognizerConfig {
    featConfig?: OfflineFeatConfig;
    modelConfig: OfflineModelConfig;
    decodingMethod?: string;
    maxActivePaths?: number;
  }

  export interface OfflineRecognizerResult {
    text: string;
    timestamps?: number[];
    tokens?: string[];
  }

  export class OfflineStream {
    acceptWaveform(config: { sampleRate: number; samples: Float32Array }): void;
  }

  export class OfflineRecognizer {
    constructor(config: OfflineRecognizerConfig);
    createStream(): OfflineStream;
    decode(stream: OfflineStream): void;
    getResult(stream: OfflineStream): OfflineRecognizerResult;
  }
}
