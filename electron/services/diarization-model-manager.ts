import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as https from 'node:https';
import { spawnSync } from 'node:child_process';

// Note: release tag URL has a typo "recongition" — this matches the actual GitHub URL
const SEGMENTATION_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2';

const EMBEDDING_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx';

const SEGMENTATION_DIR_NAME = 'sherpa-onnx-pyannote-segmentation-3-0';
const EMBEDDING_FILE_NAME = '3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx';
const TOTAL_SIZE_MB = 35;

export interface DiarizationDownloadProgress {
  phase: 'segmentation' | 'embedding' | 'extracting';
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}

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

function downloadFile(
  url: string,
  tmpPath: string,
  finalPath: string,
  onProgress?: (p: Omit<DiarizationDownloadProgress, 'phase'>) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);

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
            file.close();
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            reject(new Error(`Download failed with status ${response.statusCode} for ${reqUrl}`));
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

export async function downloadDiarizationModels(
  onProgress?: (p: DiarizationDownloadProgress) => void,
): Promise<void> {
  const dir = getDiarizationModelsDir();
  fs.mkdirSync(dir, { recursive: true });

  const status = isDiarizationModelsDownloaded();

  if (!status.segmentation) {
    const tarPath = path.join(dir, SEGMENTATION_DIR_NAME + '.tar.bz2');
    const tmpTarPath = tarPath + '.tmp';

    await downloadFile(SEGMENTATION_URL, tmpTarPath, tarPath, (p) => {
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
    const tmpPath = finalPath + '.tmp';

    await downloadFile(EMBEDDING_URL, tmpPath, finalPath, (p) => {
      onProgress?.({ phase: 'embedding', ...p });
    });
  }
}
