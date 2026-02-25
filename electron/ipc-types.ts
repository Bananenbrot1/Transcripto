/**
 * IPC type definitions for the Electron main/preload side.
 *
 * This file defines the ElectronAPI interface that preload.ts must satisfy.
 * It mirrors src/types/electron-api.d.ts which is the renderer-side view.
 * When adding or changing IPC channels, update BOTH files.
 *
 * Types that match src/types/transcription.ts are duplicated here so this
 * file can be compiled in isolation under tsconfig.electron.json.
 */

export interface ModelDefinition {
  id: string;
  fileName: string;
  sizeMB: number;
  label: string;
  sha256?: string;
}

export interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
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

export interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
}

export interface DiarizationDownloadProgress {
  phase: 'segmentation' | 'embedding' | 'extracting';
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}

export interface MediaPermissions {
  mic: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
  screen: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
}

/** All methods exposed on window.electronAPI via contextBridge. */
export interface ElectronAPI {
  getAvailableModels: () => Promise<ModelDefinition[]>;
  checkModelStatus: (modelId: string) => Promise<{ downloaded: boolean }>;
  checkAllModelStatus: () => Promise<Record<string, boolean>>;
  downloadModel: (modelId: string) => Promise<void>;
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
}
