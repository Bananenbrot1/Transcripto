# Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic update checking and one-click install via `electron-updater` and GitHub Releases.

**Architecture:** `electron-updater` wraps Electron's autoUpdater with GitHub Releases support. A new `update-service.ts` in the main process manages the lifecycle and pushes IPC events to the renderer. A slim `UpdateBanner` component at the top of `App.tsx` shows download progress and a restart button.

**Tech Stack:** `electron-updater`, Electron IPC (existing pattern), React + Tailwind (existing shadcn/ui components)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `electron-updater` dep; add `release` script |
| `electron-builder.yml` | Modify | Add `publish` block pointing at GitHub |
| `electron/services/update-service.ts` | Create | Wraps autoUpdater; schedules checks; exposes `initialize`, `checkForUpdates`, `quitAndInstall` |
| `electron/services/update-service.test.ts` | Create | Unit tests for update-service |
| `electron/ipc-types.ts` | Modify | Add 5 new method signatures to `ElectronAPI` |
| `electron/preload.ts` | Modify | Wire up 5 new IPC methods |
| `electron/main.ts` | Modify | Initialize update service on app ready; register 2 IPC handlers |
| `src/components/update-banner.tsx` | Create | Slim banner with downloading/ready states |
| `src/App.tsx` | Modify | Render `<UpdateBanner />` as first child of root layout |

---

## Task 1: Install dependency and configure build

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.yml`

- [ ] **Step 1: Install electron-updater**

Run in the project root:

```bash
pnpm add electron-updater
```

Expected: `electron-updater` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Add the `release` script to `package.json`**

In `package.json`, change the `scripts` block from:
```json
"dist": "pnpm build && electron-builder --mac --arm64",
```
to:
```json
"dist": "pnpm build && electron-builder --mac --arm64",
"release": "pnpm build && electron-builder --mac --arm64 --publish always",
```

- [ ] **Step 3: Add `publish` block to `electron-builder.yml`**

Append to the end of `electron-builder.yml`:
```yaml
publish:
  provider: github
  owner: Bananenbrot1
  repo: Transcripto
  releaseType: release
```

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
pnpm build
```

Expected: Build completes with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml electron-builder.yml
git commit -m "chore: add electron-updater and release script"
```

---

## Task 2: Write and test update-service.ts

**Files:**
- Create: `electron/services/update-service.ts`
- Create: `electron/services/update-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `electron/services/update-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockAutoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  on: vi.fn(),
  checkForUpdates: vi.fn().mockResolvedValue(undefined),
  quitAndInstall: vi.fn(),
};

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

describe('update-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets autoDownload and autoInstallOnAppQuit to true on initialize', async () => {
    const { initialize } = await import('./update-service.js');
    initialize();
    expect(mockAutoUpdater.autoDownload).toBe(true);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it('registers update-available, update-downloaded, and error event handlers', async () => {
    const { initialize } = await import('./update-service.js');
    initialize();
    const registeredEvents = mockAutoUpdater.on.mock.calls.map(([event]: [string]) => event);
    expect(registeredEvents).toContain('update-available');
    expect(registeredEvents).toContain('update-downloaded');
    expect(registeredEvents).toContain('error');
  });

  it('triggers an initial update check after 10 seconds', async () => {
    const { initialize } = await import('./update-service.js');
    initialize();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('triggers a periodic update check after 4 hours', async () => {
    const { initialize } = await import('./update-service.js');
    initialize();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
  });

  it('calls autoUpdater.quitAndInstall on quitAndInstall()', async () => {
    const { quitAndInstall } = await import('./update-service.js');
    quitAndInstall();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('calls autoUpdater.checkForUpdates on checkForUpdates()', async () => {
    const { checkForUpdates } = await import('./update-service.js');
    checkForUpdates();
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('sends update-error IPC when autoUpdater emits an error', async () => {
    const mockSend = vi.fn();
    const { BrowserWindow } = await import('electron');
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
      { webContents: { send: mockSend } } as never,
    ]);

    const { initialize } = await import('./update-service.js');
    initialize();

    // Grab the error handler registered with autoUpdater.on
    const errorCall = mockAutoUpdater.on.mock.calls.find(([event]) => event === 'error');
    expect(errorCall).toBeDefined();
    const errorHandler = errorCall![1] as (err: Error) => void;

    errorHandler(new Error('network failure'));

    expect(mockSend).toHaveBeenCalledWith('update-error', { message: 'network failure' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run electron/services/update-service.test.ts
```

Expected: All tests FAIL with `Cannot find module './update-service.js'` or similar.

- [ ] **Step 3: Implement update-service.ts**

Create `electron/services/update-service.ts`:

```typescript
import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function sendToRenderer(channel: string, payload: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send(channel, payload);
}

export function initialize(): void {
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run electron/services/update-service.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/update-service.ts electron/services/update-service.test.ts
git commit -m "feat: add update-service wrapping electron-updater"
```

---

## Task 3: Add IPC types

**Files:**
- Modify: `electron/ipc-types.ts`

- [ ] **Step 1: Add 5 new signatures to the `ElectronAPI` interface**

