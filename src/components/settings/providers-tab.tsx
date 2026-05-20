import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Download, HardDrive, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLlmModels, type ProviderRegistry } from '@/hooks/use-providers';
import type { Provider, ProviderType } from '../../../shared/types';

const BUILTIN_LOCAL_MODEL_ID = 'smollm2-360m-q4';


function ProviderTypeBadge({ type }: { type: ProviderType }) {
  const styles: Record<ProviderType, string> = {
    cloud: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    ollama: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    local: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };
  const labels: Record<ProviderType, string> = { cloud: 'Cloud', ollama: 'Ollama', local: 'Local' };
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

/**
 * Simple download status widget for the single built-in local model (SmolLM2 360M).
 * No selection needed — a local provider always uses this model.
 */
function LocalModelDownloader() {
  const { models, downloadStatus, downloadProgress, downloadModel, deleteModel } = useLlmModels();
  const model = models.find((m) => m.id === BUILTIN_LOCAL_MODEL_ID);
  if (!model) return null;

  const downloaded = downloadStatus[model.id] ?? false;
  const progress = downloadProgress[model.id];
  const isDownloading = progress !== undefined;

  return (
    <div className="space-y-1.5">
      <Label>Built-in model</Label>
      <div className="flex items-center gap-3 px-3 py-2 border rounded-md bg-muted/20 text-sm">
        <HardDrive className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">{model.label}</p>
          <p className="text-xs text-muted-foreground">{model.sizeMB} MB · runs on CPU</p>
        </div>
        {isDownloading ? (
          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
        ) : downloaded ? (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <Check className="size-3.5" />
            <span className="text-xs font-medium">Ready</span>
            <button
              type="button"
              onClick={() => void deleteModel(model.id)}
              className="ml-1 text-muted-foreground hover:text-destructive"
              title="Delete model file"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="h-7 gap-1"
            onClick={() => void downloadModel(model.id)}
          >
            <Download className="size-3.5" />
            Download
          </Button>
        )}
      </div>
    </div>
  );
}

function ProviderForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Provider;
  onSave: (data: Omit<Provider, 'id'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<ProviderType>(initial?.type ?? 'cloud');
  const [apiBaseUrl, setApiBaseUrl] = useState(initial?.apiBaseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(initial?.ollamaBaseUrl ?? 'http://localhost:11434');
  const [saving, setSaving] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const handleFetchOllamaModels = async () => {
    setFetchingModels(true);
    try {
      const models = await window.electronAPI.ollamaListModels(ollamaBaseUrl);
      setOllamaModels(models);
    } catch {
      setOllamaModels([]);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const cloudKey =
        type === 'cloud'
          ? apiKey
            ? await window.electronAPI.encryptString(apiKey)
            : initial?.type === 'cloud' && initial.apiKey
              ? initial.apiKey
              : undefined
          : undefined;

      const data: Omit<Provider, 'id'> = {
        name: name.trim(),
        type,
        ...(type === 'cloud' && {
          apiBaseUrl,
          ...(cloudKey !== undefined ? { apiKey: cloudKey } : {}),
        }),
        ...(type === 'ollama' && { ollamaBaseUrl }),
        // Local always uses the single built-in SmolLM2 model
        ...(type === 'local' && { localModelId: BUILTIN_LOCAL_MODEL_ID }),
      };
      await onSave(initial ? { ...data, id: initial.id } : data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
      <div className="space-y-1.5">
        <Label htmlFor="prov-name">Name</Label>
        <Input id="prov-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Provider" />
      </div>

      <div className="space-y-1.5">
        <Label>Type</Label>
        <div className="flex gap-2">
          {(['cloud', 'ollama', 'local'] as ProviderType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {type === 'cloud' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="prov-base-url">Base URL</Label>
            <Input
              id="prov-base-url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prov-api-key">API Key</Label>
            <Input
              id="prov-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={initial?.apiKey ? '••••••••••••• (leave blank to keep)' : 'sk-...'}
            />
            <p className="text-xs text-muted-foreground">Stored encrypted on your machine</p>
          </div>
        </>
      )}

      {type === 'ollama' && (
        <div className="space-y-1.5">
          <Label htmlFor="prov-ollama-url">Ollama Base URL</Label>
          <div className="flex gap-2">
            <Input
              id="prov-ollama-url"
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="flex-1"
            />
            <Button variant="outline" size="sm" type="button" onClick={() => void handleFetchOllamaModels()} disabled={fetchingModels}>
              {fetchingModels ? <Loader2 className="size-3.5 animate-spin" /> : 'Fetch models'}
            </Button>
          </div>
          {ollamaModels.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Available: {ollamaModels.join(', ')}
            </p>
          )}
        </div>
      )}

      {type === 'local' && <LocalModelDownloader />}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
          {initial ? 'Save' : 'Add Provider'}
        </Button>
      </div>
    </div>
  );
}

export function ProvidersTab({ registry }: { registry: ProviderRegistry }) {
  const { providers, addProvider, updateProvider, deleteProvider } = registry;
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);

  const handleSave = useCallback(async (data: Omit<Provider, 'id'> & { id?: string }) => {
    if (data.id) {
      await updateProvider(data as Provider);
    } else {
      await addProvider(data as Omit<Provider, 'id'>);
    }
    setEditingId(null);
  }, [addProvider, updateProvider]);

  return (
    <div className="space-y-4">
      {providers.length === 0 && editingId !== 'new' && (
        <p className="text-sm text-muted-foreground italic">
          No providers configured. Add one to use AI features.
        </p>
      )}

      {providers.map((p) => (
        <div key={p.id}>
          {editingId === p.id ? (
            <ProviderForm initial={p} onSave={handleSave} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{p.name}</span>
                  <ProviderTypeBadge type={p.type} />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 px-2" type="button" onClick={() => setEditingId(p.id)} title="Edit">
                  <Pencil className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  type="button"
                  onClick={() => void deleteProvider(p.id)}
                  title="Delete"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {editingId === 'new' ? (
        <ProviderForm onSave={handleSave} onCancel={() => setEditingId(null)} />
      ) : (
        <Button variant="outline" size="sm" type="button" onClick={() => setEditingId('new')} className="w-full gap-1">
          <Plus className="size-3.5" />
          Add Provider
        </Button>
      )}
    </div>
  );
}
