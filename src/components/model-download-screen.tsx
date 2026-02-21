import { useState } from 'react';
import { Download, Loader2, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LANGUAGES } from '@/lib/languages';
import type { ModelStatus, ModelDefinition } from '@/types/transcription';

function formatSize(mb: number) {
  return mb >= 1000 ? `~${(mb / 1000).toFixed(1)} GB` : `~${mb} MB`;
}

interface ModelDownloadScreenProps {
  status: ModelStatus;
  models: ModelDefinition[];
  selectedModel: string;
  selectedLanguage: string;
  downloadedModels: Record<string, boolean>;
  onSelectModel: (id: string) => void;
  onSelectLanguage: (lang: string) => void;
  onDownload: () => void;
  onInitialize: () => void;
}

export function ModelDownloadScreen({
  status,
  models,
  selectedModel,
  selectedLanguage,
  downloadedModels,
  onSelectModel,
  onSelectLanguage,
  onDownload,
  onInitialize,
}: ModelDownloadScreenProps) {
  const currentModel = models.find((m) => m.id === selectedModel);
  const [initializing, setInitializing] = useState(false);

  // Show loading screen while initializing
  if (initializing && !status.whisperReady && !status.error) {
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

  // Reset initializing state on error so user can retry
  if (status.error && initializing) {
    setInitializing(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-6 max-w-md px-4">
        <h1 className="text-4xl font-bold tracking-tight">Transcripto</h1>
        <p className="text-muted-foreground">
          Select a model and language, then download to start transcribing.
        </p>

        {models.length > 0 && (
          <div className="space-y-3 text-left">
            <label className="block text-sm font-medium">
              Model
              <select
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedModel}
                onChange={(e) => onSelectModel(e.target.value)}
                disabled={status.downloading}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({formatSize(m.sizeMB)}){downloadedModels[m.id] ? ' \u2713' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Language
              <select
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedLanguage}
                onChange={(e) => onSelectLanguage(e.target.value)}
                disabled={status.downloading}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

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
          <Button onClick={() => { setInitializing(true); onInitialize(); }} size="lg">
            <Check className="size-4" />
            Select Model
          </Button>
        ) : (
          <Button onClick={onDownload} size="lg">
            <Download className="size-4" />
            Download Model{currentModel ? ` (${formatSize(currentModel.sizeMB)})` : ''}
          </Button>
        )}
      </div>
    </div>
  );
}
