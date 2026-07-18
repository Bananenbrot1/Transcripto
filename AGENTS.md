# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

Transcripto is a macOS Electron desktop app for real-time speech-to-text transcription using local Whisper models. It captures both microphone and system audio simultaneously, detects speech segments via a custom VAD (Voice Activity Detection), and transcribes them locally using `@fugood/whisper.node`.

## Commands

- **Dev:** `pnpm dev` — starts Vite dev server + Electron concurrently
- **Build:** `pnpm build` — TypeScript check + Vite production build
- **Run production:** `pnpm start` — builds then launches Electron
- **Tests:** `pnpm test` — runs Vitest once
- **Tests (watch):** `pnpm test:watch` — runs Vitest in watch mode
- **Single test:** `pnpm exec vitest run src/lib/vad.test.ts`
- **Package manager:** pnpm (v10.27.0)

## Architecture

### Two-process split (Electron main vs renderer)

- **Main process** (`electron/`) — plain CommonJS JavaScript (not TypeScript). Manages Whisper model lifecycle and IPC handlers.
- **Renderer process** (`src/`) — React + TypeScript + Vite. All UI, audio capture, and VAD logic runs here.
- **Bridge** (`electron/preload.js`) — exposes `window.electronAPI` via `contextBridge`. All IPC channels are defined here and typed in `src/types/electron-api.d.ts`.

### Audio pipeline (renderer side)

1. `useAudioCapture` hook acquires mic stream (`getUserMedia`) and system audio stream (`getDisplayMedia` with loopback).
2. Each stream feeds an `AudioWorkletNode` (`/public/pcm-worklet-processor.js`) producing PCM chunks at 48kHz.
3. `SimpleVAD` (`src/lib/vad.ts`) monitors RMS levels, accumulates audio during speech, and emits segments after silence gaps (800ms default) or max duration (30s).
4. Completed segments are sent to the main process via `electronAPI.transcribe(source, audioBuffer, language)`.

### Whisper integration (main process)

- `model-manager.js` — downloads GGML model files from HuggingFace to `app.getPath('userData')/models/`. Manages model catalog (tiny through large-v3-turbo-q5).
- `whisper-service.js` — maintains **two** separate whisper.node contexts (one for mic, one for system audio) to allow concurrent transcription. Converts Float32 PCM to Int16 before passing to whisper.node.

### Key data flow

`AudioWorklet → SimpleVAD → useTranscription.onSpeechEnd → IPC transcribe → whisper-service → result back to renderer → TranscriptPanel`

### UI layer

- Uses **shadcn/ui** (new-york style, Tailwind CSS v4, lucide icons).
- Path alias: `@/` maps to `./src/`.
- App shows `ModelDownloadScreen` until a model is downloaded and initialized, then switches to the main transcription view.

### macOS permissions

System audio capture requires "Screen Recording" and "System Audio Recording Only" permissions in System Settings > Privacy & Security. The app uses Electron's `desktopCapturer` with `audio: 'loopback'` for system audio.

## Agent skills

### Issue tracker

GitHub Issues in this repo (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.
