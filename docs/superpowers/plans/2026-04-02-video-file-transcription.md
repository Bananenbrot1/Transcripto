# Video File Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable transcription of local video files by extracting audio via bundled ffmpeg and feeding it into the existing Whisper/Parakeet transcription pipeline.

**Architecture:** Add a `video-extract-service.ts` in the main process that uses `fluent-ffmpeg` + `ffmpeg-static` to convert video files to 16kHz mono WAV. The existing `select-audio-file` IPC handler is expanded to accept video formats and transparently extracts audio before returning data to the renderer. The renderer gets a new `'extracting'` state in `FileImportState`.

**Tech Stack:** `ffmpeg-static`, `fluent-ffmpeg`, `@types/fluent-ffmpeg`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add ffmpeg-static, fluent-ffmpeg, @types/fluent-ffmpeg |
| `electron/services/video-extract-service.ts` | Create | Extract audio from video files via ffmpeg |
| `electron/services/video-extract-service.test.ts` | Create | Tests for the extraction service |
| `electron/main.ts` | Modify | Expand file dialog, add video detection + extraction step, cleanup on quit |
| `electron/ipc-types.ts` | Modify | Add `selectAudioFile` return type to include `isVideo` flag for UI state |
| `electron/preload.ts` | No change | Already wired for `selectAudioFile` |
| `src/hooks/use-file-import.ts` | Modify | Add `'extracting'` state to `FileImportState` |
| `src/App.tsx` | Modify | Handle `'extracting'` state in UI, update button title/icon |
| `electron-builder.yml` | Modify | Unpack ffmpeg-static binary from asar |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install ffmpeg-static, fluent-ffmpeg, and types**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm add ffmpeg-static fluent-ffmpeg
pnpm add -D @types/fluent-ffmpeg
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/maxkirschning/Development/transcripto
node -e "console.log(require('ffmpeg-static'))"
```

Expected: prints the path to the ffmpeg binary (e.g., `/Users/.../node_modules/ffmpeg-static/ffmpeg`)

- [ ] **Step 3: Add ffmpeg-static to pnpm onlyBuiltDependencies**

In `package.json`, add `"ffmpeg-static"` to the `pnpm.onlyBuiltDependencies` array so the platform-specific binary is downloaded during install:

```json
"onlyBuiltDependencies": [
  "electron",
  "esbuild",
  "@fugood/whisper.node",
  "ffmpeg-static"
]
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add ffmpeg-static and fluent-ffmpeg dependencies"
```

---

### Task 2: Create video-extract-service with tests

**Files:**
- Create: `electron/services/video-extract-service.ts`
- Create: `electron/services/video-extract-service.test.ts`

- [ ] **Step 1: Write the test file**

Create `electron/services/video-extract-service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isVideoFile, VIDEO_EXTENSIONS } from './video-extract-service';

