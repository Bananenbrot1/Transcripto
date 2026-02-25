import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings } from 'lucide-react';
import { useModelStatus } from '@/hooks/use-model-status';
import { useTranscription } from '@/hooks/use-transcription';
import { useExportSettings } from '@/hooks/use-export-settings';
import { useVADSettings } from '@/hooks/use-vad-settings';
import { applyTemplate, buildExportVariables } from '@/lib/format-export';
import { ModelDownloadScreen } from '@/components/model-download-screen';
import { ExportSettingsDialog } from '@/components/export-settings-dialog';
import { RecordButton } from '@/components/record-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AudioSourceIndicator, PermissionBanner } from '@/components/audio-source-indicator';
import { TranscriptPanel } from '@/components/transcript-panel';
import { DiarizationControls } from '@/components/diarization-controls';

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
    initializeWhisper,
    changeModel,
  } = useModelStatus();

  const {
    settings: exportSettings,
    setFolder,
    setFilenameTemplate,
    setBodyTemplate,
    setAutoSave,
  } = useExportSettings();

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
    diarizationState,
    elapsedMs,
    speakerNames,
    startRecording,
    stopRecording,
    toggleMicMute,
    runDiarization,
    renameSpeaker,
    dismissTranscript,
  } = useTranscription({ language: selectedLanguage, vadOptions: vadSettings });

  const [title, setTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showDebug, setShowDebug] = useState(false);
  const prevRecordingState = useRef(recordingState);

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
      const vars = buildExportVariables(segments, title, recordingStartTime);
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

  // Auto-save when recording stops
  useEffect(() => {
    if (
      prevRecordingState.current === 'stopping' &&
      recordingState === 'idle' &&
      exportSettings.autoSave &&
      exportSettings.folder &&
      segments.length > 0
    ) {
      handleSave();
    }
    prevRecordingState.current = recordingState;
  }, [recordingState, exportSettings.autoSave, exportSettings.folder, segments, handleSave]);

  const handleDismiss = useCallback(() => {
    if (window.confirm('Discard this transcript?')) {
      dismissTranscript();
      setTitle('');
      setSaveStatus('idle');
    }
  }, [dismissTranscript]);

  if (!status.whisperReady) {
    return (
      <ModelDownloadScreen
        status={status}
        models={models}
        selectedModel={selectedModel}
        selectedLanguage={selectedLanguage}
        downloadedModels={downloadedModels}
        onSelectModel={setSelectedModel}
        onSelectLanguage={setSelectedLanguage}
        onDownload={downloadModel}
        onInitialize={initializeWhisper}
      />
    );
  }

  const currentModel = models.find((m) => m.id === selectedModel);
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
            {isCapturing && (
              <Button
                variant={isMicMuted ? 'destructive' : 'outline'}
                size="sm"
                onClick={toggleMicMute}
              >
                {isMicMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {isMicMuted ? 'Mic Muted' : 'Mute Mic'}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="size-4" />
            </Button>
            <RecordButton
              recordingState={recordingState}
              onStart={startRecording}
              onStop={stopRecording}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-3">
        {showPermissionBannerInMain && <PermissionBanner />}
        <TranscriptPanel segments={segments} speakerNames={speakerNames} onRenameSpeaker={renameSpeaker} />
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

      <ExportSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={exportSettings}
        onFolderChange={setFolder}
        onFilenameTemplateChange={setFilenameTemplate}
        onBodyTemplateChange={setBodyTemplate}
        onAutoSaveChange={setAutoSave}
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
      />
    </div>
  );
}
