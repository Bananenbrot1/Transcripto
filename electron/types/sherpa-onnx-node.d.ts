declare module 'sherpa-onnx-node' {
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
