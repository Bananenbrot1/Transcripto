# Auto-Update Design

**Date:** 2026-04-07
**Status:** Approved

## Overview

Add automatic update functionality to Transcripto using `electron-updater` and GitHub Releases. Running users are notified when a new version is available and can restart to apply it with one click.

## Requirements

- Distribution: GitHub Releases
- UX: Notify and prompt (user initiates restart, not silent auto-install)
- Check schedule: On app startup (10s delay) + every 4 hours in the background

## Architecture

### New dependency

- `electron-updater` (production dependency) — companion library to electron-builder; handles GitHub feed polling, download, verification, and install-on-restart

### New service: `electron/services/update-service.ts`

Wraps `autoUpdater` from `electron-updater`. Single responsibility: manage the update lifecycle and relay events to the renderer.

Responsibilities:
- Configure the GitHub release feed on init
- Trigger an initial update check 10 seconds after app ready (avoids slowing startup)
- Schedule a repeat check every 4 hours via `setInterval`
- Forward update lifecycle events to the renderer window via IPC push
- Expose `checkForUpdates()` and `quitAndInstall()` for IPC handlers

### Changes to `electron/main.ts`

- Import and initialize `update-service` after `app.whenReady()`
- Register two new IPC handlers: `check-for-updates`, `quit-and-install`

### Changes to `electron/preload.ts` + `electron/ipc-types.ts`

Add to `ElectronAPI`:
- `checkForUpdates(): Promise<void>`
- `quitAndInstall(): void`
- `onUpdateAvailable(cb: (info: { version: string }) => void): () => void`
- `onUpdateDownloaded(cb: (info: { version: string }) => void): () => void`
- `onUpdateError(cb: (info: { message: string }) => void): () => void`

## IPC Channels

| Direction | Channel | Payload | Description |
|-----------|---------|---------|-------------|
| main → renderer | `update-available` | `{ version: string }` | New version found, download starting |
| main → renderer | `update-downloaded` | `{ version: string }` | Download complete, ready to install |
| main → renderer | `update-error` | `{ message: string }` | Update check/download failed |
| renderer → main | `check-for-updates` | — | Manually trigger an update check |
| renderer → main | `quit-and-install` | — | Restart and apply downloaded update |

Update errors are logged silently and not surfaced in the UI — failures should not interrupt transcription.

## UI

### New component: `src/components/update-banner.tsx`

A slim banner rendered at the top of the app (above all other content in `App.tsx`).

**States:**

| State | Trigger | Content | Dismissible? |
|-------|---------|---------|--------------|
| Hidden | Default / no update | — | — |
| Downloading | `update-available` fires | "Downloading Transcripto X.Y.Z…" + subtle animated indicator | No |
| Ready | `update-downloaded` fires | "Transcripto X.Y.Z is ready." + **Restart to Update** button + × | Yes |

- **Restart to Update** button calls `electronAPI.quitAndInstall()`
- **×** dismisses the banner for the current session; the update installs automatically on the next normal app launch
- Component subscribes to `onUpdateAvailable` and `onUpdateDownloaded` on mount, cleans up on unmount (same pattern as `onDownloadProgress`)

### Changes to `src/App.tsx`

Render `<UpdateBanner />` as the first child inside the root layout element.

## Publishing & Release Workflow

### `electron-builder.yml` addition

```yaml
publish:
  provider: github
  owner: <github-username>
  repo: transcripto
  releaseType: release
```

Replace `<github-username>` with the actual GitHub account that owns the repo.

### `package.json` scripts

```json
"dist":    "pnpm build && electron-builder --mac --arm64",
"release": "pnpm build && electron-builder --mac --arm64 --publish always"
```

- `pnpm dist` — local build only, no upload (existing behavior unchanged)
- `pnpm release` — builds + uploads artifacts to a GitHub Release

### Artifacts uploaded per release

| File | Purpose |
|------|---------|
| `Transcripto-X.Y.Z-arm64.dmg` | Manual download for new users |
| `Transcripto-X.Y.Z-arm64-mac.zip` | Silent background download by electron-updater |
| `latest-mac.yml` | Metadata file polled by the updater to detect new versions |

### Release process

1. Bump `version` in `package.json`
2. Run `GH_TOKEN=<token> pnpm release`
3. electron-builder creates or updates the GitHub Release draft and uploads all three artifacts
4. Publish the GitHub Release — running users will see the update banner within 4 hours or on next launch

**GitHub token:** `GH_TOKEN` requires `repo` scope only. Set in shell profile or CI environment variable — never committed to the repo.

## File Changelist

| File | Change |
|------|--------|
| `package.json` | Add `electron-updater` dep; add `release` script |
| `electron-builder.yml` | Add `publish` block |
| `electron/services/update-service.ts` | New file |
| `electron/main.ts` | Initialize update service; register 2 IPC handlers |
| `electron/ipc-types.ts` | Add 5 new method signatures to `ElectronAPI` |
| `electron/preload.ts` | Wire up 5 new IPC methods |
| `src/components/update-banner.tsx` | New file |
| `src/App.tsx` | Render `<UpdateBanner />` at top of layout |
