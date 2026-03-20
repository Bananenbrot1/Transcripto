import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, Pause, Play, Languages, ClipboardCopy, Sparkles, Loader2 } from 'lucide-react';
import { useModelStatus } from '@/hooks/use-model-status';
import { useTranscription } from '@/hooks/use-transcription';
import { useExportSettings } from '@/hooks/use-export-settings';
import { useSummarySettings } from '@/hooks/use-summary-settings';
import { useVADSettings } from '@/hooks/use-vad-settings';
import { useStoreValue } from '@/hooks/use-store';
import { applyTemplate, buildExportVariables, renderSegments, formatTranscriptForPrompt } from '@/lib/format-export';
import { LANGUAGES } from '@/lib/languages';
import { migrateFromLocalStorage } from '@/lib/migrate-local-storage';
import { loadSession, saveSummary } from '@/hooks/use-session-persistence';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { SettingsDialog } from '@/components/settings-dialog';
import { RecordButton } from '@/components/record-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toast } from '@/components/ui/toast';
import { AudioSourceIndicator, PermissionBanner } from '@/components/audio-source-indicator';
import { TranscriptPanel } from '@/components/transcript-panel';
import { DiarizationControls } from '@/components/diarization-controls';
import { SummaryPanel } from '@/components/summary-panel';
import type { SummaryResult } from '../shared/types';

