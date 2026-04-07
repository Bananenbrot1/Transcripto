# Video Transcription OOM Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix OOM crashes when transcribing long videos by keeping extracted audio on disk and bypassing the renderer for the large buffer entirely.

**Architecture:** Today `select-audio-file` reads the entire extracted WAV into an `ArrayBuffer` and sends it to the renderer, which then decodes, resamples, and sends it back — 4–6 full copies of hundreds of MB for a 1-hour video. The fix changes the video path so `select-audio-file` returns only a temp file **path** (a string). A new `transcribe-video-file` IPC handler in the main process reads the WAV, converts int16→float32, and calls the transcription service directly — the renderer never touches the large buffer. The audio-file path (non-video) is unchanged.

**Tech Stack:** Node.js `fs`, `Int16Array`, `Float32Array` — no new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/services/video-extract-service.ts` | Modify | Export `WAV_HEADER_BYTES` constant and `wavToFloat32(buf)` helper |
| `electron/services/video-extract-service.test.ts` | Modify | Tests for `wavToFloat32` |
| `electron/ipc-types.ts` | Modify | `selectAudioFile` becomes a discriminated union; add `transcribeVideoFile` to `ElectronAPI` |
| `electron/preload.ts` | Modify | Expose `transcribeVideoFile` via `contextBridge` |
| `electron/main.ts` | Modify | `select-audio-file` returns `tempWavPath` for video; new `transcribe-video-file` handler |
| `src/hooks/use-file-import.ts` | Modify | Video branch calls `transcribeVideoFile(tempWavPath, lang)`, skipping decode/resample |

---

### Task 1: Add `wavToFloat32` to video-extract-service

**Files:**
- Modify: `electron/services/video-extract-service.ts`
- Modify: `electron/services/video-extract-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of the `describe` block in `electron/services/video-extract-service.test.ts`:

```typescript
import { isVideoFile, VIDEO_EXTENSIONS, extractAudio, cleanupExtractedAudio, wavToFloat32, WAV_HEADER_BYTES } from './video-extract-service';

// (replace the existing import at line 13 with the one above)

describe('wavToFloat32', () => {
  function makeWavBuffer(int16Samples: number[]): Buffer {
    const header = Buffer.alloc(WAV_HEADER_BYTES, 0);
    const sampleBuf = Buffer.from(new Int16Array(int16Samples).buffer);
    return Buffer.concat([header, sampleBuf]);
  }

  it('converts int16 samples to normalized float32', () => {
    const wav = makeWavBuffer([0, 32767, -32768, 16384]);
    const { samples, durationSec } = wavToFloat32(wav);

    expect(samples.length).toBe(4);
    expect(samples[0]).toBeCloseTo(0.0, 5);
    expect(samples[1]).toBeCloseTo(32767 / 32768, 4);
    expect(samples[2]).toBeCloseTo(-1.0, 4);
    expect(samples[3]).toBeCloseTo(16384 / 32768, 4);
    expect(durationSec).toBeCloseTo(4 / 16000, 8);
  });

  it('returns empty samples for a header-only buffer', () => {
    const headerOnly = Buffer.alloc(WAV_HEADER_BYTES, 0);
    const { samples, durationSec } = wavToFloat32(headerOnly);

    expect(samples.length).toBe(0);
    expect(durationSec).toBe(0);
  });

  it('returns empty samples when buffer is smaller than header', () => {
    const tooSmall = Buffer.alloc(10, 0);
    const { samples, durationSec } = wavToFloat32(tooSmall);

    expect(samples.length).toBe(0);
    expect(durationSec).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm exec vitest run electron/services/video-extract-service.test.ts
```

Expected: FAIL — `wavToFloat32` is not exported.

- [ ] **Step 3: Implement `WAV_HEADER_BYTES` and `wavToFloat32`**

Add to the end of `electron/services/video-extract-service.ts` (before the final newline):

