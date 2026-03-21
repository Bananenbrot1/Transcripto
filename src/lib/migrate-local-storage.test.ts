import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateFromLocalStorage } from './migrate-local-storage';

// Mock localStorage for Node test environment
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const mockStoreSet = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(globalThis, 'window', {
  value: { electronAPI: { storeSet: mockStoreSet } },
  writable: true,
});

beforeEach(() => {
  mockStoreSet.mockClear();
  mockStoreSet.mockResolvedValue(undefined);
  storage.clear();
});

describe('migrateFromLocalStorage', () => {
  it('migrates simple string settings', async () => {
    localStorage.setItem('transcripto-model', 'small');
    localStorage.setItem('transcripto-language', 'de');

    await migrateFromLocalStorage();

    expect(mockStoreSet).toHaveBeenCalledWith('model', 'small');
    expect(mockStoreSet).toHaveBeenCalledWith('language', 'de');
    expect(localStorage.getItem('transcripto-settings-migrated')).toBe('true');
  });

  it('migrates boolean settings with correct transform', async () => {
    localStorage.setItem('transcripto-onboarding-complete', 'true');
    localStorage.setItem('transcripto-dark-mode', 'false');

    await migrateFromLocalStorage();

    expect(mockStoreSet).toHaveBeenCalledWith('onboardingComplete', true);
    expect(mockStoreSet).toHaveBeenCalledWith('darkMode', false);
  });

  it('migrates grouped export settings', async () => {
    localStorage.setItem('transcripto-export-folder', '/tmp/exports');

    await migrateFromLocalStorage();

    const exportCall = mockStoreSet.mock.calls.find(
      ([key]) => key === 'export',
    );
    expect(exportCall).toBeDefined();
    expect(exportCall![1].folder).toBe('/tmp/exports');
  });

  it('migrates grouped VAD settings', async () => {
    localStorage.setItem('transcripto-vad-silence-threshold', '0.05');
    localStorage.setItem('transcripto-vad-max-segment-ms', '60000');

    await migrateFromLocalStorage();

    const vadCall = mockStoreSet.mock.calls.find(
      ([key]) => key === 'vad',
    );
    expect(vadCall).toBeDefined();
    expect(vadCall![1].silenceThreshold).toBe(0.05);
    expect(vadCall![1].maxSegmentMs).toBe(60000);
  });

  it('is idempotent — skips if already migrated', async () => {
    localStorage.setItem('transcripto-settings-migrated', 'true');
    localStorage.setItem('transcripto-model', 'medium');

    await migrateFromLocalStorage();

    expect(mockStoreSet).not.toHaveBeenCalled();
  });

  it('does not set flag if IPC fails (retries next time)', async () => {
    localStorage.setItem('transcripto-model', 'small');
    mockStoreSet.mockRejectedValueOnce(new Error('IPC down'));

    await migrateFromLocalStorage();

    expect(localStorage.getItem('transcripto-settings-migrated')).toBeNull();
  });

  it('skips keys that are not in localStorage', async () => {
    await migrateFromLocalStorage();

    expect(mockStoreSet).not.toHaveBeenCalledWith('model', expect.anything());
    expect(mockStoreSet).not.toHaveBeenCalledWith('language', expect.anything());
    // export and vad always get set with defaults
    expect(mockStoreSet).toHaveBeenCalledWith('export', expect.any(Object));
    expect(mockStoreSet).toHaveBeenCalledWith('vad', expect.any(Object));
  });
});
