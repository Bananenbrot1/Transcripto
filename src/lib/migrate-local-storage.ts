import { STORE_DEFAULTS } from '../../shared/store-defaults';
import type { StoreSchema } from '../../shared/types';

const MIGRATION_KEY = 'transcripto-settings-migrated';

/**
 * One-time migration from localStorage to electron-store.
 * Reads old localStorage keys, writes them to the store via IPC,
 * then sets a flag so it never runs again.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY) === 'true') return;

  try {
    // Simple string/boolean settings
    const model = localStorage.getItem('transcripto-model');
    if (model) await window.electronAPI.storeSet('model', model);

    const language = localStorage.getItem('transcripto-language');
    if (language) await window.electronAPI.storeSet('language', language);

    const onboarding = localStorage.getItem('transcripto-onboarding-complete');
    if (onboarding) await window.electronAPI.storeSet('onboardingComplete', onboarding === 'true');

    const darkMode = localStorage.getItem('transcripto-dark-mode');
    if (darkMode) await window.electronAPI.storeSet('darkMode', darkMode === 'true');

    // Export settings (grouped)
    const exportSettings: StoreSchema['export'] = { ...STORE_DEFAULTS.export };
    const folder = localStorage.getItem('transcripto-export-folder');
    if (folder) exportSettings.folder = folder;
    const filename = localStorage.getItem('transcripto-export-filename');
    if (filename) exportSettings.filenameTemplate = filename;
    const body = localStorage.getItem('transcripto-export-body-template');
    if (body) exportSettings.bodyTemplate = body;
    const autoSave = localStorage.getItem('transcripto-export-auto-save');
    if (autoSave) exportSettings.autoSave = autoSave === 'true';
    await window.electronAPI.storeSet('export', exportSettings);

    // VAD settings (grouped)
    const vadSettings: StoreSchema['vad'] = { ...STORE_DEFAULTS.vad };
    const parseNum = (key: string) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    };
    const st = parseNum('transcripto-vad-silence-threshold');
    if (st !== null) vadSettings.silenceThreshold = st;
    const sd = parseNum('transcripto-vad-silence-duration-ms');
    if (sd !== null) vadSettings.silenceDurationMs = sd;
    const max = parseNum('transcripto-vad-max-segment-ms');
    if (max !== null) vadSettings.maxSegmentMs = max;
    const min = parseNum('transcripto-vad-min-segment-ms');
    if (min !== null) vadSettings.minSegmentMs = min;
    await window.electronAPI.storeSet('vad', vadSettings);
  } catch (err) {
    console.error('[migrate] Failed to migrate localStorage settings:', err);
    return; // Don't set flag — retry next time
  }

  localStorage.setItem(MIGRATION_KEY, 'true');
}
