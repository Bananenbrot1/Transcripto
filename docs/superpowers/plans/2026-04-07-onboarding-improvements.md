# Onboarding Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the first-launch onboarding flow with a better system audio permission walkthrough and a new optional AI summary setup step.

**Architecture:** Add a `triggerScreenCaptureRegistration` IPC method that calls `desktopCapturer.getSources` from the main process to register the app in both macOS TCC permission lists without showing a screen picker. Redesign the system audio card in `PermissionsStep` with a three-state machine (`idle | waiting | granted`) and an expanding instruction panel. Add a new `AiSummaryStep` as the 5th and final onboarding step with all three AI provider fields, reusing the same settings hooks already wired in `App.tsx`.

**Tech Stack:** React 18, TypeScript, Electron (main + renderer), motion/react (AnimatePresence), shadcn/ui (Button, Input, Label), Vite, pnpm

---

## File Map

| File | Action |
|---|---|
| `electron/ipc-types.ts` | Add `triggerScreenCaptureRegistration: () => Promise<void>` to `ElectronAPI` |
| `electron/main.ts` | Add `trigger-screen-capture-registration` ipcMain handler |
| `electron/preload.ts` | Expose `triggerScreenCaptureRegistration` via contextBridge |
| `src/components/onboarding/steps/ai-summary-step.tsx` | **New** — AI Summary onboarding step component |
| `src/components/onboarding/steps/permissions-step.tsx` | Change `onComplete` → `onNext`; redesign system audio card with state machine and expansion |
| `src/components/onboarding/onboarding-flow.tsx` | Add `'ai-summary'` to STEPS; add summary props; render `AiSummaryStep`; pass `onNext` to PermissionsStep |
| `src/App.tsx` | Pass summary props to `OnboardingFlow` |

---

## Task 1: Add `triggerScreenCaptureRegistration` IPC method

