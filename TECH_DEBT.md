# Tech Debt & Known Weaknesses

A candid assessment of the current codebase as of 2026-02-21.

---

## Critical / High Priority

### 1. No error boundary in the renderer
React does not wrap any subtree in an `<ErrorBoundary>`. A single uncaught render error crashes the
entire UI with a blank white screen and no recovery path for the user.

### 2. Audio pipeline sample rate mismatch
The `AudioContext` is created at 48 kHz (`sampleRate: 48000`) but Whisper expects 16 kHz audio.
The PCM worklet passes 48 kHz chunks directly to `SimpleVAD`, which feeds them to whisper.
Whisper apparently accepts this (possibly resampling internally), but the timestamps from the
`t0`/`t1` fields will be in Whisper's internal 16 kHz time base, while the real-world elapsed time
is measured in wall-clock seconds — causing a silent unit mismatch in speaker diarization
timestamp alignment.

### 3. Diarization timestamp alignment is approximate
`runDiarization` maps transcript segments to diarization segments by comparing
`(seg.timestamp - recordingStartTime) / 1000` against `[d.start, d.end]` in seconds.
However `seg.timestamp` is the wall-clock time the VAD *emitted* the segment, not when the speech
actually started. For long utterances this can be off by several seconds, leading to wrong speaker
labels.

### 4. `getFullAudioBuffer` accumulates both mic and system audio interleaved
Mic and system audio chunks are pushed into the same `audioAccumulator` in arrival order, which is
non-deterministic across two independent pipelines. The diarization model receives a scrambled
mono mix rather than a proper stereo or cleanly time-aligned mono signal.

### 5. Native addon `require()` path fragility (sherpa-onnx)
`sherpa-onnx` resolves its companion `.dylib` files via a relative path from the `.node` location.
After `electron-builder` repackages the app, the relative path inside `app.asar.unpacked/` must
exactly mirror `node_modules/`. This is achieved through `asarUnpack` patterns, but is fragile:
any pnpm hoisting change or package version bump can silently break dylib resolution at runtime
with a cryptic `dlopen` error.

---

## Medium Priority

### 6. Main process is CommonJS / Renderer is ESM — no unified type safety
`electron/` runs as CommonJS despite now being compiled from TypeScript. The `electron-api.d.ts`
type bridge is maintained by hand and can drift from the actual `ipcMain.handle` signatures in
`main.ts` and `preload.js` without any compile-time check.

### 7. `preload.js` is plain JS (not compiled from TypeScript)
Only `main.ts` and the services are TypeScript. `preload.js` is still vanilla JS, so the exposed
`window.electronAPI` surface is not type-checked against `electron-api.d.ts`. A misnamed or
missing parameter in `preload.js` only surfaces at runtime.

### 8. Whisper queue is in-memory and not bounded
`micHead` / `sysHead` is an unbounded promise chain. If speech is very frequent (e.g. continuous
talking), transcription requests pile up in memory. There is no backpressure, no queue depth limit,
and no way to discard stale segments.

### 9. Single `SimpleVAD` parameters, no UI exposure
VAD silence gap (800 ms) and max segment duration (30 s) are hard-coded constants. Users with
accents, unusual speaking pace, or noisy environments cannot tune them. This directly affects
transcription quality.

### 10. No persistence across app restarts
Transcript segments, speaker names, and diarization results exist only in React state. Closing and
reopening the app loses everything. There is no local database or file-backed session store.

### 11. Debug log panel always accumulates, never truncates
`debugInfo` in `use-audio-capture.ts` appends indefinitely. A long recording session with frequent
VAD events can accumulate thousands of lines, growing the React state unboundedly and causing
re-render performance degradation.

### 12. `initializeWhisper` called via IPC but `initializeDiarization` is called per-run
Whisper contexts are initialized once at startup and reused. The diarization context is initialized
fresh on every "Analyze speakers" click (loading the ONNX model from disk each time). This causes
a multi-second delay on every analysis and wastes memory on repeated loads.

### 13. No model integrity verification
Downloaded models are not checksummed or signed. A partial download, corrupted file, or
man-in-the-middle substitution will manifest as a cryptic whisper.node crash rather than a
user-friendly error.

### 14. `electron/preload.js` exposes `contextBridge.exposeInMainWorld` with no input sanitization
IPC handlers accept raw `folderPath` strings from the renderer. `save-markdown` in `main.ts` does
use `path.join()` but there is no check that the resolved path stays within the user-chosen output
directory (directory traversal if the renderer were compromised, though CSP limits practical risk).

---

## Low Priority / Polish

### 15. `author` field in `package.json` is empty
Electron-builder requires a non-empty `author` for macOS code signing metadata and the default
"About" panel. Currently blank.

### 16. Version is `1.0.0` with no release process
There is no `CHANGELOG`, no git tag strategy, and no automated version bump. The version in
`package.json` will become stale once the first real build is distributed.

### 17. No end-to-end or integration tests
Only `format-export.test.ts` and a VAD unit test exist. The entire audio pipeline, IPC layer,
Whisper integration, and diarization flow have zero automated coverage. Regressions require manual
testing.

### 18. `useTranscription` hook is growing too large
The hook now owns: recording state, IPC calls, VAD callbacks, RMS state, diarization state,
speaker names, and segment mutations. This makes it hard to reason about, test, or refactor. A
split into `useRecording`, `useDiarization`, and `useSegments` would improve maintainability.

### 19. Tailwind CSS v4 + shadcn/ui "new-york" style not fully verified
Tailwind v4 changed the config format significantly. The current setup uses `@import "tailwindcss"`
and a CSS-first config. Some shadcn/ui components may rely on v3 plugin conventions and could have
subtle styling regressions without a comprehensive visual test.

### 20. `getDisplayMedia` video track is disabled but not stopped
System audio capture grabs a video track (required by the browser to grant audio access), then sets
`track.enabled = false`. The video track still consumes resources and keeps the screen-recording
indicator active. It should be `track.stop()`-ed once audio is confirmed, with testing to confirm
audio continues.

### 21. No handling for audio context suspension
Browsers (and Electron) can auto-suspend `AudioContext` after inactivity or when the window loses
focus. There is no listener for `audioContext.onstatechange` to detect or recover from suspension,
which would silently stop transcription mid-meeting.

### 22. Diarization model download has no resume support
If the network drops mid-download, the `.tmp` file is left on disk and the download must restart
from byte 0. Large models (segmentation model is ~17 MB, embedding model ~30 MB) make this
annoying on flaky connections.

---

## Architecture Observations

- The two-whisper-context design (one for mic, one for system) is clever but doubles memory usage.
  For a single-speaker mic-only session this is unnecessary overhead.
- The `float32ToArrayBuffer` round-trip (Float32 → Int16 in whisper-service) should be documented;
  the renderer accumulates Float32, but whisper expects Int16. This conversion is easy to miss when
  adding new audio paths.
- `sherpa-onnx-node` and `@fugood/whisper.node` are both unofficial/community packages with no
  guaranteed maintenance track record. A vendor lock-in risk if either becomes unmaintained.
