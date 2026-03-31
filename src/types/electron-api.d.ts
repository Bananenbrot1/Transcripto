/**
 * Renderer-side view of the Electron IPC bridge.
 *
 * The canonical ElectronAPI interface lives in electron/ipc-types.ts and is
 * re-exported here. When adding new IPC channels, update electron/ipc-types.ts
 * first — both preload.ts (main-process build) and this file (renderer build)
 * will pick up the change.
 */
import type { ElectronAPI, DiarizationDownloadProgress, MediaPermissions, SpeakerAssignment, SpeakerProfile } from '../../electron/ipc-types';

export type { DiarizationDownloadProgress, MediaPermissions, SpeakerAssignment, SpeakerProfile };

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
