# Manual Testing Checklist

Run through before each release.

---

## 1. Onboarding (First Launch)

Reset by deleting `~/Library/Application Support/Transcripto/settings.json`.

- [ ] Welcome screen shows, "Get Started" navigates forward
- [ ] Model selection: download a model, progress bar works, "Continue" appears after download
- [ ] Language selection: can pick a language, search filters list
- [ ] Permissions: mic grant triggers system dialog, Screen Recording opens correct settings pane
- [ ] After completing onboarding, model initializes and main app appears
- [ ] Subsequent launch skips onboarding

---

## 2. Recording

- [ ] Start recording: button changes to red "Stop", timer counts up
- [ ] Mic audio captured (blue waveform visible)
- [ ] System audio captured (green waveform visible)
- [ ] Mute/unmute mic works during recording
- [ ] Pause/resume works, timer reflects state
- [ ] Stop recording: segments remain visible

---

## 3. Transcription

- [ ] Speech segments appear in real-time during recording
- [ ] Mic segments labeled "You", system audio labeled "Speaker"
- [ ] Transcript auto-scrolls to latest segment
- [ ] Timestamps shown per segment

---

## 4. Speaker Diarization

- [ ] "Analyze speakers" button appears after recording stops
- [ ] Downloads models if needed (shows progress)
- [ ] Analysis reassigns speakers to "Speaker A", "Speaker B", etc.
- [ ] Can rename speakers by clicking labels

---

## 5. Export & Save

- [ ] "Save" button appears when segments exist
- [ ] First save prompts for folder selection
- [ ] File saved as .md with correct content
- [ ] Auto-save triggers on stop when enabled and folder is set

---

## 6. Settings Persistence

Verify these survive an app restart:

- [ ] Selected model and language
- [ ] Onboarding completion
- [ ] Export folder path and templates
- [ ] Auto-save toggle

---

## 7. Edge Cases

- [ ] Rapid start/stop recording (< 1 second)
- [ ] Recording with no speech (only silence)
- [ ] Network loss during model download shows error with retry