```typescript
/**
 * Number of bytes in a standard PCM WAV header produced by ffmpeg.
 * All extracted WAVs use pcm_s16le with a plain 44-byte RIFF header.
 */
export const WAV_HEADER_BYTES = 44;

/**
 * Convert a 16kHz mono PCM int16 WAV Buffer (from ffmpeg extraction) to a
 * Float32Array of normalized samples in [-1, 1] plus the duration in seconds.
 *
 * The first WAV_HEADER_BYTES bytes are the RIFF header and are skipped.
 */
export function wavToFloat32(wavBuffer: Buffer): { samples: Float32Array; durationSec: number } {
  const sampleBytes = wavBuffer.byteLength - WAV_HEADER_BYTES;
  if (sampleBytes <= 0) {
    return { samples: new Float32Array(0), durationSec: 0 };
  }
  const numSamples = Math.floor(sampleBytes / 2);
  const int16 = new Int16Array(
    wavBuffer.buffer,
    wavBuffer.byteOffset + WAV_HEADER_BYTES,
    numSamples,
  );
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = int16[i] / 32768.0;
  }
  return { samples, durationSec: numSamples / 16000 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run electron/services/video-extract-service.test.ts
```

Expected: all tests pass (including pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add electron/services/video-extract-service.ts electron/services/video-extract-service.test.ts
git commit -m "feat: add wavToFloat32 helper to video-extract-service"
```

---

### Task 2: Update IPC types and preload

**Files:**
- Modify: `electron/ipc-types.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Update `selectAudioFile` return type and add `transcribeVideoFile` in `ipc-types.ts`**

Replace line 76 in `electron/ipc-types.ts`:
```typescript
  selectAudioFile: () => Promise<{ fileName: string; data: ArrayBuffer; isVideo?: boolean } | null>;
```
With:
```typescript
  selectAudioFile: () => Promise<
    | { fileName: string; data: ArrayBuffer; isVideo: false }
    | { fileName: string; tempWavPath: string; isVideo: true }
    | null
  >;
  transcribeVideoFile: (tempWavPath: string, language: string) => Promise<TranscribeResult>;
```

- [ ] **Step 2: Expose `transcribeVideoFile` in `electron/preload.ts`**

After the `selectAudioFile` line (line 95), add:
```typescript
  transcribeVideoFile: (tempWavPath: string, language: string) =>
    ipcRenderer.invoke('transcribe-video-file', tempWavPath, language),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm exec tsc --project tsconfig.electron.json --noEmit
```

Expected: no errors.

Also check the renderer side:
```bash
pnpm exec tsc --noEmit
```

Expected: no errors (the renderer now sees the discriminated union).

- [ ] **Step 4: Commit**

```bash
git add electron/ipc-types.ts electron/preload.ts
git commit -m "feat: add transcribeVideoFile IPC type and preload binding"
```

---

### Task 3: Update `select-audio-file` and add `transcribe-video-file` in main.ts

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Update the `select-audio-file` handler**

In `electron/main.ts`, replace the entire `select-audio-file` handler (lines 231–269) with:

```typescript
  ipcMain.handle('select-audio-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Audio & Video Files', extensions: [
          'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac',
          'mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv',
        ]},
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);

    if (videoExtractService.isVideoFile(filePath)) {
      const tempWavPath = await videoExtractService.extractAudio(filePath);
      return { fileName, tempWavPath, isVideo: true as const };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const data = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
    return { fileName, data, isVideo: false as const };
  });
```

- [ ] **Step 2: Add the `transcribe-video-file` handler**

Immediately after the `select-audio-file` handler (before the `diarize` handler), add:

```typescript
  ipcMain.handle('transcribe-video-file', async (event, tempWavPath: string, language: string) => {
    console.log(`[main] IPC transcribe-video-file: lang=${language}, engine=${activeEngine}, path=${tempWavPath}`);
    try {
      const fileBuffer = fs.readFileSync(tempWavPath);
      const { samples, durationSec } = videoExtractService.wavToFloat32(fileBuffer);
      console.log(`[main] IPC transcribe-video-file: duration=${durationSec.toFixed(1)}s, samples=${samples.length}`);
      const service = activeEngine === 'parakeet' ? parakeetService : whisperService;
      const result = await service.transcribeFile(samples.buffer as ArrayBuffer, language, durationSec, (progress) => {
        event.sender.send('transcribe-file-progress', progress);
      });
      console.log(`[main] IPC transcribe-video-file done: segments=${result.segments.length}`);
      return result;
    } catch (err) {
      console.error('[main] IPC transcribe-video-file error:', err);
      throw err;
    } finally {
      try { fs.unlinkSync(tempWavPath); } catch {}
    }
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm exec tsc --project tsconfig.electron.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: bypass renderer for video transcription, add transcribe-video-file IPC"
```

---

### Task 4: Update `use-file-import.ts` renderer hook

**Files:**
- Modify: `src/hooks/use-file-import.ts`

- [ ] **Step 1: Replace the `importFile` callback body**

Replace the entire `importFile` callback (lines 71–127) in `src/hooks/use-file-import.ts` with:

```typescript
  const importFile = useCallback(async () => {
    try {
      const selected = await window.electronAPI.selectAudioFile();
      if (!selected) return;

      const { fileName, isVideo } = selected;
      const titleFromFile = fileName.replace(/\.[^.]+$/, '');
      onTitleReady(titleFromFile);
      onImportStart();
      setErrorMessage('');
      setFileProgress(null);
      segmentCounterRef.current = 0;

      const unsubscribe = window.electronAPI.onTranscribeFileProgress((progress) => {
        setFileProgress(progress);
        if (progress.newSegments.length > 0) {
          const transcriptSegs = transcribeSegmentsToTranscript(progress.newSegments, segmentCounterRef);
          onSegmentsBatch(transcriptSegs);
        }
      });

      try {
        if (isVideo) {
          // Video: extraction already done in main process — transcribe directly without
          // loading the audio buffer into renderer memory.
          setFileImportState('transcribing');
          await window.electronAPI.transcribeVideoFile(selected.tempWavPath, languageRef.current);
        } else {
          // Audio: decode and resample in renderer, then send to main for transcription.
          setFileImportState('decoding');
          const audioCtx = new AudioContext();
          let audioBuffer: AudioBuffer;
          try {
            audioBuffer = await audioCtx.decodeAudioData(selected.data.slice(0));
          } finally {
            await audioCtx.close();
          }
          const duration = audioBuffer.duration;
          setFileDurationSec(duration);
          const pcm16k = resampleTo16kMono(audioBuffer);
          setFileImportState('transcribing');
          await window.electronAPI.transcribeFile(pcm16k.buffer as ArrayBuffer, languageRef.current, duration);
        }
      } finally {
        unsubscribe();
      }

      setFileImportState('done');
      onComplete();
    } catch (err) {
      console.error('[file-import] Error:', err);
      setErrorMessage((err as Error).message);
      setFileImportState('error');
    }
  }, [onImportStart, onSegmentsBatch, onTitleReady, onComplete]);
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Verify TypeScript compiles (renderer)**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-file-import.ts
git commit -m "fix: skip renderer buffer for video files, eliminating OOM crash on long videos"
```

---

## Verification

After all tasks are complete, the memory profile for a 1-hour video should look like:

| Step | Old peak | New peak |
|------|----------|----------|
| Main: WAV in memory | ~115 MB | ~115 MB (unavoidable) |
| Renderer: decoded AudioBuffer | ~230 MB | **0 MB** |
| Renderer: resampled Float32 | ~230 MB | **0 MB** |
| IPC Renderer→Main | ~230 MB | **0 MB** |
| **Total** | **~800+ MB** | **~115 MB** |

To manually test, import a video >30 minutes long, open DevTools → Memory tab, and verify heap stays flat during transcription (all the work is in the main process, invisible to the renderer heap).
