import { useModelStatus } from '@/hooks/use-model-status';
import { useTranscription } from '@/hooks/use-transcription';
import { ModelDownloadScreen } from '@/components/model-download-screen';
import { RecordButton } from '@/components/record-button';
import { AudioSourceIndicator } from '@/components/audio-source-indicator';
import { TranscriptPanel } from '@/components/transcript-panel';

export function App() {
  const { status, downloadModel, initializeWhisper } = useModelStatus();
  const {
    segments,
    recordingState,
    isCapturing,
    systemAudioStatus,
    debugInfo,
    micRMS,
    systemRMS,
    startRecording,
    stopRecording,
  } = useTranscription();

  if (!status.whisperReady) {
    return (
      <ModelDownloadScreen
        status={status}
        onDownload={downloadModel}
        onInitialize={initializeWhisper}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Transcripto</h1>
          <RecordButton
            recordingState={recordingState}
            onStart={startRecording}
            onStop={stopRecording}
          />
        </div>
        <AudioSourceIndicator
          micRMS={micRMS}
          systemRMS={systemRMS}
          isCapturing={isCapturing}
          systemAudioStatus={systemAudioStatus}
        />
      </header>
      <main className="flex-1 overflow-hidden flex flex-col px-6 py-4">
        <TranscriptPanel segments={segments} />
      </main>
      {debugInfo.length > 0 && (
        <footer className="border-t px-6 py-3 max-h-40 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground mb-1">Debug</p>
          {debugInfo.map((line, i) => (
            <p key={i} className="text-xs font-mono text-muted-foreground">{line}</p>
          ))}
        </footer>
      )}
    </div>
  );
}