In `electron/ipc-types.ts`, add the following lines at the end of the `ElectronAPI` interface (after `transcribeVideoFile` and before the closing `}`):

```typescript
  checkForUpdates: () => Promise<void>;
  quitAndInstall: () => void;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateError: (callback: (info: { message: string }) => void) => () => void;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc -p tsconfig.electron.json --noEmit && pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc-types.ts
git commit -m "feat: add auto-update IPC type signatures"
```

---

## Task 4: Wire up preload.ts

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add the 5 new methods to the `api` object in `electron/preload.ts`**

Add these entries at the end of the `api` object (after `transcribeVideoFile` and before the `};` that closes the object):

```typescript
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  quitAndInstall: () => ipcRenderer.send('quit-and-install'),

  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  onUpdateError: (callback: (info: { message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { message: string }) => callback(info);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc -p tsconfig.preload.json --noEmit
```

Expected: No errors. (The compiler validates `api` against the `ElectronAPI` interface.)

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: wire auto-update IPC methods in preload"
```

---

## Task 5: Integrate update-service in main.ts

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add the import at the top of `electron/main.ts`**

Add after the last existing import line (after `import * as videoExtractService from './services/video-extract-service.js';`):

```typescript
import * as updateService from './services/update-service.js';
```

- [ ] **Step 2: Register the two new IPC handlers inside `registerIpcHandlers()`**

Add these two handlers at the end of the `registerIpcHandlers` function body (before the closing `}`):

```typescript
  ipcMain.handle('check-for-updates', () => {
    updateService.checkForUpdates();
  });

  ipcMain.on('quit-and-install', () => {
    updateService.quitAndInstall();
  });
```

- [ ] **Step 3: Initialize the update service in `app.whenReady()`**

In `app.whenReady().then(...)`, add `updateService.initialize()` guarded by `app.isPackaged` so it doesn't throw during development. Change:

```typescript
app.whenReady().then(() => {
  createWindow();
```

to:

```typescript
app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    updateService.initialize();
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm exec tsc -p tsconfig.electron.json --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: initialize update-service and register IPC handlers in main"
```

---

## Task 6: Build the UpdateBanner component

**Files:**
- Create: `src/components/update-banner.tsx`

- [ ] **Step 1: Create `src/components/update-banner.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BannerState = 'hidden' | 'downloading' | 'ready';

export function UpdateBanner() {
  const [state, setState] = useState<BannerState>('hidden');
  const [version, setVersion] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setVersion(info.version);
      setState('downloading');
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setVersion(info.version);
      setState('ready');
    });

    return () => {
      unsubAvailable();
      unsubDownloaded();
    };
  }, []);

  if (dismissed || state === 'hidden') return null;

  return (
    <div className="flex items-center gap-3 bg-primary/10 border-b border-primary/20 px-6 py-2 text-sm shrink-0">
      {state === 'downloading' && (
        <span className="text-foreground flex items-center gap-2">
          <span className="size-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" />
          Downloading Transcripto {version}…
        </span>
      )}
      {state === 'ready' && (
        <>
          <span className="text-foreground">
            Transcripto {version} is ready.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" onClick={() => window.electronAPI.quitAndInstall()}>
              Restart to Update
            </Button>
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss update banner"
            >
              <X className="size-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/update-banner.tsx
git commit -m "feat: add UpdateBanner component"
```

---

## Task 7: Mount UpdateBanner in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the import to `src/App.tsx`**

Add after the last existing component import (after `import { LiveNotesPanel } from '@/components/live-notes-panel';`):

```tsx
import { UpdateBanner } from '@/components/update-banner';
```

- [ ] **Step 2: Render `<UpdateBanner />` as the first child of the root div**

In `src/App.tsx`, change:

```tsx
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="border-b px-6 py-3">
```

to:

```tsx
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <UpdateBanner />
      <header className="border-b px-6 py-3">
```

- [ ] **Step 3: Verify full build passes**

```bash
pnpm build
```

Expected: TypeScript check passes and Vite build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount UpdateBanner in App"
```

---

## Task 8: Run all tests and verify

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All tests pass, including the 6 new `update-service` tests.

- [ ] **Step 2: Verify the dev app starts without errors**

```bash
pnpm dev
```

Expected: App launches normally. No errors in the terminal or DevTools console related to auto-update (the `app.isPackaged` guard prevents update-service from initializing in dev mode).

- [ ] **Step 3: Final commit if any loose files remain**

```bash
git status
```

If everything was committed in prior steps, this should show a clean working tree. If any files are unstaged, add and commit them:

```bash
git add <any remaining files>
git commit -m "chore: finalize auto-update implementation"
```

---

## Releasing an Update (Reference)

Once this feature is merged and you're ready to cut a release:

1. Bump `version` in `package.json` (e.g. `0.3.0` → `0.4.0`)
2. Commit: `git commit -am "chore: bump version to 0.4.0"`
3. Run: `GH_TOKEN=<your-token> pnpm release`
   - Token needs `repo` scope only
   - electron-builder builds the app, creates a GitHub Release draft, and uploads: DMG, ZIP, and `latest-mac.yml`
4. Go to GitHub → Releases → publish the draft
5. Running users will see the update banner within 4 hours (or immediately on next launch)
