import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { downloadFile } from './download-utils.js';
import * as settingsStore from './settings-store.js';
import type {
  DiarizationDownloadProgress,
  EmbeddingModelInfo,
  EmbeddingModelDownloadProgress,
} from '../../shared/types.js';

export type { DiarizationDownloadProgress, EmbeddingModelInfo, EmbeddingModelDownloadProgress };

// Note: release tag URL has a typo "recongition" — this matches the actual GitHub URL
const SEGMENTATION_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2';

const EMBEDDING_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx';

const SEGMENTATION_DIR_NAME = 'sherpa-onnx-pyannote-segmentation-3-0';
const EMBEDDING_FILE_NAME = '3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx';
const TOTAL_SIZE_MB = 35;

export interface DiarizationModelStatus {
  segmentation: boolean;
  embedding: boolean;
  totalSizeMB: number;
}

export function getDiarizationModelsDir(): string {
  return path.join(app.getPath('userData'), 'models', 'diarization');
}

export function getSegmentationModelPath(): string {
  return path.join(getDiarizationModelsDir(), SEGMENTATION_DIR_NAME, 'model.onnx');
}

export function getEmbeddingModelPath(): string {
  return path.join(getDiarizationModelsDir(), EMBEDDING_FILE_NAME);
}

export function isDiarizationModelsDownloaded(): DiarizationModelStatus {
  return {
    segmentation: fs.existsSync(getSegmentationModelPath()),
    embedding: fs.existsSync(getEmbeddingModelPath()),
    totalSizeMB: TOTAL_SIZE_MB,
  };
}

export async function downloadDiarizationModels(
  onProgress?: (p: DiarizationDownloadProgress) => void,
): Promise<void> {
  const dir = getDiarizationModelsDir();
  fs.mkdirSync(dir, { recursive: true });

  const status = isDiarizationModelsDownloaded();

  if (!status.segmentation) {
    const tarPath = path.join(dir, SEGMENTATION_DIR_NAME + '.tar.bz2');

    await downloadFile(SEGMENTATION_URL, tarPath, undefined, (p) => {
      onProgress?.({ phase: 'segmentation', ...p });
    });

    onProgress?.({ phase: 'extracting', percent: 0, transferredBytes: 0, totalBytes: 0 });
    const result = spawnSync('tar', ['-xjf', tarPath, '-C', dir], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`Failed to extract segmentation model: ${result.stderr}`);
    }
    fs.unlinkSync(tarPath);
  }

  if (!status.embedding) {
    const finalPath = getEmbeddingModelPath();
    await downloadFile(EMBEDDING_URL, finalPath, undefined, (p) => {
      onProgress?.({ phase: 'embedding', ...p });
    });
  }
}

// ---------------------------------------------------------------------------
// Embedding model catalog
// ---------------------------------------------------------------------------

// Note: release tag URL has a typo "recongition" — matches the actual GitHub URL
const EMBEDDING_MODEL_CATALOG: EmbeddingModelInfo[] = [
  {
    id: 'cam++',
    displayName: 'CAM++',
    downloadUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx',
    fileSizeMB: 26,
    fileName: '3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx',
  },
  {
    id: 'eres2netv2',
    displayName: 'ERes2NetV2',
    downloadUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2netv2_sv_zh_cnceleb_16k.onnx',
    fileSizeMB: 26,
    fileName: '3dspeaker_speech_eres2netv2_sv_zh_cnceleb_16k.onnx',
  },
];

/**
 * Returns the full catalog of available speaker embedding models with their
 * display names, download URLs, and expected file sizes.
 */
export function getAvailableEmbeddingModels(): EmbeddingModelInfo[] {
  return EMBEDDING_MODEL_CATALOG;
}

/**
 * Returns the model identifier currently selected in settings, defaulting to
 * 'cam++' if no selection has been persisted.
 */
export function getSelectedEmbeddingModel(): string {
  return settingsStore.get('speakerEmbeddingModel') ?? 'cam++';
}

/**
 * Returns the local file path for the given embedding model identifier.
 *
 * @throws if modelId is not a known embedding model identifier.
 */
export function getEmbeddingModelPathById(modelId: string): string {
  const info = EMBEDDING_MODEL_CATALOG.find((m) => m.id === modelId);
  if (!info) {
    const valid = EMBEDDING_MODEL_CATALOG.map((m) => m.id).join(', ');
    throw new Error(
      `Unknown embedding model identifier: "${modelId}". Expected one of: ${valid}.`,
    );
  }
  return path.join(getDiarizationModelsDir(), info.fileName);
}

/**
 * Returns true if the specified embedding model .onnx file is already present
 * on disk.
 *
 * @throws if modelId is not a known embedding model identifier.
 */
export function isEmbeddingModelDownloaded(modelId: string): boolean {
  return fs.existsSync(getEmbeddingModelPathById(modelId));
}

/**
 * Downloads the specified embedding model to the diarization models directory.
 *
 * - Resolves immediately (without re-downloading) if the model is already on disk.
 * - Emits incremental progress via the optional callback; the payload shape
 *   `{ modelId, bytesReceived, totalBytes }` is compatible with the existing
 *   diarization download progress IPC channel so callers can wire it up without
 *   adding new IPC channels.
 *
 * @throws if modelId is not a known embedding model identifier.
 * @throws if the network request fails.
 */
export async function downloadEmbeddingModel(
  modelId: string,
  onProgress?: (p: EmbeddingModelDownloadProgress) => void,
): Promise<void> {
  const info = EMBEDDING_MODEL_CATALOG.find((m) => m.id === modelId);
  if (!info) {
    const valid = EMBEDDING_MODEL_CATALOG.map((m) => m.id).join(', ');
    throw new Error(
      `Unknown embedding model identifier: "${modelId}". Expected one of: ${valid}.`,
    );
  }

  const finalPath = path.join(getDiarizationModelsDir(), info.fileName);
  if (fs.existsSync(finalPath)) {
    // Already downloaded — skip without re-downloading.
    return;
  }

  const dir = getDiarizationModelsDir();
  fs.mkdirSync(dir, { recursive: true });

  await downloadFile(info.downloadUrl, finalPath, undefined, (p) => {
    onProgress?.({
      modelId,
      bytesReceived: p.transferredBytes,
      totalBytes: p.totalBytes,
    });
  });
}
