import type { DownloadProgress, TranscribeResult } from './transcription';

export interface MediaPermissions {
  mic: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
  screen: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
}

export interface ElectronAPI {
  checkModelStatus: () => Promise<{ downloaded: boolean }>;
  downloadModel: () => Promise<void>;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  initializeWhisper: () => Promise<void>;
  transcribe: (source: 'mic' | 'system', audioBuffer: ArrayBuffer) => Promise<TranscribeResult>;
  releaseWhisper: () => Promise<void>;
  getMediaPermissions: () => Promise<MediaPermissions>;
  requestMicPermission: () => Promise<boolean>;
  openScreenPermissionSettings: () => Promise<void>;
  getAppInfo: () => Promise<{ appName: string; appPath: string; isPackaged: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
