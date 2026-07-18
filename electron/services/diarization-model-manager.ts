import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { downloadFile } from './download-utils.js';
import type { DiarizationDownloadProgress } from '../../shared/types.js';

export type { DiarizationDownloadProgress };

// Note: release tag URL has a typo "recongition" — this matches the actual GitHub URL
const SEGMENTATION_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2';

const EMBEDDING_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx';

const SEGMENTATION_DIR_NAME = 'sherpa-onnx-pyannote-segmentation-3-0';
const EMBEDDING_FILE_NAME = '3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx';
const TOTAL_SIZE_MB = 35;

// SHA-256 of the downloaded artifacts (GitHub release assets)
const SEGMENTATION_TAR_SHA256 =
  '24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488';
const EMBEDDING_SHA256 =
  '357a834f702b80161e5b981182c038e18553c1f2ca752ed6cec2052365d4129b';

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

    await downloadFile(SEGMENTATION_URL, tarPath, SEGMENTATION_TAR_SHA256, (p) => {
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
    await downloadFile(EMBEDDING_URL, finalPath, EMBEDDING_SHA256, (p) => {
      onProgress?.({ phase: 'embedding', ...p });
    });
  }
}
