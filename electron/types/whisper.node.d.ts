declare module '@fugood/whisper.node' {
  export interface TranscribeSegment {
    text: string;
    t0: number;
    t1: number;
  }

  export interface NewSegmentsEvent {
    nNew: number;
    totalNNew: number;
    result: string;
    segments: TranscribeSegment[];
  }

  export interface WhisperContext {
    transcribeData(
      buffer: ArrayBuffer,
      options: {
        language?: string;
        maxLen?: number;
        temperature?: number;
        tdrzEnable?: boolean;
        onNewSegments?: (event: NewSegmentsEvent) => void;
      },
    ): { promise: Promise<void> };
    release(): Promise<void>;
  }

  export function initWhisper(options: { filePath: string; useGpu?: boolean }): Promise<WhisperContext>;
}
