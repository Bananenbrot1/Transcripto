# Changelog

All notable changes to Transcripto are documented here.

Format: [Semantic Versioning](https://semver.org/). Each entry has the git tag and date.

## Release process

```bash
# 1. Update version in package.json
pnpm version patch   # or minor / major
# → updates package.json and creates a git tag automatically

# 2. Build the distributable
pnpm dist

# 3. Push tag to remote
git push --follow-tags
```

---

## [1.0.0] — 2026-02-21

### Added
- Real-time mic + system audio transcription using local Whisper models (tiny → large-v3-turbo)
- Voice Activity Detection (VAD) with configurable silence gap and segment limits
- Post-meeting speaker diarization via sherpa-onnx (pyannote segmentation + 3D-Speaker embeddings)
- Inline speaker rename (click speaker label → type new name → blur to confirm)
- Markdown export with Obsidian-compatible templates (filename + body templates)
- Auto-save on recording stop
- Microphone mute button (track-level, RMS meter drops to zero)
- Model download screen with progress bar and multi-model support
- Language selector (22 languages + auto-detect)
- Export settings dialog with VAD tuning controls
- React error boundary — render crashes show a recovery screen instead of blank white
- AudioContext auto-resume on suspension (window focus loss, browser policy)
- Whisper transcription queue bounded at 3 segments per source to prevent memory growth
- Resumable model downloads — interrupted downloads continue from the last byte
- SHA-256 checksum verification framework for downloaded model files
- electron-builder configuration for macOS Apple Silicon (arm64) DMG + ZIP

### Fixed
- Diarization timestamp alignment now uses VAD speech-onset time rather than segment emission time
- Mic and system audio accumulated in separate buffers and properly mixed for diarization
- Diarization context cached after first initialisation (no disk reload on repeat analysis)
- Video track stopped (not just disabled) after system audio confirmed, dismissing macOS indicator
- Path traversal guard on save-markdown IPC handler
- Debug log capped at 200 lines to prevent unbounded state growth
