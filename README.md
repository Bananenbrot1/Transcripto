# Transcripto

> **Beta** — This project is under active development. Expect rough edges and breaking changes.

A macOS desktop app for real-time speech-to-text transcription using local Whisper or NVIDIA Parakeet models. Everything runs on-device — no data leaves your machine — with optional cloud API integration for AI-powered summaries.

Transcripto captures both microphone and system audio simultaneously, transcribes live recordings and video files, detects speech via a custom Voice Activity Detection (VAD) engine, and generates real-time AI summaries of your transcripts. The core transcription runs locally using [whisper.node](https://github.com/nicholasgasior/whisper.node) or NVIDIA Parakeet models, with optional speaker diarization powered by [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx).

## Features

### Core Transcription
- **Local transcription** — runs Whisper or NVIDIA Parakeet GGML models entirely on-device
- **Dual transcription engine** — choose between Whisper or NVIDIA Parakeet-TDT-0.6B-v3 for transcription
- **Dual audio capture** — records microphone and system audio (Zoom, Teams, etc.) simultaneously
- **File transcription** — transcribe audio and video files (MP4, MKV, MOV, AVI, WebM, FLV, WMV, and more) with automatic audio extraction via ffmpeg
- **Real-time VAD** — custom voice activity detection with configurable sensitivity and silence thresholds
- **Multi-language** — supports all languages available in Whisper and Parakeet models

### AI & Summarization
- **Live AI summaries** — real-time transcript summarization during recording (via OpenAI-compatible API)
- **Summary refinement** — add corrections and notes to improve live summaries in real-time
- **Post-recording summaries** — generate comprehensive summaries after transcription completes
- **Customizable summary templates** — control summary format with customizable prompt templates

### Speaker & Audio Processing
- **Speaker diarization** — optional speaker identification and labeling via sherpa-onnx
- **Inline transcript editing** — edit and refine individual segments and speaker names on the fly
- **Audio waveform visualization** — live waveform display during recording for both mic and system audio

### Recording Controls
- **Pause/resume** — pause and resume recording without losing context
- **Global keyboard shortcuts** — configurable hotkeys for record, pause, and mute operations
- **Session persistence** — automatically save and restore your transcription sessions and settings
- **Microphone muting** — mute/unmute microphone without stopping the recording

### Export & Integration
- **Markdown export** — save transcripts as Markdown with customizable filename and body templates
- **Template variables** — interpolate timestamp, date, title, transcript, and summary into exports
- **Token tracking** — monitor token usage for AI-generated summaries

### UI & Customization
- **Dark mode** — toggle between light and dark themes (follow system preference or manual override)
- **Settings panels** — configure AI providers, export formats, VAD sensitivity, keyboard shortcuts, and more
- **Split-panel view** — view transcript and live summary side-by-side during recording
- **Model management** — download, switch, and delete transcription models from the UI with progress tracking

## Requirements

- macOS (Apple Silicon)
- Node.js 20+
- [pnpm](https://pnpm.io/) 10+

## Getting Started

```bash
# Install dependencies
pnpm install

# Start in development mode
pnpm dev
```

On first launch, select and download a Whisper model. The **Large v3 Turbo** model is recommended for the best balance of speed and accuracy.

### macOS Permissions

Transcripto needs two permissions in **System Settings > Privacy & Security**:

Note (macOS Sequoia 15+): System audio capture requires the packaged app. In dev mode (`pnpm dev`), the raw Electron binary cannot obtain System Audio Recording permission. Run `pnpm dist` to build the packaged app, then launch the generated `.app` from `dist-app/` or install and open it from the generated DMG.

- **Microphone** — prompted automatically on first use
- **Screen Recording** / **System Audio Recording** — required to capture audio from other apps. Add the app manually, then restart.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server + Electron |
| `pnpm build` | TypeScript check + Vite production build |
| `pnpm start` | Build and launch Electron |
| `pnpm test` | Run tests (Vitest) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm dist` | Package as macOS `.dmg` |

## Architecture

```
electron/          Main process (CommonJS) — Whisper, IPC, model management
  services/        Whisper, diarization, audio file, download services
  workers/         Diarization worker thread
shared/            Types shared across both processes
src/               Renderer (React + TypeScript + Vite)
  components/      React components (shadcn/ui)
  hooks/           Audio capture, transcription, VAD, export hooks
  lib/             VAD engine, audio utilities, export formatting
public/            AudioWorklet processor
```

**Audio pipeline:** `AudioWorklet (48kHz) -> Resample (16kHz) -> VAD -> IPC -> Whisper -> Transcript`

## Tech Stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) — UI
- [Vite](https://vite.dev/) — bundler
- [@fugood/whisper.node](https://github.com/nicholasgasior/whisper.node) — local Whisper inference
- [sherpa-onnx-node](https://github.com/k2-fsa/sherpa-onnx) — speaker diarization
- [shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS v4](https://tailwindcss.com/) — components and styling
- [Vitest](https://vitest.dev/) — testing

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit your changes (`git commit -m "Add my feature"`)
6. Push to your branch (`git push origin my-feature`)
7. Open a Pull Request

Please make sure your code builds cleanly (`pnpm build`) and all tests pass before submitting.

## License

MIT
