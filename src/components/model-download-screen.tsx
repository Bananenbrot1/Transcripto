import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ModelStatus } from '@/types/transcription';

interface ModelDownloadScreenProps {
  status: ModelStatus;
  onDownload: () => void;
  onInitialize: () => void;
}

export function ModelDownloadScreen({
  status,
  onDownload,
  onInitialize,
}: ModelDownloadScreenProps) {
  // Model downloaded but whisper not initialized yet → auto-initialize
  if (status.downloaded && !status.whisperReady && !status.error) {
    // Trigger initialization on first render in this state
    if (!status.downloading) {
      queueMicrotask(onInitialize);
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4 max-w-md">
          <Loader2 className="size-12 mx-auto animate-spin text-muted-foreground" />
          <h1 className="text-2xl font-bold">Initializing Whisper</h1>
          <p className="text-muted-foreground">
            Loading the transcription model. This may take a moment...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-6 max-w-md px-4">
        <h1 className="text-4xl font-bold tracking-tight">Transcripto</h1>
        <p className="text-muted-foreground">
          A transcription model (~800 MB) needs to be downloaded before you can
          start transcribing.
        </p>

        {status.error && (
          <div className="flex items-center gap-2 text-destructive justify-center">
            <AlertCircle className="size-4" />
            <span className="text-sm">{status.error}</span>
          </div>
        )}

        {status.downloading ? (
          <div className="space-y-3">
            <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${status.progress}%` }}
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Downloading... {status.progress}%</span>
            </div>
          </div>
        ) : status.downloaded ? (
          <div className="flex items-center gap-2 text-green-600 justify-center">
            <CheckCircle2 className="size-5" />
            <span>Model downloaded</span>
          </div>
        ) : (
          <Button onClick={onDownload} size="lg">
            <Download className="size-4" />
            Download Model
          </Button>
        )}
      </div>
    </div>
  );
}
