import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { downloadFile, type DownloadProgress } from './download-utils';
import type { ModelDefinition } from '../../shared/types';

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

const MODEL_CATALOG: Record<string, ModelDefinition> = {
  tiny: { id: 'tiny', fileName: 'ggml-tiny.bin', sizeMB: 75, label: 'Tiny — Fastest' },
  base: { id: 'base', fileName: 'ggml-base.bin', sizeMB: 142, label: 'Base — Fast' },
  small: { id: 'small', fileName: 'ggml-small.bin', sizeMB: 466, label: 'Small — Balanced' },
  medium: { id: 'medium', fileName: 'ggml-medium.bin', sizeMB: 1500, label: 'Medium — Accurate' },
  'large-v3-turbo-q5': {
    id: 'large-v3-turbo-q5',
    fileName: 'ggml-large-v3-turbo-q5_0.bin',
    sizeMB: 547,
    label: 'Large v3 Turbo (recommended)',
  },
};

function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models');
}

export function getModelPath(modelId: string): string {
  const model = MODEL_CATALOG[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return path.join(getModelsDir(), model.fileName);
}

export function isModelDownloaded(modelId: string): boolean {
  return fs.existsSync(getModelPath(modelId));
}

export function getAvailableModels(): ModelDefinition[] {
  return Object.values(MODEL_CATALOG);
}

export function downloadModel(modelId: string, onProgress?: (p: DownloadProgress) => void): Promise<void> {
  const model = MODEL_CATALOG[modelId];
  if (!model) return Promise.reject(new Error(`Unknown model: ${modelId}`));

  const modelsDir = getModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });

  const finalPath = getModelPath(modelId);
  const url = BASE_URL + model.fileName;

  return downloadFile(url, finalPath, model.sha256, onProgress);
}
