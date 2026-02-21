import { useState, useCallback, useEffect, useRef } from 'react';
import { Download, Mic, MicOff, Settings, FileText } from 'lucide-react';
import { useModelStatus } from '@/hooks/use-model-status';
import { useTranscription } from '@/hooks/use-transcription';
import { useExportSettings } from '@/hooks/use-export-settings';
import { applyTemplate, buildExportVariables } from '@/lib/format-export';
import { ModelDownloadScreen } from '@/components/model-download-screen';
import { ExportSettingsDialog } from '@/components/export-settings-dialog';
import { RecordButton } from '@/components/record-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AudioSourceIndicator } from '@/components/audio-source-indicator';
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
    speakerNames,
    startRecording,
    stopRecording,
    toggleMicMute,
    runDiarization,
    renameSpeaker,
  } = useTranscription({ language: selectedLanguage });

  const {
    settings: exportSettings,
    setFolder,
    setFilenameTemplate,
    setBodyTemplate,
    setAutoSave,
  } = useExportSettings();

  const [title, setTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const prevRecordingState = useRef(recordingState);

  const handleSave = useCallback(async () => {
    if (!exportSettings.folder || segments.length === 0) return;
    setSaveStatus('saving');
    try {
      const vars = buildExportVariables(segments, title, recordingStartTime);
      const filename = applyTemplate(exportSettings.filenameTemplate, vars);
      const content = applyTemplate(exportSettings.bodyTemplate, vars);

      const result = await window.electronAPI.saveMarkdown(
        exportSettings.folder,
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
  }, [exportSettings, segments, title, recordingStartTime]);

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
  const canSave = segments.length > 0 && !!exportSettings.folder;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Transcripto</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={changeModel}
              title="Change model or language"
            >
              <Settings className="size-4" />
              {currentModel ? currentModel.label.split(' — ')[0].split(' (')[0] : selectedModel}
            </Button>
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
            <RecordButton
              recordingState={recordingState}
              onStart={startRecording}
              onStop={stopRecording}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AudioSourceIndicator
            micRMS={micRMS}
            systemRMS={systemRMS}
            isCapturing={isCapturing}
            systemAudioStatus={systemAudioStatus}
            isMicMuted={isMicMuted}
          />
          <div className="ml-auto flex items-center gap-2">
            {saveStatus === 'saved' && (
              <span className="text-xs text-green-600 font-medium">Saved!</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-xs text-destructive font-medium">Save failed</span>
            )}
            {segments.length > 0 && (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Transcript title..."
                className="h-7 w-48 text-xs"
              />
            )}
            <Button
              variant="outline"
              size="icon-xs"
              onClick={handleSave}
              disabled={!canSave || saveStatus === 'saving'}
              title={!exportSettings.folder ? 'Configure output folder in Export Settings first' : 'Save as Markdown'}
            >
              <Download className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setSettingsOpen(true)}
              title="Export settings"
            >
              <FileText className="size-3" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-3">
        <TranscriptPanel segments={segments} speakerNames={speakerNames} onRenameSpeaker={renameSpeaker} />
        {recordingState === 'idle' && segments.length > 0 && (
          <div className="shrink-0 pb-1">
            <DiarizationControls diarizationState={diarizationState} onAnalyze={runDiarization} />
          </div>
        )}
      </main>
      {debugInfo.length > 0 && (
        <footer className="border-t px-6 py-3 max-h-40 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground mb-1">Debug</p>
          {debugInfo.map((line, i) => (
            <p key={i} className="text-xs font-mono text-muted-foreground">{line}</p>
          ))}
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
      />
    </div>
  );
}
