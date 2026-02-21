import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as https from 'node:https';

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

interface ModelDefinition {
  id: string;
  fileName: string;
  sizeMB: number;
  label: string;
}

interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}

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

  return new Promise((resolve, reject) => {
    const modelsDir = getModelsDir();
    fs.mkdirSync(modelsDir, { recursive: true });

    const finalPath = getModelPath(modelId);
    const tmpPath = finalPath + '.tmp';

    const file = fs.createWriteStream(tmpPath);
    const url = BASE_URL + model.fileName;

    function doRequest(reqUrl: string): void {
      https
        .get(reqUrl, (response) => {
          if (
            response.statusCode !== undefined &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            doRequest(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            fs.unlinkSync(tmpPath);
            reject(new Error(`Download failed with status ${response.statusCode}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] ?? '0', 10);
          let transferredBytes = 0;

          response.on('data', (chunk: Buffer) => {
            transferredBytes += chunk.length;
            file.write(chunk);
            if (onProgress && totalBytes > 0) {
              onProgress({
                percent: Math.round((transferredBytes / totalBytes) * 100),
                transferredBytes,
                totalBytes,
              });
            }
          });

          response.on('end', () => {
            file.end(() => {
              fs.renameSync(tmpPath, finalPath);
              resolve();
            });
          });

          response.on('error', (err: Error) => {
            file.close();
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            reject(err);
          });
        })
        .on('error', (err: Error) => {
          file.close();
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          reject(err);
        });
    }

    doRequest(url);
  });
}
