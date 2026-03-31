import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, DownloadProgress, DiarizationDownloadProgress, FileTranscribeProgress, ShortcutAction, ShortcutConfig, LiveSummarizeRequest, SpeakerAssignment } from './ipc-types';

// Typed against ElectronAPI so the compiler verifies method presence and signatures.
const api: ElectronAPI = {
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),

  checkModelStatus: (modelId: string) => ipcRenderer.invoke('check-model-status', modelId),

  checkAllModelStatus: () => ipcRenderer.invoke('check-all-model-status'),

  downloadModel: (modelId: string) => ipcRenderer.invoke('download-model', modelId),

  deleteModel: (modelId: string) => ipcRenderer.invoke('delete-model', modelId),

  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DownloadProgress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  initializeWhisper: (modelId: string) => ipcRenderer.invoke('initialize-whisper', modelId),

  transcribe: (source: 'mic' | 'system', audioBuffer: ArrayBuffer, language: string) =>
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

  onDiarizationDownloadProgress: (callback: (progress: DiarizationDownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DiarizationDownloadProgress) => callback(progress);
    ipcRenderer.on('diarization-download-progress', handler);
    return () => ipcRenderer.removeListener('diarization-download-progress', handler);
  },

  openAudioRecording: () => ipcRenderer.invoke('open-audio-recording'),

  writeAudioChunk: (source: 'mic' | 'sys', samples: ArrayBuffer) =>
    ipcRenderer.send('write-audio-chunk', source, samples),

  closeAudioRecording: () => ipcRenderer.invoke('close-audio-recording'),

  cleanupAudioRecording: () => ipcRenderer.invoke('cleanup-audio-recording'),

  onDiarizationProgress: (callback: (p: { elapsedMs: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, p: { elapsedMs: number }) => callback(p);
    ipcRenderer.on('diarization-progress', handler);
    return () => ipcRenderer.removeListener('diarization-progress', handler);
  },

  diarize: (numSpeakers?: number) => ipcRenderer.invoke('diarize', numSpeakers),

  storeGet: (key: string) => ipcRenderer.invoke('store-get', key),
  storeSet: (key: string, value: unknown) => ipcRenderer.invoke('store-set', key, value),
  storeGetAll: () => ipcRenderer.invoke('store-get-all'),

  registerShortcuts: (shortcuts: ShortcutConfig) => ipcRenderer.invoke('register-shortcuts', shortcuts),
  onShortcutAction: (callback: (action: ShortcutAction) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: ShortcutAction) => callback(action);
    ipcRenderer.on('shortcut-action', handler);
    return () => ipcRenderer.removeListener('shortcut-action', handler);
  },

  encryptString: (plaintext: string) => ipcRenderer.invoke('encrypt-string', plaintext),
  decryptString: (encrypted: string) => ipcRenderer.invoke('decrypt-string', encrypted),
  testSummaryConnection: () => ipcRenderer.invoke('test-summary-connection'),
  summarize: (transcript: string, title: string) => ipcRenderer.invoke('summarize', transcript, title),
  liveSummarize: (request: LiveSummarizeRequest) => ipcRenderer.invoke('live-summarize', request),

  transcribeFile: (audioBuffer: ArrayBuffer, language: string, totalDurationSec: number) =>
    ipcRenderer.invoke('transcribe-file', audioBuffer, language, totalDurationSec),

  onTranscribeFileProgress: (callback: (progress: FileTranscribeProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: FileTranscribeProgress) => callback(progress);
    ipcRenderer.on('transcribe-file-progress', handler);
    return () => ipcRenderer.removeListener('transcribe-file-progress', handler);
  },

  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),

  requestEmbedding: (source: 'mic' | 'system', audioBuffer: ArrayBuffer, segmentIds: string[]) =>
    ipcRenderer.send('request-embedding', source, audioBuffer, segmentIds),

  onSpeakerAssigned: (callback: (assignments: SpeakerAssignment[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, assignments: SpeakerAssignment[]) =>
      callback(assignments);
    ipcRenderer.on('speaker-assigned', handler);
    return () => ipcRenderer.removeListener('speaker-assigned', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
