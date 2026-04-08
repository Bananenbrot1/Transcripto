import { createRequire } from 'node:module';
import type { AppUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

// electron-updater is a CJS module that exports `autoUpdater` via a lazy
// Object.defineProperty getter. Node.js ESM static analysis cannot resolve
// getter-based named exports, so a named import fails at load time.
// createRequire bypasses static analysis and loads it correctly at runtime.
const _require = createRequire(import.meta.url);
const autoUpdater: AppUpdater = _require('electron-updater').autoUpdater;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

let initialized = false;

function sendToRenderer(channel: string, payload: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send(channel, payload);
}

export function initialize(): void {
  if (initialized) return;
  initialized = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info: { version: string }) => {
    sendToRenderer('update-available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    sendToRenderer('update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[update-service] Auto-update error:', err.message);
    sendToRenderer('update-error', { message: err.message });
  });

  // Initial check after startup (avoids slowing cold start)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[update-service] Initial check failed:', err.message);
    });
  }, 10_000);

  // Periodic check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[update-service] Periodic check failed:', err.message);
    });
  }, CHECK_INTERVAL_MS);
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err: Error) => {
    console.error('[update-service] Manual check failed:', err.message);
  });
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
