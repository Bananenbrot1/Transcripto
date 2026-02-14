import type { DownloadProgress, ModelDefinition, TranscribeResult } from './transcription';

export interface MediaPermissions {
  mic: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
  screen: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
}

export interface ElectronAPI {
  getAvailableModels: () => Promise<ModelDefinition[]>;
  checkModelStatus: (modelId: string) => Promise<{ downloaded: boolean }>;
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
