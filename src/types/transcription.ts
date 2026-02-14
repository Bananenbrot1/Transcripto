export type AudioSource = 'mic' | 'system';

export type RecordingState = 'idle' | 'recording' | 'stopping';

export interface TranscriptSegment {
  id: string;
  source: AudioSource;
  text: string;
  timestamp: number;
  startTime: number;
  endTime: number;
}

export interface ModelDefinition {
  id: string;
  fileName: string;
  sizeMB: number;
  label: string;
}

export interface ModelStatus {
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  whisperReady: boolean;
}

export interface TranscribeResult {
  text: string;
  segments: Array<{
    text: string;
    t0: number;
    t1: number;
  }>;
}

export interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}
