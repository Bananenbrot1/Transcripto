import { Mic, MicOff } from 'lucide-react';
import { useModelStatus } from '@/hooks/use-model-status';
import { useTranscription } from '@/hooks/use-transcription';
import { ModelDownloadScreen } from '@/components/model-download-screen';
import { RecordButton } from '@/components/record-button';
import { Button } from '@/components/ui/button';
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
    isMicMuted,
    startRecording,
    stopRecording,
    toggleMicMute,
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
          <div className="flex items-center gap-2">
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
        <AudioSourceIndicator
          micRMS={micRMS}
          systemRMS={systemRMS}
          isCapturing={isCapturing}
          systemAudioStatus={systemAudioStatus}
          isMicMuted={isMicMuted}
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
