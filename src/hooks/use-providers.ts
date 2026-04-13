import { useState, useEffect, useCallback } from 'react';
import type { Provider, LlmModelDefinition, LlmDownloadProgress } from '../../shared/types';

export interface ProviderRegistry {
  providers: Provider[];
  loading: boolean;
  refresh: () => Promise<void>;
  addProvider: (data: Omit<Provider, 'id'>) => Promise<Provider>;
  updateProvider: (provider: Provider) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  testProvider: (provider: Provider) => Promise<{ ok: boolean; error?: string }>;
}

export function useProviders(): ProviderRegistry {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.getProviders();
    setProviders(list);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const addProvider = useCallback(async (data: Omit<Provider, 'id'>) => {
    const created = await window.electronAPI.addProvider(data);
    setProviders((prev) => [...prev, created]);
    return created;
  }, []);

  const updateProvider = useCallback(async (provider: Provider) => {
    await window.electronAPI.updateProvider(provider);
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? provider : p)));
  }, []);

  const deleteProvider = useCallback(async (id: string) => {
    await window.electronAPI.deleteProvider(id);
    setProviders((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const testProvider = useCallback(
    (provider: Provider) => window.electronAPI.testProvider(provider),
    [],
  );

  return { providers, loading, refresh, addProvider, updateProvider, deleteProvider, testProvider };
}

export function useLlmModels() {
  const [models, setModels] = useState<LlmModelDefinition[]>([]);
  const [downloadStatus, setDownloadStatus] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    void window.electronAPI.getAvailableLlmModels().then(setModels);
  }, []);

  useEffect(() => {
    if (models.length === 0) return;
    void Promise.all(models.map((m) => window.electronAPI.getLlmModelStatus(m.id))).then((statuses) => {
      const record: Record<string, boolean> = {};
      models.forEach((m, i) => { record[m.id] = statuses[i].downloaded; });
      setDownloadStatus(record);
    });
  }, [models]);

  useEffect(() => {
    return window.electronAPI.onLlmDownloadProgress((progress: LlmDownloadProgress) => {
      setDownloadProgress((prev) => ({ ...prev, [progress.modelId]: progress.percent }));
      if (progress.percent >= 100) {
        setDownloadStatus((prev) => ({ ...prev, [progress.modelId]: true }));
        setDownloadProgress((prev) => {
          const next = { ...prev };
          delete next[progress.modelId];
          return next;
        });
      }
    });
  }, []);

  const downloadModel = useCallback(async (modelId: string) => {
    await window.electronAPI.downloadLlmModel(modelId);
    // Guarantee the status is marked complete even if the 100% progress event
    // was missed (e.g. listener was briefly unmounted during download).
    setDownloadStatus((prev) => ({ ...prev, [modelId]: true }));
    setDownloadProgress((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
  }, []);

  const deleteModel = useCallback(async (modelId: string) => {
    await window.electronAPI.deleteLlmModel(modelId);
    setDownloadStatus((prev) => ({ ...prev, [modelId]: false }));
  }, []);

  return { models, downloadStatus, downloadProgress, downloadModel, deleteModel };
}
