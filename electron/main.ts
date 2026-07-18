import { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences, shell, dialog, globalShortcut } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as modelManager from './services/model-manager.js';
import * as whisperService from './services/whisper-service.js';
import * as parakeetService from './services/parakeet-service.js';
import * as markdownExport from './services/markdown-export.js';
import * as diarizationModelManager from './services/diarization-model-manager.js';
import * as diarizationService from './services/diarization-service.js';
import * as audioFileService from './services/audio-file-service.js';
import * as settingsStore from './services/settings-store.js';
import * as summaryService from './services/summary-service.js';
import * as llmService from './services/llm-service.js';
import * as llmModelManager from './services/llm-model-manager.js';
import * as correctionService from './services/correction-service.js';
import * as cryptoUtils from './services/crypto-utils.js';
import * as videoExtractService from './services/video-extract-service.js';
import * as updateService from './services/update-service.js';
import type { StoreSchema, ShortcutConfig, ShortcutAction, LiveSummarizeRequest, ModelEngine, Provider, TranscribeRegionRequest, TranscribeRegionResult } from '../shared/types.js';

const __dirname = import.meta.dirname;

let activeEngine: ModelEngine | null = null;
let mainWindow: BrowserWindow | null = null;
/** When true, window close / app quit proceeds without asking the renderer. */
let allowClose = false;
/** Distinguishes Cmd+Q (quit) from the window close button. */
let quitRequested = false;

const isDev = !app.isPackaged;

