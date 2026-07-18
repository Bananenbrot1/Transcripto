import { motion } from 'motion/react';
import { Download, Loader2, Check, ChevronLeft, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepWrapper } from '../step-wrapper';
import type { ModelStatus, ModelDefinition } from '@/types/transcription';

const RECOMMENDED_MODEL = 'parakeet-tdt-0.6b-v3';

function formatSize(mb: number) {
  return mb >= 1000 ? `~${(mb / 1000).toFixed(1)} GB` : `~${mb} MB`;
}

function qualityLabel(id: string): string {
  if (id.includes('tiny')) return 'Fastest draft';
  if (id.includes('base')) return 'Fast';
  if (id.includes('small')) return 'Balanced';
  if (id.includes('medium')) return 'Legacy — prefer Turbo';
  if (id.includes('turbo')) return 'Multilingual';
  if (id.includes('parakeet')) return '25 EU languages';
  return 'Best quality';
}

interface ModelStepProps {
  direction: number;
  status: ModelStatus;
  models: ModelDefinition[];
  selectedModel: string;
  downloadedModels: Record<string, boolean>;
  onSelectModel: (id: string) => void;
  onDownload: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function ModelStep({
  direction,
  status,
  models,
  selectedModel,
  downloadedModels,
  onSelectModel,
  onDownload,
  onNext,
  onBack,
}: ModelStepProps) {
  const hasDownloaded = !!downloadedModels[selectedModel];
  const recommendedModel = models.find((m) => m.id === RECOMMENDED_MODEL);
  const otherModels = models.filter((m) => m.id !== RECOMMENDED_MODEL);

  return (
    <StepWrapper direction={direction}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Choose a model</h2>
          <p className="text-muted-foreground">
            Larger models are more accurate but slower. You can always change this later.
          </p>
        </div>

        {/* Recommended model — featured card */}
        {recommendedModel && (
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.35 }}
            onClick={() => onSelectModel(recommendedModel.id)}
            className={`w-full rounded-xl border-2 px-5 py-4 text-left transition-all ${
              selectedModel === RECOMMENDED_MODEL
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:border-primary/40 hover:bg-muted/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 size-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                selectedModel === RECOMMENDED_MODEL ? 'border-primary' : 'border-muted-foreground/30'
              }`}>
                {selectedModel === RECOMMENDED_MODEL && <div className="size-2 rounded-full bg-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{recommendedModel.label}</span>
                  {downloadedModels[RECOMMENDED_MODEL] && <Check className="size-3.5 text-green-500" />}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatSize(recommendedModel.sizeMB)} — Best for English and European languages; native punctuation.
                  Use Whisper Turbo if you need other languages.
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <Sparkles className="size-3" />
                  Recommended
                </div>
              </div>
            </div>
          </motion.button>
        )}

        {/* Other models — compact list */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Other models</p>
          {otherModels.map((model, i) => {
            const isSelected = model.id === selectedModel;
            const isDownloaded = !!downloadedModels[model.id];

            return (
              <motion.button
                key={model.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.25 }}
                onClick={() => onSelectModel(model.id)}
                className={`w-full flex items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30 hover:bg-muted/50'
                }`}
              >
                <div className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isSelected ? 'border-primary' : 'border-muted-foreground/30'
                }`}>
                  {isSelected && <div className="size-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{model.label}</span>
                    {isDownloaded && <Check className="size-3.5 text-green-500" />}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatSize(model.sizeMB)} · {qualityLabel(model.id)}
                </span>
              </motion.button>
            );
          })}
        </div>

        {status.error && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span className="text-sm">{status.error}</span>
          </div>
        )}

        {status.downloading && (
          <div className="space-y-2">
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <motion.div
                className="bg-primary h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${status.progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Downloading... {status.progress}%</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="size-4" />
            Back
          </Button>

          {hasDownloaded ? (
            <Button onClick={onNext}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={onDownload} disabled={status.downloading}>
              <Download className="size-4" />
              Download {models.find(m => m.id === selectedModel)
                ? `(${formatSize(models.find(m => m.id === selectedModel)!.sizeMB)})`
                : ''}
            </Button>
          )}
        </div>
      </div>
    </StepWrapper>
  );
}
