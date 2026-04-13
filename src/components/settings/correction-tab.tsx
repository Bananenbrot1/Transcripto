import { useCallback, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useStoreValue } from '@/hooks/use-store';
import type { Provider } from '../../../shared/types';

function ProviderModelSelector({
  providerId,
  modelId,
  providers,
  onProviderChange,
  onModelChange,
}: {
  providerId: string | null;
  modelId: string;
  providers: Provider[];
  onProviderChange: (id: string | null) => void;
  onModelChange: (id: string) => void;
}) {
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const selectedProvider = providers.find((p) => p.id === providerId) ?? null;

  const handleProviderChange = async (id: string) => {
    onProviderChange(id || null);
    const provider = providers.find((p) => p.id === id);
    if (provider?.type === 'ollama') {
      try {
        const models = await window.electronAPI.ollamaListModels(
          provider.ollamaBaseUrl ?? 'http://localhost:11434',
        );
        setOllamaModels(models);
      } catch {
        setOllamaModels([]);
      }
    } else {
      setOllamaModels([]);
    }
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="corr-provider">Provider</Label>
        <select
          id="corr-provider"
          value={providerId ?? ''}
          onChange={(e) => void handleProviderChange(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">— Select provider —</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedProvider && selectedProvider.type !== 'local' && (
        <div className="space-y-1.5">
          <Label htmlFor="corr-model">Model</Label>
          {selectedProvider.type === 'ollama' && ollamaModels.length > 0 ? (
            <select
              id="corr-model"
              value={modelId}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Select model —</option>
              {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <Input
              id="corr-model"
              value={modelId}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder="e.g. gpt-4o-mini"
            />
          )}
        </div>
      )}
    </>
  );
}

export function CorrectionTab({ providers }: { providers: Provider[] }) {
  const [correction, setCorrection] = useStoreValue('correction');
  const [vocabulary, setVocabulary] = useStoreValue('vocabulary');
  const [newTerm, setNewTerm] = useState('');

  const configuredProvider = providers.find((p) => p.id === correction.providerId);
  const canEnable = correction.providerId !== null && configuredProvider !== undefined;

  const addTerm = useCallback(() => {
    const term = newTerm.trim();
    if (!term || vocabulary.includes(term)) return;
    setVocabulary([...vocabulary, term]);
    setNewTerm('');
  }, [newTerm, vocabulary, setVocabulary]);

  const removeTerm = useCallback(
    (term: string) => setVocabulary(vocabulary.filter((t) => t !== term)),
    [vocabulary, setVocabulary],
  );

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="correction-enabled">Enable live correction</Label>
            <p className="text-xs text-muted-foreground">
              {!canEnable
                ? 'Configure a provider below to enable'
                : 'Silently cleans up each Whisper segment after transcription'}
            </p>
          </div>
          <Switch
            id="correction-enabled"
            checked={correction.enabled}
            onCheckedChange={(enabled) => setCorrection({ ...correction, enabled })}
            disabled={!canEnable}
          />
        </div>

        <ProviderModelSelector
          providerId={correction.providerId}
          modelId={correction.modelId}
          providers={providers}
          onProviderChange={(id) => setCorrection({ ...correction, providerId: id })}
          onModelChange={(mid) => setCorrection({ ...correction, modelId: mid })}
        />
      </section>

      <section className="space-y-3 border-t pt-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium">Global Vocabulary</h3>
          <p className="text-xs text-muted-foreground">
            Proper nouns, names, and jargon the LLM should recognise and correct.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTerm(); } }}
            placeholder="e.g. Max Kirschning"
            className="flex-1"
          />
          <Button variant="outline" size="sm" type="button" onClick={addTerm} disabled={!newTerm.trim()}>
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>

        {vocabulary.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {vocabulary.map((term) => (
              <span
                key={term}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-sm"
              >
                {term}
                <button
                  type="button"
                  onClick={() => removeTerm(term)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {vocabulary.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No vocabulary terms yet.</p>
        )}
      </section>
    </div>
  );
}
