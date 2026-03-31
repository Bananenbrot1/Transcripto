/**
 * Shared type definitions used by both the Electron main process and the
 * renderer (React) process. This file is included in both tsconfig.json and
 * tsconfig.electron.json so that types stay in sync across the IPC boundary.
 */

export type AudioSource = 'mic' | 'system' | 'file';

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

/**
 * A diarization segment enriched with source and cross-stream reconciliation
 * metadata. Produced by CrossStreamReconciler.mergeStreamResults.
 */
export interface MergedSegment extends DiarizationSegment {
  /** Which audio capture stream this segment originated from. */
  source: 'mic' | 'system';
  /**
   * True when this segment has been suppressed as cross-stream echo.
   * Suppressed segments are retained in the data but hidden in the UI by default.
   */
  suppressed: boolean;
  /** Human-readable reason for suppression; only present when suppressed is true. */
  reason?: 'cross-stream-echo';
  /**
   * True when this segment is flagged as a potential cross-stream match
   * (similarity between flagThreshold and suppressThreshold).
   */
  flagged: boolean;
}

export type ModelEngine = 'whisper' | 'parakeet';

export interface ModelDefinition {
  id: string;
  fileName: string;
  sizeMB: number;
  label: string;
  sha256?: string;
  engine: ModelEngine;
  supportedLanguages?: string[];
}

export interface ModelStatus {
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  /** @deprecated Use modelReady instead */
  whisperReady: boolean;
  modelReady: boolean;
}

export interface TranscribeSegment {
  text: string;
  t0: number;
  t1: number;
  speakerTurn?: boolean;
}

export interface TranscribeResult {
  text: string;
  segments: TranscribeSegment[];
}

export interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}

export interface DiarizationDownloadProgress extends DownloadProgress {
  phase: 'segmentation' | 'embedding' | 'extracting';
}

/**
 * Metadata for a speaker embedding model available for download/selection.
 */
export interface EmbeddingModelInfo {
  /** Canonical model identifier, e.g. 'cam++' or 'eres2netv2'. */
  id: string;
  /** Human-readable name displayed in settings UI. */
  displayName: string;
  /** Remote URL for downloading the .onnx file. */
  downloadUrl: string;
  /** Expected file size in megabytes (used for progress display). */
  fileSizeMB: number;
  /** Local file name stored under the diarization models directory. */
  fileName: string;
}

/**
 * Progress event emitted during a per-model embedding download.
 * Carried on the existing diarization download progress IPC channel.
 */
export interface EmbeddingModelDownloadProgress {
  modelId: string;
  bytesReceived: number;
  totalBytes: number;
}

export interface MediaPermissions {
  mic: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
  screen: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
}

export interface SummaryResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface FileTranscribeProgress {
  segmentsCompleted: number;
  durationProcessedSec: number;
  totalDurationSec: number;
  newSegments: TranscribeSegment[];
}

/**
 * Speaker identity assignment returned from the embedding pipeline.
 * Sent from the main process to the renderer via the 'speaker-assigned' IPC push event.
 */
export interface SpeakerAssignment {
  /** The TranscriptSegment id this assignment applies to. */
  segmentId: string;
  /** Stable registry identifier for the speaker (e.g. a UUID). */
  speakerId: string;
  /** Human-readable label (e.g. 'Speaker A' or an enrolled name). */
  speakerLabel: string;
  /** Cosine-similarity confidence in [0, 1]. */
  confidence: number;
  /** Audio source that produced this segment. */
  source: 'mic' | 'system';
}

export interface LiveSummarizeRequest {
  previousSummary: string;
  corrections: string[];
  recentSegments: { speaker: string; text: string; timestamp: number }[];
  formatTemplate: string;
  isFinal?: boolean;
}

export type LiveSummaryGenerationStatus = 'idle' | 'generating' | 'error';

export type ShortcutAction = 'toggleRecording' | 'togglePause' | 'toggleMicMute';

export interface ShortcutConfig {
  toggleRecording: string | null;
  togglePause: string | null;
  toggleMicMute: string | null;
}

export interface StoreSchema {
  model: string;
  language: string;
  speakerEmbeddingModel: string;
  onboardingComplete: boolean;
  darkMode: boolean | null; // null = follow system
  export: {
    folder: string;
    filenameTemplate: string;
    bodyTemplate: string;
  };
  summary: {
    apiBaseUrl: string;
    apiKey: string;       // encrypted via safeStorage
    modelId: string;
    promptTemplate: string;
  };
  vad: {
    silenceThreshold: number;
    silenceDurationMs: number;
    maxSegmentMs: number;
    minSegmentMs: number;
  };
  shortcuts: ShortcutConfig;
  liveSummary: {
    enabled: boolean;
    intervalSeconds: number;
    formatTemplate: string;
    splitPosition: number;
  };
}
