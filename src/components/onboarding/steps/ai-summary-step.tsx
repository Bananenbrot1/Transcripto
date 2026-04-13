import { useState } from 'react';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StepWrapper } from '../step-wrapper';
import type { SummarySettings } from '@/hooks/use-summary-settings';
import type { Provider } from '../../../../shared/types';

interface AiSummaryStepProps {
  direction: number;
  summarySettings: SummarySettings;
  summaryProviders: Provider[];
  onConfigureAiProvider: (opts: { apiBaseUrl: string; apiKey: string; modelId: string }) => Promise<void>;
  onComplete: () => void;
  onBack: () => void;
}

export function AiSummaryStep({
  direction,
  summarySettings,
  summaryProviders,
  onConfigureAiProvider,
  onComplete,
  onBack,
}: AiSummaryStepProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState(summarySettings.modelId);
  const [saving, setSaving] = useState(false);

  const handleStart = async () => {
    if (apiKey.trim() && apiBaseUrl.trim()) {
      setSaving(true);
      try {
        await onConfigureAiProvider({
          apiBaseUrl: apiBaseUrl.trim(),
          apiKey: apiKey.trim(),
          modelId: modelId.trim() || summarySettings.modelId,
        });
      } catch (err) {
        console.error('[onboarding] AI provider setup failed:', err);
      } finally {
        setSaving(false);
      }
    }
    onComplete();
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
            Optionally connect a cloud provider for summaries and live notes. You can add or edit providers later in
            {' '}Settings → Providers.
          </p>
        </div>

        {summaryProviders.length > 0 && (
          <p className="text-xs text-muted-foreground">
            You already have {summaryProviders.length} provider(s). Skip to use Settings to assign one for summaries.
          </p>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-summary-base-url">API Base URL</Label>
            <Input
              id="onboarding-summary-base-url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboarding-summary-api-key">API Key</Label>
            <Input
              id="onboarding-summary-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <p className="text-xs text-muted-foreground">Stored encrypted on your Mac</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboarding-summary-model">Model ID</Label>
            <Input
              id="onboarding-summary-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="google/gemma-4-26b-a4b-it"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onComplete} disabled={saving}>
              Skip for now
            </Button>
            <Button onClick={() => void handleStart()} disabled={saving}>
              {saving ? 'Saving…' : 'Start Transcribing'}
            </Button>
          </div>
        </div>
      </div>
    </StepWrapper>
  );
}
