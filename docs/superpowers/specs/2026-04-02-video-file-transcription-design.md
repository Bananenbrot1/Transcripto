# Video File Transcription

Enable transcription of local video files by extracting audio via ffmpeg and feeding it into the existing Whisper transcription pipeline.

## Dependencies

- `ffmpeg-static` — bundled platform-specific ffmpeg binary
- `fluent-ffmpeg` — Node.js wrapper for ffmpeg with clean streaming API
- `@types/fluent-ffmpeg` — TypeScript definitions

## Architecture

### New Service: `electron/services/video-extract-service.ts`

Responsible for extracting audio from video files using ffmpeg.

**Exports:**
- `extractAudio(videoPath: string): Promise<string>` — extracts audio from a video file, returns path to a temp 16kHz mono WAV file
- `cleanupTempAudio(): void` — removes any temp WAV files created during extraction

**Behavior:**
- Uses `fluent-ffmpeg` pointed at the `ffmpeg-static` binary path
- Outputs to `app.getPath('temp')/transcripto-session/` (same temp directory used by `audio-file-service.ts`)
- Converts to 16kHz mono WAV — exactly what the Whisper pipeline expects
- Temp files are cleaned up after transcription completes and on app `before-quit`

### Modified IPC: `select-audio-file` handler in `electron/main.ts`

**File dialog filter changes:**
- Audio formats: `.mp3, .wav, .m4a, .ogg, .flac, .wma, .aac, .webm`
- Video formats (new): `.mp4, .mkv, .mov, .avi, .webm, .flv, .wmv`
- Single unified filter group labeled "Audio & Video Files"

**Flow change:**
- After file selection, check extension against a `VIDEO_EXTENSIONS` set
- If video: call `extractAudio()` to get a temp WAV, then read the WAV as the returned audio data
- If audio: keep existing behavior (read raw file bytes directly)

### Modified Renderer: `src/hooks/use-file-import.ts`

**New state in `FileImportState`:**
- Add `'extracting'` state between file selection and `'decoding'`
- Displayed as "Extracting audio..." in the UI progress indicator

**No other renderer changes required** — the main process handles extraction transparently and returns audio data in the same format regardless of source.

### Format Detection

Simple extension-based check in the main process:

```typescript
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.wmv']);
```

If the file extension is in this set, route through `extractAudio()` before returning data to the renderer.

## Error Handling

- **FFmpeg extraction failure** (corrupt file, unsupported codec): return descriptive error to renderer via existing IPC error path
- **No audio track in video**: ffmpeg will error — catch and surface "No audio track found in video file"
- **Temp file cleanup**: happens in `finally` block after transcription and on app `before-quit` event

## Packaging (Electron Builder)

The `ffmpeg-static` binary must not be trapped inside the asar archive. Configure in `electron-builder.yml`:

- Add `ffmpeg-static` binary path to `asarUnpack` or `extraResources` so it remains executable in the packaged app

## Files to Create/Modify

| File | Action |
|------|--------|
| `electron/services/video-extract-service.ts` | Create — ffmpeg audio extraction service |
| `electron/main.ts` | Modify — expand file dialog filters, add video detection + extraction step |
| `src/hooks/use-file-import.ts` | Modify — add `'extracting'` state to `FileImportState` |
| `electron-builder.yml` | Modify — ensure ffmpeg binary is unpacked from asar |
| `package.json` | Modify — add `ffmpeg-static`, `fluent-ffmpeg`, `@types/fluent-ffmpeg` |
| UI components showing file import state | Modify — handle new `'extracting'` state label |