function isActiveEngineBusy(): boolean {
  if (activeEngine === 'parakeet') return parakeetService.isBusy();
  if (activeEngine === 'whisper') return whisperService.isBusy();
  return false;
}

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
    if (isActiveEngineBusy()) {
      throw new Error('Cannot switch models while transcription is in progress');
    }
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
    if (isActiveEngineBusy()) {
      throw new Error('Cannot release STT engine while transcription is in progress');
    }
    if (activeEngine === 'parakeet') {
      await parakeetService.release();
    } else {
      await whisperService.release();
    }
    activeEngine = null;
  });

  ipcMain.handle('proceed-close', () => {
    allowClose = true;
    if (quitRequested) {
      app.quit();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
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

  ipcMain.handle('trigger-screen-capture-registration', async () => {
    await desktopCapturer.getSources({ types: ['screen'] });
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
    return cryptoUtils.encryptString(plaintext);
  });

  ipcMain.handle('decrypt-string', (_event, encrypted: string) => {
    return cryptoUtils.decryptString(encrypted);
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
        { name: 'Audio & Video Files', extensions: [
          'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac',
          'mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv',
        ]},
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);

    if (videoExtractService.isVideoFile(filePath)) {
      const tempWavPath = await videoExtractService.extractAudio(filePath);
      return { fileName, tempWavPath, isVideo: true as const };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const data = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
    return { fileName, data, isVideo: false as const };
  });

  ipcMain.handle('transcribe-video-file', async (event, tempWavPath: string, language: string) => {
    console.log(`[main] IPC transcribe-video-file: lang=${language}, engine=${activeEngine}, path=${tempWavPath}`);
    try {
      const fileBuffer = fs.readFileSync(tempWavPath);
      const { samples, durationSec } = videoExtractService.wavToFloat32(fileBuffer);
      console.log(`[main] IPC transcribe-video-file: duration=${durationSec.toFixed(1)}s, samples=${samples.length}`);
      const service = activeEngine === 'parakeet' ? parakeetService : whisperService;
      const result = await service.transcribeFile(samples.buffer as ArrayBuffer, language, durationSec, (progress) => {
        event.sender.send('transcribe-file-progress', progress);
      });
      console.log(`[main] IPC transcribe-video-file done: segments=${result.segments.length}`);
      return result;
    } catch (err) {
      console.error('[main] IPC transcribe-video-file error:', err);
      throw err;
    } finally {
      try { fs.unlinkSync(tempWavPath); } catch {}
    }
  });

  ipcMain.handle('diarize', async (event, numSpeakers: number) => {
    if (!Number.isInteger(numSpeakers) || numSpeakers < 2 || numSpeakers > 20) {
      throw new Error('numSpeakers must be an integer between 2 and 20');
    }
    const start = Date.now();
    const interval = setInterval(() => {
      event.sender.send('diarization-progress', { elapsedMs: Date.now() - start });
    }, 1000);
    try {
      const { micPath, sysPath } = audioFileService.getPaths();
      // Register the mixed file up front so it is cleaned up even if diarization
      // fails after the worker has written it to disk.
      audioFileService.setMixedPath(path.join(path.dirname(micPath), 'mixed-session.f32'));
      const { segments, mixedPath } = await diarizationService.diarizeFromFile(
        micPath,
        sysPath,
        diarizationModelManager.getSegmentationModelPath(),
        diarizationModelManager.getEmbeddingModelPath(),
        numSpeakers,
      );
      // Preserve the mixed file for re-transcription; cleanup happens explicitly
      // via 'cleanup-after-retranscription' once the renderer finishes rebuilding.
      audioFileService.setMixedPath(mixedPath);
      return { segments: segments.map((seg) => ({ ...seg })), mixedPath };
    } finally {
      clearInterval(interval);
    }
  });

  ipcMain.handle('transcribe-region', async (_event, req: TranscribeRegionRequest): Promise<TranscribeRegionResult> => {
    const { sourcePath, start, end, language, prompt, startByte, endByte } = req;
    const SAMPLE_RATE = 16000;

    let fileBytes = 0;
    try {
      fileBytes = fs.statSync(sourcePath).size;
    } catch {
      return { text: '', startTime: start, endTime: end };
    }

    const rawStart = startByte ?? Math.floor(start * SAMPLE_RATE) * 4;
    const rawEnd = endByte ?? Math.floor(end * SAMPLE_RATE) * 4;
    const byteStart = Math.max(0, Math.min(rawStart, fileBytes));
    const byteEnd = Math.max(byteStart, Math.min(rawEnd, fileBytes));
    const byteLen = (byteEnd - byteStart) - ((byteEnd - byteStart) % 4);

    if (byteLen < 4) {
      return { text: '', startTime: start, endTime: end };
    }

    const buf = Buffer.allocUnsafe(byteLen);
    const fd = fs.openSync(sourcePath, 'r');
    try {
      fs.readSync(fd, buf, 0, byteLen, byteStart);
    } finally {
      fs.closeSync(fd);
    }
    const sliceBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + byteLen);

    const service = activeEngine === 'parakeet' ? parakeetService : whisperService;
    const result = await service.transcribeBuffer(sliceBuffer, language, { prompt });
    return {
      text: result.text,
      startTime: result.segments[0]?.t0 ?? 0,
      endTime: result.segments[result.segments.length - 1]?.t1 ?? (end - start),
    };
  });

  ipcMain.handle('cleanup-after-retranscription', () => {
    audioFileService.cleanup();
  });

  ipcMain.handle('check-for-updates', () => {
    updateService.checkForUpdates();
  });

  ipcMain.on('quit-and-install', () => {
    updateService.quitAndInstall();
  });

  ipcMain.handle('get-providers', () => settingsStore.get('providers'));

  ipcMain.handle('add-provider', (_event, providerData: Omit<Provider, 'id'>) => {
    const newProvider: Provider = { ...providerData, id: crypto.randomUUID() };
    const providers = settingsStore.get('providers');
    settingsStore.set('providers', [...providers, newProvider]);
    return newProvider;
  });

  ipcMain.handle('update-provider', (_event, provider: Provider) => {
    const providers = settingsStore.get('providers');
    settingsStore.set('providers', providers.map((p) => (p.id === provider.id ? provider : p)));
  });

  ipcMain.handle('delete-provider', (_event, id: string) => {
    const providers = settingsStore.get('providers');
    settingsStore.set('providers', providers.filter((p) => p.id !== id));
  });

  ipcMain.handle('ollama-list-models', async (_event, ollamaBaseUrl: string) => {
    return llmService.ollamaListModels(ollamaBaseUrl);
  });

  ipcMain.handle('get-available-llm-models', () => llmModelManager.getAvailableLlmModels());

  ipcMain.handle('get-llm-model-status', (_event, modelId: string) => ({
    downloaded: llmModelManager.isLlmModelDownloaded(modelId),
  }));

  ipcMain.handle('download-llm-model', async (event, modelId: string) => {
    await llmModelManager.downloadLlmModel(modelId, (progress) => {
      event.sender.send('llm-download-progress', { ...progress, modelId });
    });
  });

  ipcMain.handle('delete-llm-model', (_event, modelId: string) => {
    llmModelManager.deleteLlmModel(modelId);
  });

  ipcMain.handle('correct-segment', async (_event, rawText: string) => {
    return correctionService.correct(rawText);
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
  mainWindow = win;

  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send('close-requested');
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

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    updateService.initialize();
  }

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

app.on('before-quit', (e) => {
  if (!allowClose) {
    e.preventDefault();
    quitRequested = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('close-requested');
    } else {
      allowClose = true;
      app.quit();
    }
    return;
  }
  globalShortcut.unregisterAll();
  audioFileService.cleanup();
  videoExtractService.cleanupExtractedAudio();
  llmService.releaseLocalModel().catch(() => {});
});