export function App() {
  const {
    status,
    models,
    selectedModel,
    selectedLanguage,
    setSelectedModel,
    setSelectedLanguage,
    downloadedModels,
    downloadModel,
    deleteModel,
    initializeWhisper,
    changeModel,
  } = useModelStatus();

  const {
    settings: exportSettings,
    setFolder,
    setFilenameTemplate,
    setBodyTemplate,
  } = useExportSettings();

  const {
    settings: summarySettings,
    decryptedKey: summaryDecryptedKey,
    hasApiKey: hasSummaryApiKey,
    setApiBaseUrl: setSummaryApiBaseUrl,
    setApiKey: setSummaryApiKey,
    setModelId: setSummaryModelId,
    setPromptTemplate: setSummaryPromptTemplate,
  } = useSummarySettings();

  const {
    settings: vadSettings,
    setSilenceThreshold,
    setSilenceDurationMs,
    setMaxSegmentMs,
    setMinSegmentMs,
    resetDefaults: resetVADDefaults,
  } = useVADSettings();

  const {
    segments,
    recordingState,
    recordingStartTime,
    isCapturing,
    systemAudioStatus,
    debugInfo,
    micRMS,
    systemRMS,
    isMicMuted,
    isPaused,
    diarizationState,
    elapsedMs,
    speakerNames,
    startRecording,
    stopRecording,
    toggleMicMute,
    togglePause,
    runDiarization,
    renameSpeaker,
    updateSegmentText,
    deleteSegment,
    dismissTranscript,
    restoreTranscript,
  } = useTranscription({ language: selectedLanguage, vadOptions: vadSettings });

  const [onboardingComplete, setOnboardingComplete] = useStoreValue('onboardingComplete');
  const [storedDarkMode, setStoredDarkMode] = useStoreValue('darkMode');
  const [shortcuts, setShortcuts] = useStoreValue('shortcuts');
  const [shortcutStatus, setShortcutStatus] = useState<Record<string, boolean>>({});

  // Run one-time migration from localStorage on mount
  useEffect(() => {
    migrateFromLocalStorage();
  }, []);

  const [title, setTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  const handleCopyAll = useCallback(() => {
    if (segments.length === 0) return;
    const text = renderSegments(segments);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [segments]);
  const [showDebug, setShowDebug] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'transcript' | 'summary'>(() => {
    const session = loadSession();
    return session?.summary ? 'summary' : 'transcript';
  });
  const [summary, setSummary] = useState<SummaryResult | null>(() => loadSession()?.summary ?? null);
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [summaryError, setSummaryError] = useState('');
  // Persist summary to localStorage whenever it changes
  useEffect(() => {
    saveSummary(summary);
  }, [summary]);

  const autoInitAttempted = useRef(false);

  // Dark mode — null means follow system preference
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedDark = storedDarkMode ?? systemDark;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedDark);
  }, [resolvedDark]);

  // Register global shortcuts with the main process
  useEffect(() => {
    const hasAny = shortcuts.toggleRecording || shortcuts.togglePause || shortcuts.toggleMicMute;
    if (!hasAny) {
      setShortcutStatus({});
      return;
    }
    window.electronAPI.registerShortcuts(shortcuts).then(setShortcutStatus);
  }, [shortcuts]);

  const handleStartRecording = useCallback(() => {
    setSummary(null);
    setActiveMainTab('transcript');
    startRecording();
  }, [startRecording]);

  // Listen for global shortcut actions from the main process
  useEffect(() => {
    return window.electronAPI.onShortcutAction((action) => {
      switch (action) {
        case 'toggleRecording':
          if (recordingState === 'idle') handleStartRecording();
          else if (recordingState === 'recording') stopRecording();
          break;
        case 'togglePause':
          if (recordingState === 'recording') togglePause();
          break;
        case 'toggleMicMute':
          if (isCapturing) toggleMicMute();
          break;
      }
    });
  }, [recordingState, isCapturing, handleStartRecording, stopRecording, togglePause, toggleMicMute]);

  // Recording timer (pauses correctly by tracking accumulated time)
  const [elapsedRecording, setElapsedRecording] = useState(0);
  const pausedAtRef = useRef(0);
  const pauseOffsetRef = useRef(0);

  useEffect(() => {
    if (recordingState !== 'recording' || !recordingStartTime) {
      setElapsedRecording(0);
      pauseOffsetRef.current = 0;
      pausedAtRef.current = 0;
      return;
    }
    if (isPaused) {
      pausedAtRef.current = Date.now();
      return;
    }
    if (pausedAtRef.current > 0) {
      pauseOffsetRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = 0;
    }
    const tick = () => setElapsedRecording(Date.now() - recordingStartTime - pauseOffsetRef.current);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [recordingState, recordingStartTime, isPaused]);

  // Undo dismiss toast
  const [dismissToast, setDismissToast] = useState<{ segments: typeof segments; speakerNames: typeof speakerNames; title: string } | null>(null);

  const handleSave = useCallback(async () => {
    if (segments.length === 0) return;
    let folder = exportSettings.folder;
    if (!folder) {
      const picked = await window.electronAPI.selectExportFolder();
      if (!picked) return;
      setFolder(picked);
      folder = picked;
    }
    setSaveStatus('saving');
    try {
      const vars = buildExportVariables(segments, title, recordingStartTime, summary?.text);
      const filename = applyTemplate(exportSettings.filenameTemplate, vars);
      const content = applyTemplate(exportSettings.bodyTemplate, vars);

      const result = await window.electronAPI.saveMarkdown(
        folder,
        filename,
        content,
      );

      if (result.success) {
        setSaveStatus('saved');
      } else {
        console.error('Failed to save markdown:', result.error);
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
    } finally {
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [exportSettings, segments, title, recordingStartTime, setFolder]);

  const handleSummarize = useCallback(async () => {
    if (segments.length === 0) return;
    setSummaryStatus('loading');
    setSummaryError('');
    try {
      const transcript = formatTranscriptForPrompt(segments);
      const result = await window.electronAPI.summarize(transcript, title || 'Untitled');
      setSummary(result);
      setSummaryStatus('idle');
      setActiveMainTab('summary');
    } catch (err) {
      setSummaryStatus('error');
      setSummaryError((err as Error).message);
      setTimeout(() => setSummaryStatus('idle'), 5000);
    }
  }, [segments, title]);

  const handleDismiss = useCallback(() => {
    setDismissToast({ segments: [...segments], speakerNames: { ...speakerNames }, title });
    dismissTranscript();
    setTitle('');
    setSaveStatus('idle');
    setSummary(null);
    setActiveMainTab('transcript');
  }, [dismissTranscript, segments, speakerNames, title]);

  const handleUndoDismiss = useCallback(() => {
    if (dismissToast) {
      restoreTranscript(dismissToast.segments, dismissToast.speakerNames);
      setTitle(dismissToast.title);
      setDismissToast(null);
    }
  }, [dismissToast, restoreTranscript]);

  const formatElapsed = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };

  // Auto-initialize whisper on subsequent launches (onboarding already done)
  useEffect(() => {
    if (onboardingComplete && !status.whisperReady && !autoInitAttempted.current) {
      autoInitAttempted.current = true;
      // Wait for downloadedModels to be populated before auto-init
      const hasAnyModel = Object.values(downloadedModels).some(Boolean);
      if (hasAnyModel && downloadedModels[selectedModel]) {
        initializeWhisper();
      }
    }
  }, [onboardingComplete, status.whisperReady, downloadedModels, selectedModel, initializeWhisper]);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingComplete(true);
    initializeWhisper();
  }, [setOnboardingComplete, initializeWhisper]);

  // Show onboarding on first launch
  if (!onboardingComplete) {
    return (
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
      />
    );
  }

  // Show loading while whisper initializes on subsequent launches
  if (!status.whisperReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <div className="size-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading model...</p>
          {status.error && (
            <p className="text-sm text-destructive">{status.error}</p>
          )}
        </div>
      </div>
    );
  }

  const currentModel = models.find((m) => m.id === selectedModel);
  const modelDisplayName = currentModel
    ? currentModel.label.split(' — ')[0].split(' (')[0]
    : 'Unknown';
  const showPostRecordingBar = recordingState === 'idle' && segments.length > 0;
  const showPermissionBannerInMain = isCapturing && (systemAudioStatus === 'no-permission' || systemAudioStatus === 'failed');

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight shrink-0">Transcripto</h1>

          <div className="flex-1 max-w-xs">
            <AudioSourceIndicator
              micRMS={micRMS}
              systemRMS={systemRMS}
              isCapturing={isCapturing}
              systemAudioStatus={systemAudioStatus}
              isMicMuted={isMicMuted}
              showPermissionBanner={false}
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {recordingState === 'recording' && (
              <span className={`text-sm font-mono font-medium tabular-nums ${isPaused ? 'text-muted-foreground' : 'text-destructive'}`}>
                {isPaused ? 'Paused' : formatElapsed(elapsedRecording)}
              </span>
            )}
            {isCapturing && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePause}
                  title={isPaused ? 'Resume recording' : 'Pause recording'}
                >
                  {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                  {isPaused ? 'Resume' : 'Pause'}
                </Button>
                <Button
                  variant={isMicMuted ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={toggleMicMute}
                >
                  {isMicMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  {isMicMuted ? 'Mic Muted' : 'Mute Mic'}
                </Button>
              </>
            )}
            <RecordButton
              recordingState={recordingState}
              onStart={handleStartRecording}
              onStop={stopRecording}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-3">
        {showPermissionBannerInMain && <PermissionBanner />}
        {summary && showPostRecordingBar && (
          <div className="flex border-b -mx-6 px-6 shrink-0">
            <button
              onClick={() => setActiveMainTab('transcript')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeMainTab === 'transcript'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Transcript
            </button>
            <button
              onClick={() => setActiveMainTab('summary')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeMainTab === 'summary'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Summary
            </button>
          </div>
        )}
        {activeMainTab === 'transcript' ? (
          <TranscriptPanel
            segments={segments}
            speakerNames={speakerNames}
            onRenameSpeaker={renameSpeaker}
            onUpdateText={updateSegmentText}
            onDeleteSegment={deleteSegment}
          />
        ) : summary ? (
          <SummaryPanel summary={summary} />
        ) : null}
        {showPostRecordingBar && (
          <div className="shrink-0 flex items-center gap-2 pb-1">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Transcript title..."
              className="h-8 flex-1 max-w-xs text-sm"
            />
            <DiarizationControls diarizationState={diarizationState} onAnalyze={runDiarization} elapsedMs={elapsedMs} />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
                title="Copy transcript to clipboard"
              >
                <ClipboardCopy className="size-3.5" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSummarize}
                disabled={summaryStatus === 'loading' || !hasSummaryApiKey}
                title={!hasSummaryApiKey ? 'Configure API key in Settings > AI Summary' : 'Generate AI summary'}
              >
                {summaryStatus === 'loading' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {summaryStatus === 'loading' ? 'Summarizing…' : 'Summarize'}
              </Button>
              {summaryStatus === 'error' && (
                <span className="text-xs text-destructive font-medium truncate max-w-[150px]" title={summaryError}>
                  {summaryError}
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-xs text-green-600 font-medium">Saved!</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-xs text-destructive font-medium">Save failed</span>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? 'Saving…' : 'Save'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismiss}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t px-6 py-2 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Languages className="size-3.5" />
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            disabled={isCapturing}
            className="bg-transparent text-xs font-medium border-none outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {modelDisplayName}
        </span>
      </footer>

      {showDebug && (
        <footer className="border-t px-6 py-3 max-h-40 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground mb-1">Debug</p>
          {debugInfo.length > 0 ? (
            debugInfo.map((line, i) => (
              <p key={i} className="text-xs font-mono text-muted-foreground">{line}</p>
            ))
          ) : (
            <p className="text-xs font-mono text-muted-foreground italic">No debug info yet — start a recording.</p>
          )}
        </footer>
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        darkMode={storedDarkMode}
        onDarkModeChange={setStoredDarkMode}
        settings={exportSettings}
        onFolderChange={setFolder}
        onFilenameTemplateChange={setFilenameTemplate}
        onBodyTemplateChange={setBodyTemplate}
        summarySettings={summarySettings}
        summaryDecryptedKey={summaryDecryptedKey}
        onSummaryApiBaseUrlChange={setSummaryApiBaseUrl}
        onSummaryApiKeyChange={setSummaryApiKey}
        onSummaryModelIdChange={setSummaryModelId}
        onSummaryPromptTemplateChange={setSummaryPromptTemplate}
        vadSettings={vadSettings}
        onSilenceThresholdChange={setSilenceThreshold}
        onSilenceDurationMsChange={setSilenceDurationMs}
        onMaxSegmentMsChange={setMaxSegmentMs}
        onMinSegmentMsChange={setMinSegmentMs}
        onResetVADDefaults={resetVADDefaults}
        currentModel={currentModel}
        selectedLanguage={selectedLanguage}
        onSelectLanguage={setSelectedLanguage}
        onChangeModel={() => { setSettingsOpen(false); changeModel(); }}
        isCapturing={isCapturing}
        showDebug={showDebug}
        onShowDebugChange={setShowDebug}
        models={models}
        downloadedModels={downloadedModels}
        onDeleteModel={deleteModel}
        shortcuts={shortcuts}
        shortcutStatus={shortcutStatus}
        onShortcutsChange={setShortcuts}
      />

      {dismissToast && (
        <Toast
          message="Transcript dismissed"
          action={{ label: 'Undo', onClick: handleUndoDismiss }}
          onClose={() => setDismissToast(null)}
        />
      )}
    </div>
  );
}
