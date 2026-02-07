const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');

const MODEL_FILENAME = 'ggml-large-v3-turbo-q5_0.bin';
const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin';

function getModelsDir() {
  return path.join(app.getPath('userData'), 'models');
}

function getModelPath() {
  return path.join(getModelsDir(), MODEL_FILENAME);
}

function isModelDownloaded() {
  return fs.existsSync(getModelPath());
}

function downloadModel(onProgress) {
  return new Promise((resolve, reject) => {
    const modelsDir = getModelsDir();
    fs.mkdirSync(modelsDir, { recursive: true });

    const finalPath = getModelPath();
    const tmpPath = finalPath + '.tmp';

    const file = fs.createWriteStream(tmpPath);

    function doRequest(url) {
      https
        .get(url, (response) => {
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

    doRequest(MODEL_URL);
  });
}

module.exports = { getModelPath, isModelDownloaded, downloadModel };
