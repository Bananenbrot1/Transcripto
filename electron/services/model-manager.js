const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

const MODEL_CATALOG = {
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

function getModelsDir() {
  return path.join(app.getPath('userData'), 'models');
}

function getModelPath(modelId) {
  const model = MODEL_CATALOG[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return path.join(getModelsDir(), model.fileName);
}

function isModelDownloaded(modelId) {
  return fs.existsSync(getModelPath(modelId));
}

function getAvailableModels() {
  return Object.values(MODEL_CATALOG);
}

function downloadModel(modelId, onProgress) {
  const model = MODEL_CATALOG[modelId];
  if (!model) return Promise.reject(new Error(`Unknown model: ${modelId}`));

  return new Promise((resolve, reject) => {
    const modelsDir = getModelsDir();
    fs.mkdirSync(modelsDir, { recursive: true });

    const finalPath = getModelPath(modelId);
    const tmpPath = finalPath + '.tmp';

    const file = fs.createWriteStream(tmpPath);
    const url = BASE_URL + model.fileName;

    function doRequest(reqUrl) {
      https
        .get(reqUrl, (response) => {
          if (
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

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let transferredBytes = 0;

          response.on('data', (chunk) => {
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

          response.on('error', (err) => {
            file.close();
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            reject(err);
          });
        })
        .on('error', (err) => {
          file.close();
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          reject(err);
        });
    }

    doRequest(url);
  });
}

module.exports = { getModelPath, isModelDownloaded, downloadModel, getAvailableModels };
