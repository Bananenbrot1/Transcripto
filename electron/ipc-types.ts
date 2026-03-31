/**
 * IPC type definitions for the Electron main/preload side.
 *
 * Shared data types are imported from shared/types.ts (included in both
 * tsconfig.json and tsconfig.electron.json) so the renderer and main process
 * always agree on type shapes.
 */
import type {
  ModelDefinition,
  DownloadProgress,
  TranscribeResult,
  DiarizationSegment,
  MergedSegment,
  DiarizationDownloadProgress,
  MediaPermissions,
  StoreSchema,
  ShortcutAction,
  ShortcutConfig,
  SummaryResult,
  FileTranscribeProgress,
  LiveSummarizeRequest,
  SpeakerAssignment,
  SpeakerProfile,
  SegmentSpeakerUpdate,
} from '../shared/types';

export type {
  ModelDefinition,
  DownloadProgress,
  TranscribeResult,
  DiarizationSegment,
  MergedSegment,
  DiarizationDownloadProgress,
  MediaPermissions,
  StoreSchema,
  ShortcutAction,
  ShortcutConfig,
  SummaryResult,
  FileTranscribeProgress,
  LiveSummarizeRequest,
  SpeakerAssignment,
  SpeakerProfile,
  SegmentSpeakerUpdate,
};

/** All methods exposed on window.electronAPI via contextBridge. */
export interface ElectronAPI {
  getAvailableModels: () => Promise<ModelDefinition[]>;
  checkModelStatus: (modelId: string) => Promise<{ downloaded: boolean }>;
  checkAllModelStatus: () => Promise<Record<string, boolean>>;
  downloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  initializeWhisper: (modelId: string) => Promise<void>;
  transcribe: (source: 'mic' | 'system', audioBuffer: ArrayBuffer, language: string) => Promise<TranscribeResult>;
  releaseWhisper: () => Promise<void>;
  getMediaPermissions: () => Promise<MediaPermissions>;
  requestMicPermission: () => Promise<boolean>;
  openScreenPermissionSettings: () => Promise<void>;
  getAppInfo: () => Promise<{ appName: string; appPath: string; isPackaged: boolean }>;
  selectExportFolder: () => Promise<string | null>;
  saveMarkdown: (folderPath: string, filename: string, content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  checkDiarizationModels: () => Promise<{ segmentation: boolean; embedding: boolean; totalSizeMB: number }>;
  downloadDiarizationModels: () => Promise<void>;
  onDiarizationDownloadProgress: (cb: (p: DiarizationDownloadProgress) => void) => () => void;
  openAudioRecording: () => Promise<void>;
  writeAudioChunk: (source: 'mic' | 'sys', samples: ArrayBuffer) => void;
  closeAudioRecording: () => Promise<void>;
  cleanupAudioRecording: () => Promise<void>;
  onDiarizationProgress: (cb: (p: { elapsedMs: number }) => void) => () => void;
  diarize: (numSpeakers?: number) => Promise<MergedSegment[]>;
  storeGet: <K extends keyof StoreSchema>(key: K) => Promise<StoreSchema[K]>;
  storeSet: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => Promise<void>;
  storeGetAll: () => Promise<StoreSchema>;
  registerShortcuts: (shortcuts: ShortcutConfig) => Promise<Record<string, boolean>>;
  onShortcutAction: (callback: (action: ShortcutAction) => void) => () => void;
  encryptString: (plaintext: string) => Promise<string>;
  decryptString: (encrypted: string) => Promise<string>;
  testSummaryConnection: () => Promise<{ success: boolean; error?: string }>;
  summarize: (transcript: string, title: string) => Promise<SummaryResult>;
  liveSummarize: (request: LiveSummarizeRequest) => Promise<SummaryResult>;
  transcribeFile: (audioBuffer: ArrayBuffer, language: string, totalDurationSec: number) => Promise<TranscribeResult>;
  onTranscribeFileProgress: (callback: (progress: FileTranscribeProgress) => void) => () => void;
  selectAudioFile: () => Promise<{ fileName: string; data: ArrayBuffer } | null>;
  /**
   * Fire-and-forget: ask the main process to run speaker embedding extraction
   * on the given audio buffer and associate results with the listed segment IDs.
   * If the embedding worker is not running, the call is silently ignored.
   *
   * @param source     Audio source ('mic' or 'system').
   * @param audioBuffer Float32 PCM at 16 kHz mono (same buffer sent to whisper).
   * @param segmentIds  One or more segment IDs that should receive the assignment.
   */
  requestEmbedding: (source: 'mic' | 'system', audioBuffer: ArrayBuffer, segmentIds: string[]) => void;
  /**
   * Subscribe to speaker assignment push events from the main process.
   * Returns an unsubscribe function.
   */
  onSpeakerAssigned: (callback: (assignments: SpeakerAssignment[]) => void) => () => void;

  // ---------------------------------------------------------------------------
  // Speaker registry management
  // ---------------------------------------------------------------------------

  /** Returns all enrolled and auto-created speakers in the registry. */
  getSpeakers: () => Promise<SpeakerProfile[]>;

  /**
   * Sets a human-readable name for a speaker, persists the change, and
   * broadcasts an onSpeakerRegistryChanged event to all renderer windows.
   */
  enrollSpeaker: (speakerId: string, name: string) => Promise<void>;

  /**
   * Merges `fromId` into `toId` using duration-weighted centroid averaging,
   * persists the result, and broadcasts onSpeakerRegistryChanged.
   */
  mergeSpeakers: (fromId: string, toId: string) => Promise<void>;

  /**
   * Removes a single speaker from the registry, persists the change, and
   * broadcasts onSpeakerRegistryChanged.
   */
  deleteSpeaker: (speakerId: string) => Promise<void>;

  /**
   * Removes all speakers from the registry and deletes the persisted file.
   * Broadcasts onSpeakerRegistryChanged.
   */
  deleteAllSpeakers: () => Promise<void>;

  /**
   * Subscribe to speaker registry change push events.
   * Fires whenever a speaker is enrolled, merged, deleted, or the registry
   * is cleared. Passes the current full speaker list as the argument.
   * Returns an unsubscribe function.
   */
  onSpeakerRegistryChanged: (callback: (speakers: SpeakerProfile[]) => void) => () => void;

  // ---------------------------------------------------------------------------
  // Per-segment speaker reassignment
  // ---------------------------------------------------------------------------

  /**
   * Reassigns the speaker for a specific transcript segment.
   *
   * The main process:
   *   1. Updates the segment's entry in the session transcript store.
   *   2. Calls mergeSpeakers(oldSpeakerId, newSpeakerId) if the segment had a
   *      different speaker assigned, persisting the embedding merge.
   *   3. Persists the registry.
   *   4. Broadcasts onSegmentSpeakerUpdated to all renderer windows.
   */
  reassignSegmentSpeaker: (segmentId: string, newSpeakerId: string) => Promise<void>;

  /**
   * Subscribe to segment speaker update push events.
   * Fires after a successful reassignSegmentSpeaker call.
   * Returns an unsubscribe function.
   */
  onSegmentSpeakerUpdated: (callback: (update: SegmentSpeakerUpdate) => void) => () => void;
}
