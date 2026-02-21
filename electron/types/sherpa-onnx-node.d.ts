declare module 'sherpa-onnx-node' {
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
}
