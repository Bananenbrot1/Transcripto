import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { downloadFile, type DownloadProgress } from './download-utils.js';
import type { LlmModelDefinition } from '../../shared/types.js';

/** The single built-in local model. Larger local models should be run via Ollama. */
export const BUILTIN_LOCAL_MODEL_ID = 'smollm2-360m-q4';

const LLM_CATALOG: Record<string, LlmModelDefinition> = {
  [BUILTIN_LOCAL_MODEL_ID]: {
    id: BUILTIN_LOCAL_MODEL_ID,
    fileName: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    sizeMB: 230,
    label: 'SmolLM2 360M',
    tier: 'fastest',
    url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf',
  },
};

function getLlmModelsDir(): string {
  return path.join(app.getPath('userData'), 'llm-models');
}

export function getAvailableLlmModels(): LlmModelDefinition[] {
  return Object.values(LLM_CATALOG);
}

export function getLlmModelDefinition(modelId: string): LlmModelDefinition {
  const model = LLM_CATALOG[modelId];
  if (!model) throw new Error(`Unknown LLM model: ${modelId}`);
  return model;
}

export function getLlmModelPath(modelId: string): string {
  const model = getLlmModelDefinition(modelId);
  return path.join(getLlmModelsDir(), model.fileName);
}

export function isLlmModelDownloaded(modelId: string): boolean {
  return fs.existsSync(getLlmModelPath(modelId));
}

export function deleteLlmModel(modelId: string): void {
  const p = getLlmModelPath(modelId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export async function downloadLlmModel(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const model = getLlmModelDefinition(modelId);
  const dir = getLlmModelsDir();
  fs.mkdirSync(dir, { recursive: true });
  return downloadFile(model.url, getLlmModelPath(modelId), undefined, onProgress);
}
