const { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences, shell } = require('electron');
const path = require('node:path');
const modelManager = require('./services/model-manager');
const whisperService = require('./services/whisper-service');

const isDev = !app.isPackaged;

function registerIpcHandlers() {
  ipcMain.handle('check-model-status', () => {
    return { downloaded: modelManager.isModelDownloaded() };
  });

  ipcMain.handle('download-model', async (event) => {
    await modelManager.downloadModel((progress) => {
      event.sender.send('download-progress', progress);
    });
  });

  ipcMain.handle('initialize-whisper', async () => {
    await whisperService.initialize();
  });

  ipcMain.handle('transcribe', async (_event, source, audioBuffer) => {
    return await whisperService.transcribe(source, audioBuffer);
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
}

function createWindow() {
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
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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
