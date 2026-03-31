// Re-export shared types so existing renderer imports continue to work.
export type {
  AudioSource,
  RecordingState,
  TranscriptSegment,
  DiarizationSegment,
  MergedSegment,
  ModelDefinition,
  ModelStatus,
  TranscribeResult,
  DownloadProgress,
  FileTranscribeProgress,
} from '../../shared/types';
