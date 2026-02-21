export type AudioSource = 'mic' | 'system';

export type RecordingState = 'idle' | 'recording' | 'stopping';

export interface TranscriptSegment {
  id: string;
  source: AudioSource;
  speaker: string;
  speakerId?: string;  // stable diarization speaker key (e.g. "Speaker A")
  text: string;
  timestamp: number;
  startTime: number;
  endTime: number;
}

export interface DiarizationSegment {
  speaker: string;   // e.g. "Speaker A"
  start: number;     // seconds from recording start
  end: number;       // seconds from recording start
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
    speakerTurn?: boolean;
  }>;
}

export interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}