**Files:**
- Modify: `electron/ipc-types.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add the method signature to `ElectronAPI` in `electron/ipc-types.ts`**

  Open `electron/ipc-types.ts`. The `ElectronAPI` interface ends around line 87. Add the new method before the closing `}`:

  ```ts
  triggerScreenCaptureRegistration: () => Promise<void>;
  ```

  The relevant section of the file will look like:
  ```ts
  checkForUpdates: () => Promise<void>;
  quitAndInstall: () => void;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateError: (callback: (info: { message: string }) => void) => () => void;
  triggerScreenCaptureRegistration: () => Promise<void>;
  ```

- [ ] **Step 2: Add the IPC handler in `electron/main.ts`**

  `desktopCapturer` is already imported on line 1 of `main.ts`. Add the handler directly after the `open-screen-permission-settings` handler (after line 105):

  ```ts
  ipcMain.handle('trigger-screen-capture-registration', async () => {
    await desktopCapturer.getSources({ types: ['screen'] });
  });
  ```

- [ ] **Step 3: Expose it via contextBridge in `electron/preload.ts`**

  Add the following line to the `api` object in `preload.ts`, directly after the `openScreenPermissionSettings` line:

  ```ts
  triggerScreenCaptureRegistration: () => ipcRenderer.invoke('trigger-screen-capture-registration'),
  ```

- [ ] **Step 4: Verify the build passes**

  ```bash
  pnpm build
  ```

  Expected: build completes with no TypeScript errors. The TypeScript compiler checks that `preload.ts` implements all methods in `ElectronAPI`, so a missing or mistyped entry would error here.

- [ ] **Step 5: Commit**

  ```bash
  git add electron/ipc-types.ts electron/main.ts electron/preload.ts
  git commit -m "feat: add triggerScreenCaptureRegistration IPC method"
  ```

---

## Task 2: Create the `AiSummaryStep` component

**Files:**
- Create: `src/components/onboarding/steps/ai-summary-step.tsx`

- [ ] **Step 1: Create the file**

  Create `src/components/onboarding/steps/ai-summary-step.tsx` with the following content:

  ```tsx
  import { useState, useEffect } from 'react';
  import { ChevronLeft, Sparkles, Eye, EyeOff, Check, Loader2, AlertCircle } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { StepWrapper } from '../step-wrapper';
  import type { SummarySettings } from '@/hooks/use-summary-settings';

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

  export function AiSummaryStep({
    direction,
    summarySettings,
    summaryDecryptedKey,
    onApiBaseUrlChange,
    onApiKeyChange,
    onModelIdChange,
    onComplete,
    onBack,
  }: AiSummaryStepProps) {
    const [showKey, setShowKey] = useState(false);
    const [keyInput, setKeyInput] = useState('');
    const [keyInitialized, setKeyInitialized] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testError, setTestError] = useState('');

    // Initialize the key input from the decrypted value once it's available.
    // Same pattern as SummarySettingsTab in settings-dialog.tsx.
    useEffect(() => {
      if (!keyInitialized && summaryDecryptedKey !== undefined) {
        setKeyInput(summaryDecryptedKey);
        setKeyInitialized(true);
      }
    }, [summaryDecryptedKey, keyInitialized]);

    const handleKeyBlur = () => {
      if (keyInput !== summaryDecryptedKey) {
        onApiKeyChange(keyInput);
      }
    };

    const handleTestConnection = async () => {
      setTestStatus('testing');
      setTestError('');
      try {
        const result = await window.electronAPI.testSummaryConnection();
        if (result.success) {
          setTestStatus('success');
        } else {
          setTestStatus('error');
          setTestError(result.error || 'Unknown error');
        }
      } catch (err) {
        setTestStatus('error');
        setTestError((err as Error).message);
      }
    };

    return (
      <StepWrapper direction={direction}>
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-6 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight">AI Summary</h2>
            </div>
            <p className="text-muted-foreground">
              Optionally connect an AI provider to generate meeting summaries and live notes.
              You can always set this up later in Settings.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-summary-base-url">API Base URL</Label>
              <Input
                id="onboarding-summary-base-url"
                value={summarySettings.apiBaseUrl}
                onChange={(e) => onApiBaseUrlChange(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="onboarding-summary-api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="onboarding-summary-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onBlur={handleKeyBlur}
                  placeholder="sk-..."
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Stored encrypted on your Mac</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="onboarding-summary-model">Model ID</Label>
              <Input
                id="onboarding-summary-model"
                value={summarySettings.modelId}
                onChange={(e) => onModelIdChange(e.target.value)}
                placeholder="google/gemma-4-26b-a4b-it"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing' || !keyInput}
              >
                {testStatus === 'testing' && <Loader2 className="size-3.5 animate-spin" />}
                {testStatus === 'success' && <Check className="size-3.5 text-green-600" />}
                {testStatus === 'error' && <AlertCircle className="size-3.5 text-destructive" />}
                {testStatus === 'idle' && <Sparkles className="size-3.5" />}
                Test Connection
              </Button>
              {testStatus === 'success' && (
                <span className="text-xs text-green-600 font-medium">Connected successfully</span>
              )}
              {testStatus === 'error' && (
                <span className="text-xs text-destructive font-medium truncate max-w-[200px]" title={testError}>
                  {testError}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onComplete}>
                Skip for now
              </Button>
              <Button onClick={onComplete}>
                Start Transcribing
              </Button>
            </div>
          </div>
        </div>
      </StepWrapper>
    );
  }
  ```

- [ ] **Step 2: Verify the build passes**

  ```bash
  pnpm build
  ```

  Expected: build completes. The new file isn't rendered anywhere yet so no runtime impact.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/onboarding/steps/ai-summary-step.tsx
  git commit -m "feat: add AiSummaryStep onboarding component"
  ```

---

## Task 3: Wire up the new step — OnboardingFlow, PermissionsStep props, App.tsx

These three files must change together: `PermissionsStep` drops the `onComplete` prop, `OnboardingFlow` stops passing `onComplete` to `PermissionsStep` (and starts passing `onNext`), and `App.tsx` passes the new summary props.

**Files:**
- Modify: `src/components/onboarding/onboarding-flow.tsx`
- Modify: `src/components/onboarding/steps/permissions-step.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `onboarding-flow.tsx` entirely**

  Replace the full contents of `src/components/onboarding/onboarding-flow.tsx` with:

  ```tsx
  import { useState } from 'react';
  import { AnimatePresence } from 'motion/react';
  import { WelcomeStep } from './steps/welcome-step';
  import { ModelStep } from './steps/model-step';
  import { LanguageStep } from './steps/language-step';
  import { PermissionsStep } from './steps/permissions-step';
  import { AiSummaryStep } from './steps/ai-summary-step';
  import type { ModelStatus, ModelDefinition } from '@/types/transcription';
  import type { SummarySettings } from '@/hooks/use-summary-settings';

  export type OnboardingStep = 'welcome' | 'model' | 'language' | 'permissions' | 'ai-summary';

  const STEPS: OnboardingStep[] = ['welcome', 'model', 'language', 'permissions', 'ai-summary'];

  interface OnboardingFlowProps {
    status: ModelStatus;
    models: ModelDefinition[];
    selectedModel: string;
    selectedLanguage: string;
    downloadedModels: Record<string, boolean>;
    onSelectModel: (id: string) => void;
    onSelectLanguage: (lang: string) => void;
    onDownload: () => void;
    onComplete: () => void;
    // AI Summary
    summarySettings: SummarySettings;
    summaryDecryptedKey: string;
    onSummaryApiBaseUrlChange: (url: string) => void;
    onSummaryApiKeyChange: (key: string) => Promise<void>;
    onSummaryModelIdChange: (modelId: string) => void;
  }

  export function OnboardingFlow({
    status,
    models,
    selectedModel,
    selectedLanguage,
    downloadedModels,
    onSelectModel,
    onSelectLanguage,
    onDownload,
    onComplete,
    summarySettings,
    summaryDecryptedKey,
    onSummaryApiBaseUrlChange,
    onSummaryApiKeyChange,
    onSummaryModelIdChange,
  }: OnboardingFlowProps) {
    const [step, setStep] = useState<OnboardingStep>('welcome');
    const [direction, setDirection] = useState(1); // 1 = forward, -1 = back

    const currentIndex = STEPS.indexOf(step);

    const goNext = () => {
      if (currentIndex < STEPS.length - 1) {
        setDirection(1);
        setStep(STEPS[currentIndex + 1]);
      }
    };

    const goBack = () => {
      if (currentIndex > 0) {
        setDirection(-1);
        setStep(STEPS[currentIndex - 1]);
      }
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <div className="w-full max-w-lg px-6">
          <AnimatePresence mode="wait" custom={direction}>
            {step === 'welcome' && (
              <WelcomeStep key="welcome" direction={direction} onNext={goNext} />
            )}
            {step === 'model' && (
              <ModelStep
                key="model"
                direction={direction}
                status={status}
                models={models}
                selectedModel={selectedModel}
                downloadedModels={downloadedModels}
                onSelectModel={onSelectModel}
                onDownload={onDownload}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {step === 'language' && (
              <LanguageStep
                key="language"
                direction={direction}
                selectedLanguage={selectedLanguage}
                isParakeet={models.find((m) => m.id === selectedModel)?.engine === 'parakeet'}
                onSelectLanguage={onSelectLanguage}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {step === 'permissions' && (
              <PermissionsStep
                key="permissions"
                direction={direction}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {step === 'ai-summary' && (
              <AiSummaryStep
                key="ai-summary"
                direction={direction}
                summarySettings={summarySettings}
                summaryDecryptedKey={summaryDecryptedKey}
                onApiBaseUrlChange={onSummaryApiBaseUrlChange}
                onApiKeyChange={onSummaryApiKeyChange}
                onModelIdChange={onSummaryModelIdChange}
                onComplete={onComplete}
                onBack={goBack}
              />
            )}
          </AnimatePresence>

          {/* Progress dots */}
          <div className="mt-12 flex justify-center gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? 'w-6 bg-primary'
                    : i < currentIndex
                      ? 'w-1.5 bg-primary/40'
                      : 'w-1.5 bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Update `PermissionsStep` props — replace `onComplete` with `onNext`**

  In `src/components/onboarding/steps/permissions-step.tsx`, make these three changes:

  1. In the `PermissionsStepProps` interface, replace `onComplete: () => void` with `onNext: () => void`.
  2. In the function signature destructuring, replace `onComplete` with `onNext`.
  3. At the bottom of the JSX, replace the "Start Transcribing" button with a "Continue" button:

  ```tsx
  // Before:
  <Button onClick={onComplete}>
    Start Transcribing
  </Button>

  // After:
  <Button onClick={onNext}>
    Continue
  </Button>
  ```

- [ ] **Step 3: Pass summary props to `OnboardingFlow` in `App.tsx`**

  Find the `OnboardingFlow` JSX block in `App.tsx` (around line 401). Replace it with:

  ```tsx
  <OnboardingFlow
    status={status}
    models={models}
    selectedModel={selectedModel}
    selectedLanguage={selectedLanguage}
    downloadedModels={downloadedModels}
    onSelectModel={setSelectedModel}
    onSelectLanguage={setSelectedLanguage}
    onDownload={downloadModel}
    onComplete={handleOnboardingComplete}
    summarySettings={summarySettings}
    summaryDecryptedKey={summaryDecryptedKey}
    onSummaryApiBaseUrlChange={setSummaryApiBaseUrl}
    onSummaryApiKeyChange={setSummaryApiKey}
    onSummaryModelIdChange={setSummaryModelId}
  />
  ```

- [ ] **Step 4: Verify the build passes**

  ```bash
  pnpm build
  ```

  Expected: build completes with no TypeScript errors. If you see "Property 'onComplete' does not exist on type 'PermissionsStepProps'", you missed step 2. If you see a missing prop error on `OnboardingFlow`, you missed step 3.

- [ ] **Step 5: Smoke test the full flow in dev**

  ```bash
  pnpm dev
  ```

  Reset onboarding by opening DevTools console and running:
  ```js
  window.electronAPI.storeSet('onboardingComplete', false)
  ```
  Then reload the app. Verify:
  - 5 progress dots appear
  - Permissions step has a "Continue" button (not "Start Transcribing")
  - Clicking "Continue" on Permissions goes to AI Summary step
  - AI Summary step shows 3 fields + "Skip for now" + "Start Transcribing"
  - Both "Skip for now" and "Start Transcribing" complete onboarding and launch the main app

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/onboarding/onboarding-flow.tsx \
          src/components/onboarding/steps/permissions-step.tsx \
          src/App.tsx
  git commit -m "feat: wire AiSummaryStep as 5th onboarding step"
  ```

---

## Task 4: Redesign the PermissionsStep system audio card

**Files:**
- Modify: `src/components/onboarding/steps/permissions-step.tsx`

- [ ] **Step 1: Replace `permissions-step.tsx` entirely**

  Replace the full contents of `src/components/onboarding/steps/permissions-step.tsx` with:

  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import { motion, AnimatePresence } from 'motion/react';
  import { ChevronLeft, Mic, Monitor, CheckCircle2, ExternalLink } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { StepWrapper } from '../step-wrapper';

  type SystemAudioState = 'idle' | 'waiting' | 'granted';

  interface PermissionsStepProps {
    direction: number;
    onNext: () => void;
    onBack: () => void;
  }

  export function PermissionsStep({ direction, onNext, onBack }: PermissionsStepProps) {
    const [micGranted, setMicGranted] = useState(false);
    const [systemAudioState, setSystemAudioState] = useState<SystemAudioState>('idle');

    const checkPermissions = useCallback(async () => {
      try {
        const perms = await window.electronAPI.getMediaPermissions();
        setMicGranted(perms.mic === 'granted');
        if (perms.screen === 'granted') {
          setSystemAudioState('granted');
        }
      } catch {
        // permissions API might not be available in dev
      }
    }, []);

    useEffect(() => {
      checkPermissions();
      const interval = setInterval(checkPermissions, 2000);
      return () => clearInterval(interval);
    }, [checkPermissions]);

    const requestMic = async () => {
      try {
        const granted = await window.electronAPI.requestMicPermission();
        setMicGranted(granted);
      } catch {
        // fallback
      }
    };

    const openScreenSettings = async () => {
      // Register the app in both macOS TCC permission lists without showing
      // a screen picker. desktopCapturer.getSources triggers kTCCServiceScreenCapture.
      // Note: if kTCCServiceSystemAudioCapture requires a separate trigger,
      // the user may see a brief system prompt — the instructions below explain this.
      try {
        await window.electronAPI.triggerScreenCaptureRegistration();
      } catch {
        // Registration failed — still open settings; user can add the app manually.
      }
      try {
        await window.electronAPI.openScreenPermissionSettings();
      } catch {
        // fallback
      }
      setSystemAudioState('waiting');
    };

    const screenGranted = systemAudioState === 'granted';

    return (
      <StepWrapper direction={direction}>
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Permissions</h2>
            <p className="text-muted-foreground">
              Transcripto needs access to your microphone and system audio to transcribe. Everything stays local on your Mac.
            </p>
          </div>

          <div className="space-y-3">
            {/* Mic card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={`flex items-center gap-4 rounded-lg border px-4 py-4 transition-colors ${
                micGranted ? 'border-green-500/30 bg-green-500/5' : 'border-border'
              }`}
            >
              <div className={`flex items-center justify-center size-10 rounded-lg ${
                micGranted ? 'bg-green-500/10' : 'bg-muted'
              }`}>
                <Mic className={`size-5 ${micGranted ? 'text-green-500' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Microphone</p>
                <p className="text-xs text-muted-foreground">Captures your voice for transcription</p>
              </div>
              {micGranted ? (
                <CheckCircle2 className="size-5 text-green-500" />
              ) : (
                <Button size="sm" variant="outline" onClick={requestMic}>
                  Grant
                </Button>
              )}
            </motion.div>

            {/* System audio card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`rounded-lg border px-4 py-4 transition-colors ${
                screenGranted ? 'border-green-500/30 bg-green-500/5' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`flex items-center justify-center size-10 rounded-lg shrink-0 ${
                  screenGranted ? 'bg-green-500/10' : 'bg-muted'
                }`}>
                  <Monitor className={`size-5 ${screenGranted ? 'text-green-500' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">System Audio</p>
                  <p className="text-xs text-muted-foreground">
                    Required to capture audio playing on your Mac — we never record your screen.
                  </p>
                </div>
                {screenGranted ? (
                  <CheckCircle2 className="size-5 text-green-500 shrink-0" />
                ) : systemAudioState === 'waiting' ? (
                  <span className="text-xs text-muted-foreground shrink-0">Opened ↗</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={openScreenSettings} className="shrink-0">
                    Open Settings
                    <ExternalLink className="size-3" />
                  </Button>
                )}
              </div>

              <AnimatePresence>
                {systemAudioState === 'waiting' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 overflow-hidden"
                  >
                    <div className="rounded-md bg-muted/50 px-3 py-3 space-y-2">
                      <p className="text-xs font-medium">
                        Transcripto should now appear in both lists — enable the toggle in each:
                      </p>
                      <ol className="text-xs text-muted-foreground space-y-1 list-none">
                        <li className="flex gap-2">
                          <span className="font-medium text-foreground shrink-0">1.</span>
                          <span>Enable under <span className="font-medium text-foreground">"Screen &amp; System Audio Recording"</span></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-foreground shrink-0">2.</span>
                          <span>Enable under <span className="font-medium text-foreground">"System Audio Recording Only"</span></span>
                        </li>
                      </ol>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="size-2 rounded-full bg-primary animate-pulse shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          Waiting for permission… Come back here — we'll detect it automatically.
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            You can also grant these later. Screen recording permission can only be enabled in System Settings.
          </p>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <Button onClick={onNext}>
              Continue
            </Button>
          </div>
        </div>
      </StepWrapper>
    );
  }
  ```

- [ ] **Step 2: Verify the build passes**

  ```bash
  pnpm build
  ```

  Expected: build completes with no TypeScript errors.

- [ ] **Step 3: Smoke test the permissions step**

  ```bash
  pnpm dev
  ```

  Reset onboarding state in DevTools console:
  ```js
  window.electronAPI.storeSet('onboardingComplete', false)
  ```
  Reload the app and navigate to the Permissions step. Verify:
  - Mic card shows "Grant" button; clicking it triggers the macOS mic permission dialog
  - System audio card description reads *"Required to capture audio playing on your Mac — we never record your screen."*
  - Clicking "Open Settings" changes the button to "Opened ↗" and expands the instruction panel below the card
  - The instruction panel shows the two numbered steps and the pulsing "Waiting for permission…" indicator
  - After granting screen recording permission in System Settings and returning to the app, the card transitions to green within ~2 seconds (polling interval)
  - "Continue" button is always clickable regardless of permission state

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/onboarding/steps/permissions-step.tsx
  git commit -m "feat: redesign system audio permission card with guided walkthrough"
  ```
