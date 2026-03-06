# Transcripto

> **Beta** — This project is under active development. Expect rough edges and breaking changes.

A macOS desktop app for real-time speech-to-text transcription using local Whisper models. Everything runs on-device — no cloud services, no API keys, no data leaves your machine.

Transcripto captures both microphone and system audio simultaneously, detects speech via a custom Voice Activity Detection (VAD) engine, and transcribes segments locally using [whisper.node](https://github.com/nicholasgasior/whisper.node). Optional speaker diarization is powered by [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx).

## Features

- **Local transcription** — runs Whisper GGML models entirely on-device
- **Dual audio capture** — records microphone and system audio (Zoom, Teams, etc.) at the same time
- **Real-time VAD** — custom voice activity detection with configurable sensitivity
- **Speaker diarization** — optional speaker identification via sherpa-onnx
- **Pause/resume** — pause and resume recording without losing context
- **Dark mode** — toggle between light and dark themes
- **Audio waveform** — live waveform visualization during recording
- **Markdown export** — save transcripts as Markdown with customizable templates
- **Model management** — download, switch, and delete Whisper models from the UI
- **Multi-language** — supports all languages available in Whisper models

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
