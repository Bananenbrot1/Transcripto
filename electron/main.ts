import { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences, shell, dialog, globalShortcut, safeStorage } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as modelManager from './services/model-manager.js';
import * as whisperService from './services/whisper-service.js';
import * as parakeetService from './services/parakeet-service.js';
import * as markdownExport from './services/markdown-export.js';
import * as diarizationModelManager from './services/diarization-model-manager.js';
import * as diarizationService from './services/diarization-service.js';
import * as audioFileService from './services/audio-file-service.js';
import * as settingsStore from './services/settings-store.js';
import * as summaryService from './services/summary-service.js';
import { SpeakerRegistry } from './services/speaker-registry.js';
import type { SpeakerRegistryPersistenceDeps } from './services/speaker-registry.js';
import type { StoreSchema, ShortcutConfig, ShortcutAction, LiveSummarizeRequest, ModelEngine } from '../shared/types.js';

const __dirname = import.meta.dirname;

let activeEngine: ModelEngine | null = null;

// SpeakerRegistry is created at module scope without persistence deps so that
// IPC handlers can reference it before app.whenReady(). Persistence deps are
// configured inside app.whenReady() to avoid Electron bug #45328 (safeStorage
// is not available before the app is ready).
export const speakerRegistry = new SpeakerRegistry();

const isDev = !app.isPackaged;

