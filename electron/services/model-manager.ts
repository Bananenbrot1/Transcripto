import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { downloadFile, type DownloadProgress } from './download-utils.js';
import type { ModelDefinition } from '../../shared/types.js';

const WHISPER_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

const PARAKEET_ARCHIVE_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2';
const PARAKEET_DIR_NAME = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8';

const PARAKEET_LANGUAGES = [
  'bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de',
  'el', 'hu', 'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk',
  'sl', 'es', 'sv', 'ru', 'uk',
];

const MODEL_CATALOG: Record<string, ModelDefinition> = {
  'parakeet-tdt-0.6b-v3': {
    id: 'parakeet-tdt-0.6b-v3',
    fileName: PARAKEET_DIR_NAME,
    sizeMB: 640,
    label: 'Parakeet TDT 0.6B (recommended)',
    engine: 'parakeet',
    supportedLanguages: PARAKEET_LANGUAGES,
  },
  tiny: { id: 'tiny', fileName: 'ggml-tiny.bin', sizeMB: 75, label: 'Whisper Tiny — Fastest', engine: 'whisper' },
  base: { id: 'base', fileName: 'ggml-base.bin', sizeMB: 142, label: 'Whisper Base — Fast', engine: 'whisper' },
  small: { id: 'small', fileName: 'ggml-small.bin', sizeMB: 466, label: 'Whisper Small — Balanced', engine: 'whisper' },
  medium: { id: 'medium', fileName: 'ggml-medium.bin', sizeMB: 1500, label: 'Whisper Medium — Accurate', engine: 'whisper' },
  'large-v3-turbo-q5': {
    id: 'large-v3-turbo-q5',
    fileName: 'ggml-large-v3-turbo-q5_0.bin',
    sizeMB: 547,
    label: 'Whisper Large v3 Turbo',
    engine: 'whisper',
  },
};

function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models');
}

export function getModelDefinition(modelId: string): ModelDefinition {
  const model = MODEL_CATALOG[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return model;
}

export function getModelPath(modelId: string): string {
  const model = getModelDefinition(modelId);
  if (model.engine === 'parakeet') {
    return path.join(getModelsDir(), model.fileName);
  }
  return path.join(getModelsDir(), model.fileName);
}

export function isModelDownloaded(modelId: string): boolean {
  const model = getModelDefinition(modelId);
  if (model.engine === 'parakeet') {
    // Check that the encoder file exists as a proxy for the full model
    return fs.existsSync(path.join(getModelsDir(), model.fileName, 'encoder.int8.onnx'));
  }
  return fs.existsSync(getModelPath(modelId));
}

export function getAvailableModels(): ModelDefinition[] {
  return Object.values(MODEL_CATALOG);
}

export function deleteModel(modelId: string): void {
  const model = getModelDefinition(modelId);
  const modelPath = getModelPath(modelId);
  if (model.engine === 'parakeet') {
    if (fs.existsSync(modelPath)) {
      fs.rmSync(modelPath, { recursive: true, force: true });
    }
  } else {
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
    }
  }
}

export async function downloadModel(modelId: string, onProgress?: (p: DownloadProgress) => void): Promise<void> {
  const model = getModelDefinition(modelId);
  const modelsDir = getModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });

  if (model.engine === 'parakeet') {
    const tarPath = path.join(modelsDir, PARAKEET_DIR_NAME + '.tar.bz2');

    await downloadFile(PARAKEET_ARCHIVE_URL, tarPath, undefined, onProgress);

    // Extract the archive
    const result = spawnSync('tar', ['-xjf', tarPath, '-C', modelsDir], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`Failed to extract Parakeet model: ${result.stderr}`);
    }
    // Clean up the archive
    fs.unlinkSync(tarPath);
  } else {
    const finalPath = getModelPath(modelId);
    const url = WHISPER_BASE_URL + model.fileName;
    return downloadFile(url, finalPath, model.sha256, onProgress);
  }
}
