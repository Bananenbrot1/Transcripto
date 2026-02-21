import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),

  checkModelStatus: (modelId: string) => ipcRenderer.invoke('check-model-status', modelId),

  checkAllModelStatus: () => ipcRenderer.invoke('check-all-model-status'),

  downloadModel: (modelId: string) => ipcRenderer.invoke('download-model', modelId),

  onDownloadProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  initializeWhisper: (modelId: string) => ipcRenderer.invoke('initialize-whisper', modelId),

  transcribe: (source: string, audioBuffer: ArrayBuffer, language: string) =>
    ipcRenderer.invoke('transcribe', source, audioBuffer, language),

  releaseWhisper: () => ipcRenderer.invoke('release-whisper'),

  getMediaPermissions: () => ipcRenderer.invoke('get-media-permissions'),

  requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),

  openScreenPermissionSettings: () => ipcRenderer.invoke('open-screen-permission-settings'),

  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  selectExportFolder: () => ipcRenderer.invoke('select-folder'),

  saveMarkdown: (folderPath: string, filename: string, content: string) =>
    ipcRenderer.invoke('save-markdown', folderPath, filename, content),

  checkDiarizationModels: () => ipcRenderer.invoke('check-diarization-models'),

  downloadDiarizationModels: () => ipcRenderer.invoke('download-diarization-models'),

  onDiarizationDownloadProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
    ipcRenderer.on('diarization-download-progress', handler);
    return () => ipcRenderer.removeListener('diarization-download-progress', handler);
  },

  initializeDiarization: () => ipcRenderer.invoke('initialize-diarization'),

  diarize: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('diarize', audioBuffer),
});