describe('video-extract-service', () => {
  describe('VIDEO_EXTENSIONS', () => {
    it('contains expected video formats', () => {
      expect(VIDEO_EXTENSIONS.has('.mp4')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.mkv')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.mov')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.avi')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.webm')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.flv')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.wmv')).toBe(true);
    });

    it('does not contain audio-only formats', () => {
      expect(VIDEO_EXTENSIONS.has('.mp3')).toBe(false);
      expect(VIDEO_EXTENSIONS.has('.wav')).toBe(false);
      expect(VIDEO_EXTENSIONS.has('.flac')).toBe(false);
    });
  });

  describe('isVideoFile', () => {
    it('returns true for video extensions', () => {
      expect(isVideoFile('movie.mp4')).toBe(true);
      expect(isVideoFile('recording.mkv')).toBe(true);
      expect(isVideoFile('clip.MOV')).toBe(true);
    });

    it('returns false for audio extensions', () => {
      expect(isVideoFile('song.mp3')).toBe(false);
      expect(isVideoFile('audio.wav')).toBe(false);
    });

    it('handles paths with directories', () => {
      expect(isVideoFile('/Users/max/Videos/recording.mp4')).toBe(true);
      expect(isVideoFile('/Users/max/Music/song.mp3')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isVideoFile('file.MP4')).toBe(true);
      expect(isVideoFile('file.Mkv')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm exec vitest run electron/services/video-extract-service.test.ts
```

Expected: FAIL — module `./video-extract-service` not found.

- [ ] **Step 3: Write the video-extract-service implementation**

Create `electron/services/video-extract-service.ts`:

```typescript
import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// Point fluent-ffmpeg at the bundled binary.
// In packaged builds the binary lives in app.asar.unpacked/node_modules/ffmpeg-static/
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

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
 * Returns the path to the temporary WAV file.
 */
export function extractAudio(videoPath: string): Promise<string> {
  const tempDir = getTempDir();
  fs.mkdirSync(tempDir, { recursive: true });

  const outputPath = path.join(tempDir, `extracted-audio-${Date.now()}.wav`);

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .output(outputPath)
      .on('error', (err: Error) => {
        // Check for common "no audio stream" error
        if (err.message.includes('does not contain any stream') ||
            err.message.includes('Output file is empty')) {
          reject(new Error('No audio track found in video file'));
        } else {
          reject(new Error(`Failed to extract audio: ${err.message}`));
        }
      })
      .on('end', () => resolve(outputPath))
      .run();
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm exec vitest run electron/services/video-extract-service.test.ts
```

Expected: all tests PASS. Note: the `extractAudio` function requires Electron's `app` module and ffmpeg, so it's tested via integration in Task 4. Unit tests here cover the pure utility functions.

- [ ] **Step 5: Commit**

```bash
git add electron/services/video-extract-service.ts electron/services/video-extract-service.test.ts
git commit -m "feat: add video-extract-service with ffmpeg audio extraction"
```

---

### Task 3: Expand file dialog and wire extraction in main process

**Files:**
- Modify: `electron/main.ts:230-244`

- [ ] **Step 1: Add import for video-extract-service**

At the top of `electron/main.ts`, after the existing service imports (line 11), add:

```typescript
import * as videoExtractService from './services/video-extract-service.js';
```

- [ ] **Step 2: Modify the `select-audio-file` IPC handler**

Replace the `select-audio-file` handler (lines 230-244) with:

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

    let audioFilePath: string;
    let needsCleanup = false;

    if (videoExtractService.isVideoFile(filePath)) {
      // Extract audio from video to a temp WAV
      audioFilePath = await videoExtractService.extractAudio(filePath);
      needsCleanup = true;
    } else {
      audioFilePath = filePath;
    }

    try {
      const fileBuffer = fs.readFileSync(audioFilePath);
      const data = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
      );
      return { fileName, data, isVideo: needsCleanup };
    } finally {
      if (needsCleanup) {
        try { fs.unlinkSync(audioFilePath); } catch {}
      }
    }
  });
```

- [ ] **Step 3: Add cleanup on app quit**

In `electron/main.ts`, in the existing `before-quit` handler (line 322-325), add the video extraction cleanup:

```typescript
app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  audioFileService.cleanup();
  videoExtractService.cleanupExtractedAudio();
});
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm exec tsc -p tsconfig.electron.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: expand file dialog to accept video files and extract audio via ffmpeg"
```

---

### Task 4: Update IPC types and preload for isVideo flag

**Files:**
- Modify: `electron/ipc-types.ts:76`
- Modify: `src/types/electron-api.d.ts` (if it exists and mirrors ipc-types)

- [ ] **Step 1: Update the selectAudioFile return type in ipc-types.ts**

In `electron/ipc-types.ts`, change line 76 from:

```typescript
  selectAudioFile: () => Promise<{ fileName: string; data: ArrayBuffer } | null>;
```

to:

```typescript
  selectAudioFile: () => Promise<{ fileName: string; data: ArrayBuffer; isVideo?: boolean } | null>;
```

- [ ] **Step 2: Check and update the renderer-side type declaration**

Check if `src/types/electron-api.d.ts` has a duplicate type definition. If it does, update `selectAudioFile` there to match:

```typescript
  selectAudioFile: () => Promise<{ fileName: string; data: ArrayBuffer; isVideo?: boolean } | null>;
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc-types.ts src/types/electron-api.d.ts
git commit -m "feat: add isVideo flag to selectAudioFile return type"
```

---

### Task 5: Add 'extracting' state to use-file-import hook

**Files:**
- Modify: `src/hooks/use-file-import.ts:5,71-95`

- [ ] **Step 1: Add 'extracting' to FileImportState**

In `src/hooks/use-file-import.ts`, change line 5 from:

```typescript
export type FileImportState = 'idle' | 'decoding' | 'transcribing' | 'done' | 'error';
```

to:

```typescript
export type FileImportState = 'idle' | 'extracting' | 'decoding' | 'transcribing' | 'done' | 'error';
```

- [ ] **Step 2: Update importFile to handle isVideo and set extracting state**

In the `importFile` callback, after `const selected = await window.electronAPI.selectAudioFile();` and `if (!selected) return;`, replace the destructuring and state-setting block (lines 77-86) with:

```typescript
      const { fileName, data, isVideo } = selected;
      const titleFromFile = fileName.replace(/\.[^.]+$/, '');
      onTitleReady(titleFromFile);
      onImportStart();

      // Show 'extracting' briefly for video files (extraction already happened in main process,
      // but the file may be large and decoding takes longer for extracted WAVs)
      if (isVideo) {
        setFileImportState('extracting');
      } else {
        setFileImportState('decoding');
      }
      setErrorMessage('');
      setFileProgress(null);
      segmentCounterRef.current = 0;
```

Then, right before the `// Resample to 16kHz mono` comment (after `audioBuffer` is decoded, around line 100), add the state transition:

```typescript
      // If we were in 'extracting' state, move to 'decoding' is already done — now set to decoding complete
      setFileImportState('decoding');
```

Wait — actually since extraction already happened on the main process side, the renderer receives WAV data either way. The `extracting` state is really to show the user that something is happening. Let me simplify:

Replace the entire `importFile` callback body with:

```typescript
    try {
      // Open native file picker via main process
      const selected = await window.electronAPI.selectAudioFile();
      if (!selected) return;

      const { fileName, data, isVideo } = selected;
      const titleFromFile = fileName.replace(/\.[^.]+$/, '');
      onTitleReady(titleFromFile);
      onImportStart();

      setFileImportState(isVideo ? 'extracting' : 'decoding');
      setErrorMessage('');
      setFileProgress(null);
      segmentCounterRef.current = 0;

      // Decode audio using Web Audio API
      setFileImportState('decoding');
      const audioCtx = new AudioContext();
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(data.slice(0));
      } finally {
        await audioCtx.close();
      }

      const duration = audioBuffer.duration;
      setFileDurationSec(duration);

      // Resample to 16kHz mono
      const pcm16k = resampleTo16kMono(audioBuffer);

      setFileImportState('transcribing');

      // Subscribe to progress events
      const unsubscribe = window.electronAPI.onTranscribeFileProgress((progress) => {
        setFileProgress(progress);
        if (progress.newSegments.length > 0) {
          const transcriptSegs = transcribeSegmentsToTranscript(progress.newSegments, segmentCounterRef);
          onSegmentsBatch(transcriptSegs);
        }
      });

      try {
        await window.electronAPI.transcribeFile(pcm16k.buffer as ArrayBuffer, languageRef.current, duration);
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
```

Note: The `extracting` state flashes briefly because `selectAudioFile` does the extraction in the main process before returning. For a better UX, see the refinement in Step 3.

- [ ] **Step 3: Make extraction happen asynchronously with proper state feedback**

Actually, the current `selectAudioFile` IPC call blocks until extraction is done (it happens in the main process). So the user sees nothing until it returns. To show an "Extracting audio..." state, we need to split the flow:

Option A (simpler, chosen): Show `extracting` state *before* calling `selectAudioFile` is not possible since we don't know it's a video yet. Instead, accept that `selectAudioFile` blocks during extraction. The `isVideo` flag can still be used to briefly show the `extracting` label after it returns, right before decoding starts. This provides a visual cue even if brief.

Keep the implementation from Step 2 as-is — for video files the state briefly shows "Extracting audio..." then transitions to "Decoding audio...". The extraction time is folded into the `selectAudioFile` call. This is the simplest approach.

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-file-import.ts
git commit -m "feat: add extracting state to file import for video files"
```

---

### Task 6: Update UI to show 'extracting' state

**Files:**
- Modify: `src/App.tsx:450,478-496,524-532`

- [ ] **Step 1: Update isFileBusy to include extracting state**

In `src/App.tsx`, change line 450 from:

```typescript
  const isFileBusy = fileImportState === 'decoding' || fileImportState === 'transcribing';
```

to:

```typescript
  const isFileBusy = fileImportState === 'extracting' || fileImportState === 'decoding' || fileImportState === 'transcribing';
```

- [ ] **Step 2: Add extracting state display in header**

In `src/App.tsx`, before the existing `{fileImportState === 'decoding' && (` block (line 478), add:

```tsx
            {fileImportState === 'extracting' && (
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" />
                Extracting audio...
              </span>
            )}
```

- [ ] **Step 3: Update import button disabled state and title**

In `src/App.tsx`, change the import button's `disabled` prop (line 528) from:

```tsx
              disabled={recordingState !== 'idle' || fileImportState === 'decoding' || fileImportState === 'transcribing'}
```

to:

```tsx
              disabled={recordingState !== 'idle' || isFileBusy}
```

And change the `title` (line 529) from:

```tsx
              title="Import audio file"
```

to:

```tsx
              title="Import audio or video file"
```

- [ ] **Step 4: Update the FileAudio icon import to include FileVideo (optional)**

If you want to show a different icon, you can import `FileVideo` from lucide-react and use it. However, keeping `FileAudio` is fine since the button handles both. Skip this step — keep the existing icon.

- [ ] **Step 5: Verify it compiles**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: show extracting state in UI for video file imports"
```

---

### Task 7: Configure electron-builder for ffmpeg-static binary

**Files:**
- Modify: `electron-builder.yml:23-27`

- [ ] **Step 1: Add ffmpeg-static to asarUnpack**

In `electron-builder.yml`, add `ffmpeg-static` to the `asarUnpack` list:

```yaml
asarUnpack:
  - "**/*.node"
  - "**/*.dylib"
  - "node_modules/sherpa-onnx-darwin-arm64/**"
  - "node_modules/@fugood/node-whisper-darwin-arm64/**"
  - "node_modules/ffmpeg-static/**"
```

- [ ] **Step 2: Verify the build still works**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm build
```

Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "chore: unpack ffmpeg-static binary from asar archive"
```

---

### Task 8: Manual integration test

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm dev
```

- [ ] **Step 2: Test audio file import (regression)**

1. Click the import button
2. Select an audio file (e.g., `.mp3` or `.wav`)
3. Verify it still decodes and transcribes as before

- [ ] **Step 3: Test video file import**

1. Click the import button
2. Verify the file dialog now shows "Audio & Video Files" and accepts `.mp4`, `.mkv`, etc.
3. Select a video file (e.g., an `.mp4` with spoken audio)
4. Verify "Extracting audio..." appears briefly in the header
5. Verify "Decoding audio..." then "Transcribing..." appear as normal
6. Verify transcription completes with correct text

- [ ] **Step 4: Test video with no audio track**

1. If you have a video file with no audio track, try importing it
2. Verify an error message like "No audio track found in video file" appears

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/maxkirschning/Development/transcripto
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration test fixes for video file transcription"
```
