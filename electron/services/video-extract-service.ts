import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

export const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.wmv',
]);

const SESSION_DIR_NAME = 'transcripto-session';

function getTempDir(): string {
  return path.join(app.getPath('temp'), SESSION_DIR_NAME);
}

export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Extract audio from a video file as 16kHz mono WAV.
 * Spawns the bundled ffmpeg binary directly via child_process.execFile.
 * Returns the path to the temporary WAV file.
 */
export function extractAudio(videoPath: string): Promise<string> {
  const ffmpegPath = ffmpegStatic;
  if (!ffmpegPath) {
    return Promise.reject(new Error('ffmpeg binary not found'));
  }

  const tempDir = getTempDir();
  fs.mkdirSync(tempDir, { recursive: true });

  const outputPath = path.join(tempDir, `extracted-audio-${Date.now()}.wav`);

  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      ['-i', videoPath, '-vn', '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', outputPath, '-y'],
      (_error, _stdout, stderr) => {
        // ffmpeg exits non-zero even on success sometimes; check output file instead
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve(outputPath);
        } else if (stderr.includes('does not contain any stream') ||
                   stderr.includes('Output file is empty') ||
                   stderr.includes('Invalid data found')) {
          reject(new Error('No audio track found in video file'));
        } else {
          reject(new Error(`Failed to extract audio: ${stderr.slice(-300)}`));
        }
      },
    );
  });
}

/**
 * Remove temporary extracted audio files.
 */
export function cleanupExtractedAudio(): void {
  const tempDir = getTempDir();
  if (!fs.existsSync(tempDir)) return;

  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      if (file.startsWith('extracted-audio-') && file.endsWith('.wav')) {
        fs.unlinkSync(path.join(tempDir, file));
      }
    }
  } catch (err) {
    console.warn('[video-extract] cleanup error:', err);
  }
}
