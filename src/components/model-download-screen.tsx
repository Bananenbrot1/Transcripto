import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ModelStatus, ModelDefinition } from '@/types/transcription';

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'tr', label: 'Turkish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'fi', label: 'Finnish' },
  { code: 'cs', label: 'Czech' },
  { code: 'uk', label: 'Ukrainian' },
];

function formatSize(mb: number) {
  return mb >= 1000 ? `~${(mb / 1000).toFixed(1)} GB` : `~${mb} MB`;
}

interface ModelDownloadScreenProps {
  status: ModelStatus;
  models: ModelDefinition[];
  selectedModel: string;
  selectedLanguage: string;
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
  onSelectModel,
  onSelectLanguage,
  onDownload,
  onInitialize,
}: ModelDownloadScreenProps) {
  const currentModel = models.find((m) => m.id === selectedModel);

  // Model downloaded but whisper not initialized yet -> auto-initialize
  if (status.downloaded && !status.whisperReady && !status.error) {
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
                    {m.label} ({formatSize(m.sizeMB)})
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
          <div className="flex items-center gap-2 text-green-600 justify-center">
            <CheckCircle2 className="size-5" />
            <span>Model downloaded</span>
          </div>
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