function registerIpcHandlers(): void {
  ipcMain.handle('get-available-models', () => {
    return modelManager.getAvailableModels();
  });

  ipcMain.handle('check-model-status', (_event, modelId: string) => {
    return { downloaded: modelManager.isModelDownloaded(modelId) };
  });

  ipcMain.handle('check-all-model-status', () => {
    const models = modelManager.getAvailableModels();
    const result: Record<string, boolean> = {};
    for (const model of models) {
      result[model.id] = modelManager.isModelDownloaded(model.id);
    }
    return result;
  });

  ipcMain.handle('delete-model', (_event, modelId: string) => {
    modelManager.deleteModel(modelId);
  });

  ipcMain.handle('download-model', async (event, modelId: string) => {
    await modelManager.downloadModel(modelId, (progress) => {
      event.sender.send('download-progress', progress);
    });
  });

  ipcMain.handle('initialize-whisper', async (_event, modelId: string) => {
    const modelDef = modelManager.getModelDefinition(modelId);
    const modelPath = modelManager.getModelPath(modelId);

    // Release the other engine if switching
    if (activeEngine === 'whisper' && modelDef.engine === 'parakeet') {
      await whisperService.release();
    } else if (activeEngine === 'parakeet' && modelDef.engine === 'whisper') {
      await parakeetService.release();
    }

    if (modelDef.engine === 'parakeet') {
      await parakeetService.initialize(modelPath);
    } else {
      await whisperService.initialize(modelPath);
    }
    activeEngine = modelDef.engine;
  });

  ipcMain.handle('transcribe', async (_event, source: 'mic' | 'system', audioBuffer: ArrayBuffer, language: string) => {
    console.log(`[main] IPC transcribe: source=${source}, lang=${language}, engine=${activeEngine}, byteLength=${audioBuffer?.byteLength}`);
    try {
      const service = activeEngine === 'parakeet' ? parakeetService : whisperService;
      const result = await service.transcribe(source, audioBuffer, language);
      console.log(`[main] IPC transcribe done: text="${result.text.slice(0, 60)}"`);
      return result;
    } catch (err) {
      console.error('[main] IPC transcribe error:', err);
      throw err;
    }
  });

  ipcMain.handle('release-whisper', async () => {
    if (activeEngine === 'parakeet') {
      await parakeetService.release();
    } else {
      await whisperService.release();
    }
    activeEngine = null;
  });

  ipcMain.handle('get-media-permissions', () => {
    const mic = systemPreferences.getMediaAccessStatus('microphone');
    const screen = systemPreferences.getMediaAccessStatus('screen');
    return { mic, screen };
  });

  ipcMain.handle('request-mic-permission', async () => {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return granted;
  });

  ipcMain.handle('open-screen-permission-settings', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  });

  ipcMain.handle('get-app-info', () => {
    return {
      appName: app.getName(),
      appPath: app.getPath('exe'),
      isPackaged: app.isPackaged,
    };
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('save-markdown', (_event, folderPath: string, filename: string, content: string) => {
    console.log(`[main] IPC save-markdown: folder="${folderPath}", filename="${filename}", contentLen=${content.length}`);
    const result = markdownExport.saveMarkdown(folderPath, filename, content);
    console.log(`[main] IPC save-markdown result:`, result);
    return result;
  });

  ipcMain.handle('check-diarization-models', () =>
    diarizationModelManager.isDiarizationModelsDownloaded(),
  );

  ipcMain.handle('download-diarization-models', async (event) => {
    await diarizationModelManager.downloadDiarizationModels((progress) => {
      event.sender.send('diarization-download-progress', progress);
    });
  });

  ipcMain.handle('open-audio-recording', () => {
    audioFileService.openRecording();
  });

  ipcMain.on('write-audio-chunk', (_event, source: 'mic' | 'sys', samples: ArrayBuffer) => {
    audioFileService.appendChunk(source, Buffer.from(samples));
  });

  ipcMain.handle('close-audio-recording', () => {
    return audioFileService.closeRecording();
  });

  ipcMain.handle('cleanup-audio-recording', () => {
    audioFileService.cleanup();
  });

  ipcMain.handle('store-get', (_event, key: string) => {
    return settingsStore.get(key as keyof StoreSchema);
  });

  ipcMain.handle('store-set', (_event, key: string, value: unknown) => {
    settingsStore.set(key as keyof StoreSchema, value as StoreSchema[keyof StoreSchema]);
  });

  ipcMain.handle('store-get-all', () => {
    return settingsStore.getAll();
  });

  ipcMain.handle('register-shortcuts', (_event, shortcuts: ShortcutConfig) => {
    globalShortcut.unregisterAll();
    const results: Record<string, boolean> = {};
    const actions: ShortcutAction[] = ['toggleRecording', 'togglePause', 'toggleMicMute'];
    for (const action of actions) {
      const accelerator = shortcuts[action];
      if (!accelerator) {
        results[action] = true;
        continue;
      }
      try {
        const success = globalShortcut.register(accelerator, () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) win.webContents.send('shortcut-action', action);
        });
        results[action] = success;
        if (!success) {
          console.warn(`[main] Failed to register shortcut "${accelerator}" for ${action}`);
        }
      } catch (err) {
        console.warn(`[main] Error registering shortcut "${accelerator}" for ${action}:`, err);
        results[action] = false;
      }
    }
    return results;
  });

  ipcMain.handle('encrypt-string', (_event, plaintext: string) => {
    return summaryService.encryptString(plaintext);
  });

  ipcMain.handle('decrypt-string', (_event, encrypted: string) => {
    return summaryService.decryptString(encrypted);
  });

  ipcMain.handle('test-summary-connection', async () => {
    return summaryService.testConnection();
  });

  ipcMain.handle('summarize', async (_event, transcript: string, title: string) => {
    return summaryService.summarize(transcript, title);
  });

  ipcMain.handle('live-summarize', async (_event, request: LiveSummarizeRequest) => {
    return summaryService.liveSummarize(request);
  });

  ipcMain.handle('transcribe-file', async (event, audioBuffer: ArrayBuffer, language: string, totalDurationSec: number) => {
    console.log(`[main] IPC transcribe-file: lang=${language}, engine=${activeEngine}, duration=${totalDurationSec}s, byteLength=${audioBuffer?.byteLength}`);
    try {
      const service = activeEngine === 'parakeet' ? parakeetService : whisperService;
      const result = await service.transcribeFile(audioBuffer, language, totalDurationSec, (progress) => {
        event.sender.send('transcribe-file-progress', progress);
      });
      console.log(`[main] IPC transcribe-file done: segments=${result.segments.length}`);
      return result;
    } catch (err) {
      console.error('[main] IPC transcribe-file error:', err);
      throw err;
    }
  });

  ipcMain.handle('select-audio-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    return { fileName, data: fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) };
  });

  ipcMain.handle('diarize', async (event, numSpeakers: number = -1) => {
    const start = Date.now();
    const interval = setInterval(() => {
      event.sender.send('diarization-progress', { elapsedMs: Date.now() - start });
    }, 1000);
    try {
      const { micPath, sysPath } = audioFileService.getPaths();
      const raw = await diarizationService.diarizeFromFile(
        micPath,
        sysPath,
        diarizationModelManager.getSegmentationModelPath(),
        diarizationModelManager.getEmbeddingModelPath(),
        numSpeakers,
      );
      return raw.map((seg) => ({ ...seg }));
    } finally {
      clearInterval(interval);
      audioFileService.cleanup();
    }
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 670,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Programmatic source selection with audio loopback.
  // On macOS Sequoia+, the app must be added to "System Audio Recording Only"
  // in System Settings > Privacy & Security for the audio track to stay alive.
  win.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      if (!sources || sources.length === 0) {
        console.error('[Transcripto] No screen sources found');
        callback({});
        return;
      }
      callback({ video: sources[0], audio: 'loopback' });
    } catch (err) {
      console.error('[Transcripto] Failed to get screen sources:', err);
      callback({});
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

registerIpcHandlers();

app.whenReady().then(async () => {
  // Configure SpeakerRegistry persistence deps now that safeStorage is
  // available (Electron bug #45328: safeStorage must not be used before
  // app.whenReady() resolves).
  const persistenceDeps: SpeakerRegistryPersistenceDeps = {
    encryptString: (plaintext) => safeStorage.encryptString(plaintext),
    decryptString: (encrypted) => safeStorage.decryptString(encrypted),
    getUserDataPath: () => app.getPath('userData'),
    writeFile: (filePath, data) => fs.writeFileSync(filePath, data),
    readFile: (filePath) => fs.readFileSync(filePath),
    fileExists: (filePath) => fs.existsSync(filePath),
    deleteFile: (filePath) => fs.unlinkSync(filePath),
  };
  speakerRegistry.setPersistenceDeps(persistenceDeps);
  await speakerRegistry.loadPersistedSpeakers().catch((err) => {
    console.error('[main] Failed to load persisted speaker registry:', err);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  audioFileService.cleanup();
});
