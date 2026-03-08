# Manual Testing Checklist

Run through this checklist before each release. Tests are grouped by feature area. Mark each item as you go.

---

## 1. Onboarding (First Launch)

Reset onboarding by deleting the electron-store settings file in `~/Library/Application Support/Transcripto/settings.json`.

### Welcome Step
- [ ] Welcome screen shows with logo, tagline, and "Get Started" button
- [ ] Animations play (fade-in on icon, staggered text)
- [ ] Progress dots visible at bottom (first dot active)

### Model Selection Step
- [ ] Large v3 Turbo shown as featured card with "Recommended" badge
- [ ] Other 4 models listed below in compact format
- [ ] Download button shows correct file size
- [ ] Progress bar animates during download
- [ ] Downloaded models show green checkmark
- [ ] "Continue" only appears after download completes
- [ ] Back button returns to welcome
- [ ] Interrupted download shows error with retry

### Language Selection Step
- [ ] All 21 languages displayed in 2-column grid
- [ ] Search field filters languages
- [ ] Auto-detect is pre-selected
- [ ] Selection highlights with border
- [ ] Back/Continue navigation works

### Permissions Step
- [ ] Microphone permission status shown (green check or "Grant" button)
- [ ] Screen Recording status shown (green check or "Open Settings" button)
- [ ] "Grant" button triggers system mic permission dialog
- [ ] "Open Settings" opens Privacy & Security > Screen Recording
- [ ] Status updates live after granting (polled every 2s)
- [ ] "Start Transcribing" works even without all permissions granted
- [ ] Back button returns to language step

### Completion
- [ ] Whisper initializes after finishing onboarding
- [ ] Main app view appears once model is loaded
- [ ] Subsequent app launch skips onboarding entirely

---

## 2. App Startup (Subsequent Launches)

- [ ] Loading spinner shown while model initializes
- [ ] Previously selected model auto-initializes
- [ ] Main app appears once ready
- [ ] Dark mode preference restored
- [ ] Previous session transcript restored (if any)

---

## 3. Recording

### Basic Flow
- [ ] "Start Recording" button in header
- [ ] Click starts recording, button changes to red "Stop"
- [ ] Elapsed timer counts up (MM:SS format)
- [ ] Stop ends recording, segments remain visible

### Microphone
- [ ] Mic audio captured (blue waveform in header)
- [ ] Mute button appears during recording
- [ ] Mute silences mic, shows MicOff icon with destructive styling
- [ ] Unmute resumes capture

### System Audio
- [ ] System audio captured via loopback (green waveform)
- [ ] If Screen Recording permission missing: banner shows with fix instructions
- [ ] Mic-only mode works if system audio unavailable

### Pause/Resume
- [ ] Pause button disables both audio tracks
- [ ] Timer shows "Paused"
- [ ] Resume re-enables tracks (respects mic mute state)
- [ ] Multiple pause/resume cycles work

---

## 4. Transcription

- [ ] Speech segments appear in real-time during recording
- [ ] Mic segments labeled "You" with blue icon
- [ ] System audio segments labeled "Speaker 1/2" with green icon
- [ ] Transcript auto-scrolls to latest segment
- [ ] Timestamps shown per segment
- [ ] Long recordings (30+ min) don't degrade performance
- [ ] Empty state shown when no segments

---

## 5. Speaker Diarization

- [ ] "Analyze speakers" button appears after recording stops
- [ ] If models not downloaded: shows download button with size estimate
- [ ] Download shows progress with phases (segmentation, embedding)
- [ ] Analysis shows spinner with elapsed time
- [ ] Results reassign speakers to "Speaker A", "Speaker B", etc.
- [ ] Can rename speakers by clicking labels
- [ ] Error state shows message with retry option
- [ ] Timeout after 5 minutes shows error

---

## 6. Export & Save

- [ ] "Save" button appears when recording has segments
- [ ] First save prompts for folder if not configured
- [ ] File saved as .md with expanded template variables
- [ ] Success: "Saved!" message shown
- [ ] Failure: error message shown

### Auto-Save
- [ ] Toggle in settings enables auto-save
- [ ] Auto-save triggers when recording stops (if folder set)
- [ ] Skipped if no folder or no segments

### Template Variables
- [ ] `{{date}}` expands to YYYY-MM-DD
- [ ] `{{time}}` expands to HH:MM:SS
- [ ] `{{title}}` uses user-entered title
- [ ] `{{duration}}` shows recording duration
- [ ] `{{segments}}` lists all transcript segments

---

## 7. Dismiss & Undo

- [ ] "Dismiss" clears transcript
- [ ] Toast appears: "Transcript dismissed" with "Undo" action
- [ ] Undo within 5 seconds restores segments and speaker names
- [ ] Toast auto-dismisses after 5 seconds

---

## 8. Settings Persistence (electron-store)

Verify each setting survives an app restart:

- [ ] Selected model
- [ ] Selected language
- [ ] Onboarding completion
- [ ] Dark mode preference
- [ ] Export folder path
- [ ] Filename template
- [ ] Body template
- [ ] Auto-save toggle
- [ ] VAD: silence threshold
- [ ] VAD: silence gap duration
- [ ] VAD: max segment length
- [ ] VAD: min segment length

### Migration (upgrade from localStorage)
- [ ] First launch after upgrade migrates old localStorage settings
- [ ] Migration only runs once (idempotent)
- [ ] If migration fails, retries on next launch

---

## 9. VAD Settings

- [ ] Silence threshold slider (0.001 - 0.1, default 0.01)
- [ ] Silence gap slider (200 - 3000ms, default 800ms)
- [ ] Max segment length slider (5 - 60s, default 30s)
- [ ] Min segment length slider (100 - 2000ms, default 500ms)
- [ ] "Reset defaults" restores all values
- [ ] Changes take effect on next recording

---

## 10. Model Management (Settings)

- [ ] Current model name shown in settings
- [ ] "Change model" releases current model and returns to selection
- [ ] Can delete downloaded models (not the active one)
- [ ] Language selector works and persists
- [ ] Model/language changes disabled during recording

---

## 11. Dark Mode

- [ ] Sun/Moon toggle in header
- [ ] All UI elements respond to theme change
- [ ] Preference persists across restarts
- [ ] `null` (default) follows system preference

---

## 12. Debug Panel

- [ ] Toggle in settings: "Show debug panel"
- [ ] Footer panel shows debug logs when enabled
- [ ] Logs include audio capture, permission checks, transcription events
- [ ] "No debug info yet" shown before first recording

---

## 13. Edge Cases

- [ ] Rapid start/stop recording (< 1 second)
- [ ] Recording with no speech (only silence)
- [ ] Very long recording (1+ hour)
- [ ] 500+ segments scroll smoothly
- [ ] Unicode/emoji in transcription display correctly
- [ ] Special characters in title/filename sanitized
- [ ] Low disk space during model download
- [ ] Network loss during model download

---

## 14. macOS Specific

- [ ] App works on Apple Silicon (arm64)
- [ ] System Audio Recording Only permission (Sequoia+) handled
- [ ] Privacy Settings links open correct panes
- [ ] App name shown correctly in permission banners
- [ ] Window opens at default 900x670

---

## 15. Security

- [ ] Context isolation enabled
- [ ] No Node integration in renderer
- [ ] Filename sanitization prevents path traversal
- [ ] No audio/transcription data sent to external servers
- [ ] All processing is local
