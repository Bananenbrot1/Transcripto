import * as fs from 'node:fs';
import * as https from 'node:https';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { DownloadProgress } from '../../shared/types';

export type { DownloadProgress };

/**
 * Compute the SHA-256 hash of a file on disk.
 */
export function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Download `url` to `finalPath`, writing through a `.tmp` sibling file.
 *
 * Features:
 * - **Resume**: if a `.tmp` file already exists its size is used as the byte
 *   range start (`Range: bytes=N-`), so interrupted downloads continue instead
 *   of restarting from zero.
 * - **Checksum**: if `expectedSha256` is provided the completed file is
 *   verified before the atomic rename; a mismatch deletes the temp file and
 *   rejects the promise.
 * - **Redirect following**: Location headers are followed while preserving the
 *   Range header through the redirect chain.
 */
export function downloadFile(
  url: string,
  finalPath: string,
  expectedSha256?: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const tmpPath = finalPath + '.tmp';

  // How many bytes we already have from a previous (interrupted) download.
  const alreadyBytes = fs.existsSync(tmpPath) ? fs.statSync(tmpPath).size : 0;

  return new Promise((resolve, reject) => {
    let done = false;
    function fail(err: Error) {
      if (done) return;
      done = true;
      reject(err);
    }

    function doRequest(reqUrl: string, rangeStart: number): void {
      const headers: Record<string, string> = {};
      if (rangeStart > 0) {
        headers['Range'] = `bytes=${rangeStart}-`;
      }

      https.get(reqUrl, { headers }, (res: http.IncomingMessage) => {
        // Follow redirects, keeping the Range header.
        if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const location = res.headers.location;
          if (!location.startsWith('https://')) {
            fail(new Error(`Refusing non-HTTPS redirect to ${location}`));
            return;
          }
          doRequest(location, rangeStart);
          return;
        }

        // 206 = Partial Content (server honoured Range)
        // 200 = Full response (could be server ignoring Range, or fresh start)
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          fail(new Error(`Download failed: HTTP ${res.statusCode} for ${path.basename(reqUrl)}`));
          return;
        }

        // If we wanted a resume (rangeStart > 0) but got 200 back, server
        // ignored the Range header — restart from scratch.
        const effectiveStart = (res.statusCode === 206) ? rangeStart : 0;

        const contentLength = parseInt(res.headers['content-length'] ?? '0', 10);
        const totalBytes = contentLength > 0 ? effectiveStart + contentLength : 0;

        const file = fs.createWriteStream(tmpPath, {
          flags: effectiveStart > 0 ? 'a' : 'w',
        });
        file.on('error', fail);

        let transferredBytes = effectiveStart;

        res.on('data', (chunk: Buffer) => {
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

        res.on('end', () => {
          file.end(async () => {
            if (done) return;
            try {
              if (expectedSha256) {
                const actual = await computeSha256(tmpPath);
                if (actual !== expectedSha256) {
                  fs.unlinkSync(tmpPath);
                  fail(new Error(
                    `Checksum mismatch for ${path.basename(finalPath)}\n` +
                    `  expected: ${expectedSha256}\n` +
                    `  actual:   ${actual}\n` +
                    `The downloaded file may be corrupt. Please try again.`,
                  ));
                  return;
                }
              }
              fs.renameSync(tmpPath, finalPath);
              done = true;
              resolve();
            } catch (err) {
              fail(err as Error);
            }
          });
        });

        res.on('error', fail);
      }).on('error', fail);
    }

    doRequest(url, alreadyBytes);
  });
}
