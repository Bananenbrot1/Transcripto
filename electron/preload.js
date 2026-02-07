const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkModelStatus: () => ipcRenderer.invoke('check-model-status'),

  downloadModel: () => ipcRenderer.invoke('download-model'),

  onDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  initializeWhisper: () => ipcRenderer.invoke('initialize-whisper'),

  transcribe: (source, audioBuffer) =>
    ipcRenderer.invoke('transcribe', source, audioBuffer),

  releaseWhisper: () => ipcRenderer.invoke('release-whisper'),

  getMediaPermissions: () => ipcRenderer.invoke('get-media-permissions'),

  requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),

  openScreenPermissionSettings: () =>
    ipcRenderer.invoke('open-screen-permission-settings'),

  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
});
