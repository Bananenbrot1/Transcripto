import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by Vitest before imports)
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
  };
});

vi.mock('./download-utils.js', () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
}));

// Settings store mock: returns 'cam++' for speakerEmbeddingModel by default.
vi.mock('./settings-store.js', () => ({
  get: vi.fn().mockReturnValue('cam++'),
  set: vi.fn(),
  getAll: vi.fn(),
}));

// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import { downloadFile } from './download-utils.js';
import {
  getAvailableEmbeddingModels,
  getSelectedEmbeddingModel,
  isEmbeddingModelDownloaded,
  downloadEmbeddingModel,
} from './diarization-model-manager.js';

const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
const mockDownloadFile = downloadFile as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockDownloadFile.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------

describe('getAvailableEmbeddingModels', () => {
  it('returns at least CAM++ and ERes2NetV2 entries', () => {
    const models = getAvailableEmbeddingModels();
    const ids = models.map((m) => m.id);
    expect(ids).toContain('cam++');
    expect(ids).toContain('eres2netv2');
  });

  it('each entry has required fields populated', () => {
    const models = getAvailableEmbeddingModels();
    for (const m of models) {
      expect(m.id).toBeTruthy();
      expect(m.displayName).toBeTruthy();
      expect(m.downloadUrl).toMatch(/^https:/);
      expect(m.fileSizeMB).toBeGreaterThan(0);
      expect(m.fileName).toMatch(/\.onnx$/);
    }
  });
});

// ---------------------------------------------------------------------------

describe('getSelectedEmbeddingModel', () => {
  it('returns the value from the settings store', () => {
    const result = getSelectedEmbeddingModel();
    expect(result).toBe('cam++');
  });
});

// ---------------------------------------------------------------------------

describe('isEmbeddingModelDownloaded', () => {
  it('returns false when the model file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(isEmbeddingModelDownloaded('cam++')).toBe(false);
  });

  it('returns true when the model file exists', () => {
    mockExistsSync.mockReturnValue(true);
    expect(isEmbeddingModelDownloaded('eres2netv2')).toBe(true);
  });

  it('throws a descriptive error for an unknown model identifier', () => {
    expect(() => isEmbeddingModelDownloaded('unknown-model')).toThrow(
      /unknown embedding model identifier.*unknown-model/i,
    );
  });
});

// ---------------------------------------------------------------------------

describe('downloadEmbeddingModel', () => {
  it('calls downloadFile with the correct URL and local path for cam++', async () => {
    mockExistsSync.mockReturnValue(false);

    await downloadEmbeddingModel('cam++');

    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const [url, localPath] = mockDownloadFile.mock.calls[0] as [string, string];
    expect(url).toContain('campplus');
    expect(localPath).toContain('campplus');
    expect(localPath).toMatch(/\.onnx$/);
  });

  it('calls downloadFile with the correct URL and local path for eres2netv2', async () => {
    mockExistsSync.mockReturnValue(false);

    await downloadEmbeddingModel('eres2netv2');

    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const [url, localPath] = mockDownloadFile.mock.calls[0] as [string, string];
    expect(url).toContain('eres2netv2');
    expect(localPath).toContain('eres2netv2');
    expect(localPath).toMatch(/\.onnx$/);
  });

  it('resolves immediately without calling downloadFile when model is already downloaded', async () => {
    mockExistsSync.mockReturnValue(true);

    await downloadEmbeddingModel('cam++');

    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it('rejects with a descriptive error for an unknown model identifier', async () => {
    await expect(downloadEmbeddingModel('unknown-model')).rejects.toThrow(
      /unknown embedding model identifier.*unknown-model/i,
    );
  });

  it('emits progress events via the onProgress callback', async () => {
    mockExistsSync.mockReturnValue(false);
    mockDownloadFile.mockImplementation(
      async (
        _url: string,
        _path: string,
        _sha: undefined,
        cb?: (p: { percent: number; transferredBytes: number; totalBytes: number }) => void,
      ) => {
        cb?.({ percent: 50, transferredBytes: 500, totalBytes: 1000 });
      },
    );

    const progressEvents: Array<{ modelId: string; bytesReceived: number; totalBytes: number }> =
      [];
    await downloadEmbeddingModel('cam++', (p) => progressEvents.push(p));

    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0]).toEqual({
      modelId: 'cam++',
      bytesReceived: 500,
      totalBytes: 1000,
    });
  });
});
