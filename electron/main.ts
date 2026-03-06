import { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences, shell, dialog } from 'electron';
import * as path from 'node:path';
import * as modelManager from './services/model-manager';
import * as whisperService from './services/whisper-service';
import * as markdownExport from './services/markdown-export';
import * as diarizationModelManager from './services/diarization-model-manager';
import * as diarizationService from './services/diarization-service';
import * as audioFileService from './services/audio-file-service';

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
    const modelPath = modelManager.getModelPath(modelId);
    await whisperService.initialize(modelPath);
  });

  ipcMain.handle('transcribe', async (_event, source: 'mic' | 'system', audioBuffer: ArrayBuffer, language: string) => {
    console.log(`[main] IPC transcribe: source=${source}, lang=${language}, byteLength=${audioBuffer?.byteLength}`);
    try {
      const result = await whisperService.transcribe(source, audioBuffer, language);
      console.log(`[main] IPC transcribe done: text="${result.text.slice(0, 60)}"`);
      return result;
    } catch (err) {
      console.error('[main] IPC transcribe error:', err);
      throw err;
    }
  });

  ipcMain.handle('release-whisper', async () => {
    await whisperService.release();
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

app.whenReady().then(() => {
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
  audioFileService.cleanup();
});
