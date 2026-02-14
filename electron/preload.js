const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),

  checkModelStatus: (modelId) => ipcRenderer.invoke('check-model-status', modelId),

  checkAllModelStatus: () => ipcRenderer.invoke('check-all-model-status'),

  downloadModel: (modelId) => ipcRenderer.invoke('download-model', modelId),

  onDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  initializeWhisper: (modelId) => ipcRenderer.invoke('initialize-whisper', modelId),

  transcribe: (source, audioBuffer, language) =>
    ipcRenderer.invoke('transcribe', source, audioBuffer, language),

  releaseWhisper: () => ipcRenderer.invoke('release-whisper'),

  getMediaPermissions: () => ipcRenderer.invoke('get-media-permissions'),

  requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),

  openScreenPermissionSettings: () =>
    ipcRenderer.invoke('open-screen-permission-settings'),

  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  selectExportFolder: () => ipcRenderer.invoke('select-folder'),

  saveMarkdown: (folderPath, filename, content) =>
    ipcRenderer.invoke('save-markdown', folderPath, filename, content),
});
