import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SESSION_DIR_NAME = 'transcripto-session';

function getSessionDir(): string {
  return path.join(app.getPath('temp'), SESSION_DIR_NAME);
}

let micPath = '';
let sysPath = '';
let micStream: fs.WriteStream | null = null;
let sysStream: fs.WriteStream | null = null;

export function cleanup(): void {
  // Close any open streams first
  micStream?.destroy();
  sysStream?.destroy();
  micStream = null;
  sysStream = null;

  for (const p of [micPath, sysPath]) {
    if (p && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (err) {
        console.warn(`[audio-file-service] cleanup: failed to delete ${p}:`, err);
      }
    }
  }
  micPath = '';
  sysPath = '';
}

export function openRecording(): void {
  cleanup();

  const dir = getSessionDir();
  fs.mkdirSync(dir, { recursive: true });

  micPath = path.join(dir, 'mic-session.f32');
  sysPath = path.join(dir, 'sys-session.f32');

  micStream = fs.createWriteStream(micPath);
  sysStream = fs.createWriteStream(sysPath);
  micStream.on('error', (err) => console.error('[audio-file-service] mic write error:', err));
  sysStream.on('error', (err) => console.error('[audio-file-service] sys write error:', err));
}

export function appendChunk(source: 'mic' | 'sys', buf: Buffer): void {
  const stream = source === 'mic' ? micStream : sysStream;
  if (stream && !stream.destroyed) {
    stream.write(buf);
  }
}

/**
 * Persist a fully decoded 16kHz mono Float32Array to the mic-session path so
 * the existing diarize handler can read it. Used by the file-import IPC
 * handlers (transcribe-file, transcribe-video-file) — these do not stream
 * audio chunk-by-chunk, they have the whole buffer in hand, so we write it
 * once and let cleanup() handle deletion when diarization finishes or the
 * transcript is dismissed. sysPath stays empty because file imports have no
 * system audio.
 */
export function openImport(samples: Float32Array): void {
  cleanup();

  const dir = getSessionDir();
  fs.mkdirSync(dir, { recursive: true });

  micPath = path.join(dir, 'mic-session.f32');
  sysPath = '';

  fs.writeFileSync(
    micPath,
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
  );
}

export function closeRecording(): Promise<{ micPath: string; sysPath: string }> {
  return new Promise((resolve, reject) => {
    let pending = 0;
    let error: Error | null = null;

    const done = () => {
      pending--;
      if (pending === 0) {
        micStream = null;
        sysStream = null;
        if (error) reject(error);
        else resolve({ micPath, sysPath });
      }
    };

    const streams = [micStream, sysStream].filter(Boolean) as fs.WriteStream[];
    if (streams.length === 0) {
      resolve({ micPath, sysPath });
      return;
    }

    pending = streams.length;
    for (const stream of streams) {
      stream.end((err?: Error | null) => {
        if (err) error = err;
        done();
      });
    }
  });
}

export function getPaths(): { micPath: string; sysPath: string } {
  // Derive paths from the deterministic session directory so they survive an
  // Electron restart — the in-memory micPath/sysPath are reset on every
  // process boot, but the temp PCM files may still be on disk from a prior
  // openRecording() or openImport(). Both writers use the same filenames.
  const dir = getSessionDir();
  const micCandidate = path.join(dir, 'mic-session.f32');
  const sysCandidate = path.join(dir, 'sys-session.f32');
  return {
    micPath: micPath || (fs.existsSync(micCandidate) ? micCandidate : ''),
    sysPath: sysPath || (fs.existsSync(sysCandidate) ? sysCandidate : ''),
  };
}
