# Onboarding Improvements Design

**Date:** 2026-04-07
**Status:** Approved

## Overview

Two improvements to the Transcripto first-launch onboarding flow:

1. **Better system audio permission UX** — split the permissions step into two distinct cards with a proper guided walkthrough for the system audio (screen recording) permission, including automatic app registration in both required macOS permission lists.
2. **AI Summary setup step** — a new optional final step that lets users configure their AI provider (API base URL, API key, model ID) before entering the app.

---

## 1. New Step Order

```
Welcome → Model → Language → Permissions → AI Summary
```

`STEPS` in `onboarding-flow.tsx` gains a new `'ai-summary'` entry at the end. Progress dots go from 4 to 5. `onComplete` moves from the Permissions step to the AI Summary step.

---

## 2. Permissions Step Redesign

### Approach: Inline card expansion (Approach 1)

The step retains its two-card layout. Each card has distinct behaviour.

### Mic card (unchanged)

- Inline "Grant" button calls `window.electronAPI.requestMicPermission()`
- Transitions to green checkmark on grant
- No changes to existing behaviour

### System audio card

Introduces an internal `systemAudioState: 'idle' | 'waiting' | 'granted'` local state variable.

#### Idle state
- Description updated to: *"Required to capture audio playing on your Mac — we never record your screen."*
- Button label: "Open Settings"

#### Waiting state (triggered by clicking "Open Settings")
Sequence on button click:
1. Call a new IPC method `window.electronAPI.triggerScreenCaptureRegistration()`. From the main process this calls `desktopCapturer.getSources({ types: ['screen'] })`, which registers Transcripto under `kTCCServiceScreenCapture` in System Settings **without** showing a screen picker dialog.
   - For `kTCCServiceSystemAudioCapture` (the "System Audio Recording Only" section): during implementation, verify whether `desktopCapturer.getSources()` alone is sufficient to register the app there too. If a `getDisplayMedia` call with audio is required to trigger this second TCC service, add a one-line note above the button — *"We'll briefly request access to register the app in both lists"* — so the user understands why a system prompt may appear.
2. Call `window.electronAPI.openScreenPermissionSettings()` to open System Settings.
3. Set `systemAudioState = 'waiting'`.

Card expands below the button row to show:
- Instruction header: *"Transcripto should now appear in both lists — enable the toggle in each:"*
- Numbered steps:
  1. Enable under **"Screen & System Audio Recording"**
  2. Enable under **"System Audio Recording Only"**
- Footer: *"Come back here — we'll detect it automatically"*
- Pulsing dot + *"Waiting for permission…"* text
- "Open Settings" button changes to a dimmed "Opened ↗" label

The existing 2-second polling interval (`checkPermissions` via `getMediaPermissions()`) detects when the permission is granted and transitions to granted state.

#### Granted state
- Card transitions to green (border, background, icon, checkmark) — matching mic card granted style
- Expanded instructions collapse

### Continue button
Always enabled. Users can proceed without granting either permission and grant them later. The existing `PermissionBanner` in the main app handles the degraded-state reminder.

---

## 3. AI Summary Step (new)

### Component: `AiSummaryStep`

File: `src/components/onboarding/steps/ai-summary-step.tsx`

### Layout

- `Sparkles` icon + heading "AI Summary"
- Subtext: *"Optionally connect an AI provider to generate meeting summaries and live notes. You can always set this up later in Settings."*
- Three fields (matching Settings > AI Summary tab exactly):
  | Field | Input type | Placeholder |
  |---|---|---|
  | API Base URL | text | `https://openrouter.ai/api/v1` |
  | API Key | password + show/hide toggle | `sk-...` |
  | Model ID | text | `google/gemma-4-26b-a4b-it` |
- Helper text under API Key: *"Stored encrypted on your Mac"*
- "Test Connection" button — calls `window.electronAPI.testSummaryConnection()`, shows success/error inline. Disabled when API key is empty. Same logic as `SummarySettingsTab` in `settings-dialog.tsx`.

### Navigation
- Bottom left: "Skip for now" (ghost button) → calls `onComplete`
- Bottom right: "Start Transcribing" (primary button) → calls `onComplete`
- Both paths complete onboarding regardless of whether fields are filled

### Props

```ts
interface AiSummaryStepProps {
  direction: number;
  summarySettings: SummarySettings;
  summaryDecryptedKey: string;
  onApiBaseUrlChange: (url: string) => void;
  onApiKeyChange: (key: string) => Promise<void>;
  onModelIdChange: (modelId: string) => void;
  onComplete: () => void;
  onBack: () => void;
}
```

---

## 4. OnboardingFlow Wiring

### New props on `OnboardingFlowProps`

```ts
summarySettings: SummarySettings;
summaryDecryptedKey: string;
onSummaryApiBaseUrlChange: (url: string) => void;
onSummaryApiKeyChange: (key: string) => Promise<void>;
onSummaryModelIdChange: (modelId: string) => void;
```

These are already available in `App.tsx` (wired from `useSummarySettings`) and are currently threaded only into `SettingsDialog`. They will also be passed to `OnboardingFlow`.

### Step rendering

`STEPS` becomes `['welcome', 'model', 'language', 'permissions', 'ai-summary']`. The `ai-summary` case renders `AiSummaryStep` with the new props. `onComplete` is removed from `PermissionsStep` and moved to `AiSummaryStep`.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/components/onboarding/onboarding-flow.tsx` | Add `'ai-summary'` step, new props, render `AiSummaryStep` |
| `src/components/onboarding/steps/permissions-step.tsx` | System audio card expansion, `triggerScreenCaptureRegistration` IPC call, `systemAudioState`, remove `onComplete` |
| `src/components/onboarding/steps/ai-summary-step.tsx` | **New file** |
| `src/App.tsx` | Pass summary props to `OnboardingFlow` |
| `electron/main.ts` | Add `triggerScreenCaptureRegistration` IPC handler using `desktopCapturer.getSources` |
| `electron/preload.ts` | Expose `triggerScreenCaptureRegistration` via contextBridge |
| `electron/ipc-types.ts` | Add `triggerScreenCaptureRegistration: () => Promise<void>` to `ElectronAPI` |

---

## 6. Out of Scope

- Changing the Settings > AI Summary tab (already works correctly)
- Changing the model/language onboarding steps
- Any changes to the main app view
