import { useState, useEffect } from 'react';
import { ChevronLeft, Sparkles, Eye, EyeOff, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StepWrapper } from '../step-wrapper';
import type { SummarySettings } from '@/hooks/use-summary-settings';

interface AiSummaryStepProps {
  direction: number;
  summarySettings: SummarySettings;
  summaryDecryptedKey: string;
  onApiBaseUrlChange: (url: string) => void;
  onApiKeyChange: (key: string) => Promise<void>;
  onModelIdChange: (modelId: string) => void;
  onComplete: () => void;
  onBack: () => void;
}

export function AiSummaryStep({
  direction,
  summarySettings,
  summaryDecryptedKey,
  onApiBaseUrlChange,
  onApiKeyChange,
  onModelIdChange,
  onComplete,
  onBack,
}: AiSummaryStepProps) {
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyInitialized, setKeyInitialized] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  // Initialize the key input from the decrypted value once it's available.
  // Same pattern as SummarySettingsTab in settings-dialog.tsx.
  useEffect(() => {
    if (!keyInitialized && summaryDecryptedKey !== undefined) {
      setKeyInput(summaryDecryptedKey);
      setKeyInitialized(true);
    }
  }, [summaryDecryptedKey, keyInitialized]);

  const handleKeyBlur = () => {
    if (keyInput !== summaryDecryptedKey) {
      onApiKeyChange(keyInput);
    }
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const result = await window.electronAPI.testSummaryConnection();
      if (result.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(result.error || 'Unknown error');
      }
    } catch (err) {
      setTestStatus('error');
      setTestError((err as Error).message);
    }
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
            Optionally connect an AI provider to generate meeting summaries and live notes.
            You can always set this up later in Settings.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-summary-base-url">API Base URL</Label>
            <Input
              id="onboarding-summary-base-url"
              value={summarySettings.apiBaseUrl}
              onChange={(e) => onApiBaseUrlChange(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboarding-summary-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="onboarding-summary-api-key"
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onBlur={handleKeyBlur}
                placeholder="sk-..."
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Stored encrypted on your Mac</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboarding-summary-model">Model ID</Label>
            <Input
              id="onboarding-summary-model"
              value={summarySettings.modelId}
              onChange={(e) => onModelIdChange(e.target.value)}
              placeholder="google/gemma-4-26b-a4b-it"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing' || !keyInput}
            >
              {testStatus === 'testing' && <Loader2 className="size-3.5 animate-spin" />}
              {testStatus === 'success' && <Check className="size-3.5 text-green-600" />}
              {testStatus === 'error' && <AlertCircle className="size-3.5 text-destructive" />}
              {testStatus === 'idle' && <Sparkles className="size-3.5" />}
              Test Connection
            </Button>
            {testStatus === 'success' && (
              <span className="text-xs text-green-600 font-medium">Connected successfully</span>
            )}
            {testStatus === 'error' && (
              <span className="text-xs text-destructive font-medium truncate max-w-[200px]" title={testError}>
                {testError}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onComplete}>
              Skip for now
            </Button>
            <Button onClick={onComplete}>
              Start Transcribing
            </Button>
          </div>
        </div>
      </div>
    </StepWrapper>
  );
}
