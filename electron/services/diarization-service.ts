import type * as SherpaOnnxType from 'sherpa-onnx-node';

// Lazy-loaded on first initialize() call so a load failure doesn't crash the
// main process at startup and break unrelated features (e.g. transcription).
type SherpaOnnxModule = typeof SherpaOnnxType;
let sherpaOnnx: SherpaOnnxModule | null = null;
let diarizer: SherpaOnnxType.OfflineSpeakerDiarization | null = null;

export interface DiarizedSegment {
  speaker: string;
  start: number;
  end: number;
}

export function initialize(segmentationModelPath: string, embeddingModelPath: string): void {
  // Already initialized — skip the expensive model reload.
  if (diarizer) return;

  if (!sherpaOnnx) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sherpaOnnx = require('sherpa-onnx-node') as SherpaOnnxModule;
  }

  diarizer = new sherpaOnnx.OfflineSpeakerDiarization({
    segmentation: {
      pyannote: { model: segmentationModelPath },
    },
    embedding: {
      model: embeddingModelPath,
    },
    clustering: {
      numClusters: -1,   // auto-detect speaker count
      threshold: 0.5,
    },
    minDurationOn: 0.2,
    minDurationOff: 0.5,
  });
}

export async function diarize(audioBuffer: ArrayBuffer): Promise<DiarizedSegment[]> {
  if (!diarizer) throw new Error('Diarization not initialized');

  const float32 = new Float32Array(audioBuffer);
  const segments = await Promise.resolve(diarizer.process(float32));

  return segments.map((seg) => ({
    speaker: `Speaker ${String.fromCharCode(65 + seg.speaker)}`, // 0→A, 1→B, …
    start: seg.start,
    end: seg.end,
  }));
}

export function release(): void {
  diarizer = null;
}
