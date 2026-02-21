export type AudioSource = 'mic' | 'system';

export type RecordingState = 'idle' | 'recording' | 'stopping';

export interface TranscriptSegment {
  id: string;
  source: AudioSource;
  speaker: string;
  speakerId?: string;      // stable diarization speaker key (e.g. "Speaker A")
  text: string;
  timestamp: number;       // wall-clock ms when VAD emitted the segment
  speechStartMs: number;   // wall-clock ms when speech actually began (VAD segmentStartTime)
  startTime: number;       // whisper t0 (seconds within the segment's audio)
  endTime: number;         // whisper t1 (seconds within the segment's audio)
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
