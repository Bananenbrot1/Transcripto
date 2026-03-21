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
  DiarizationDownloadProgress,
  MediaPermissions,
  StoreSchema,
  ShortcutAction,
  ShortcutConfig,
  SummaryResult,
} from '../shared/types';

export type {
  ModelDefinition,
  DownloadProgress,
  TranscribeResult,
  DiarizationSegment,
  DiarizationDownloadProgress,
  MediaPermissions,
  StoreSchema,
  ShortcutAction,
  ShortcutConfig,
  SummaryResult,
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
  diarize: (numSpeakers?: number) => Promise<DiarizationSegment[]>;
  storeGet: <K extends keyof StoreSchema>(key: K) => Promise<StoreSchema[K]>;
  storeSet: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => Promise<void>;
  storeGetAll: () => Promise<StoreSchema>;
  registerShortcuts: (shortcuts: ShortcutConfig) => Promise<Record<string, boolean>>;
  onShortcutAction: (callback: (action: ShortcutAction) => void) => () => void;
  encryptString: (plaintext: string) => Promise<string>;
  decryptString: (encrypted: string) => Promise<string>;
  testSummaryConnection: () => Promise<{ success: boolean; error?: string }>;
  summarize: (transcript: string, title: string) => Promise<SummaryResult>;
}
