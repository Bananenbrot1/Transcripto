import { useState, useEffect, useCallback } from 'react';
import type { ModelStatus, ModelDefinition } from '@/types/transcription';

const DEFAULT_MODEL = 'large-v3-turbo-q5';
const DEFAULT_LANGUAGE = 'auto';

export function useModelStatus() {
  const [status, setStatus] = useState<ModelStatus>({
    downloaded: false,
    downloading: false,
    progress: 0,
    error: null,
    whisperReady: false,
  });

  const [models, setModels] = useState<ModelDefinition[]>([]);

  const [selectedModel, setSelectedModelState] = useState<string>(
    () => localStorage.getItem('transcripto-model') || DEFAULT_MODEL,
  );

  const [selectedLanguage, setSelectedLanguageState] = useState<string>(
    () => localStorage.getItem('transcripto-language') || DEFAULT_LANGUAGE,
  );

  const setSelectedModel = useCallback((id: string) => {
    localStorage.setItem('transcripto-model', id);
    setSelectedModelState(id);
  }, []);

  const setSelectedLanguage = useCallback((lang: string) => {
    localStorage.setItem('transcripto-language', lang);
    setSelectedLanguageState(lang);
  }, []);

  // Fetch model catalog on mount
  useEffect(() => {
    window.electronAPI.getAvailableModels().then(setModels);
  }, []);

  // Check if selected model is already downloaded
  useEffect(() => {
    window.electronAPI.checkModelStatus(selectedModel).then(({ downloaded }) => {
      setStatus((s) => ({ ...s, downloaded }));
    });
  }, [selectedModel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onDownloadProgress((progress) => {
      setStatus((s) => ({ ...s, progress: progress.percent }));
    });
    return unsubscribe;
  }, []);

  const downloadModel = useCallback(async () => {
    setStatus((s) => ({ ...s, downloading: true, error: null, progress: 0 }));
    try {
      await window.electronAPI.downloadModel(selectedModel);
      setStatus((s) => ({ ...s, downloaded: true, downloading: false, progress: 100 }));
    } catch (err) {
      setStatus((s) => ({
        ...s,
        downloading: false,
        error: err instanceof Error ? err.message : 'Download failed',
      }));
    }
  }, [selectedModel]);

  const initializeWhisper = useCallback(async () => {
    try {
      await window.electronAPI.initializeWhisper(selectedModel);
      setStatus((s) => ({ ...s, whisperReady: true }));
    } catch (err) {
      setStatus((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Initialization failed',
      }));
    }
  }, [selectedModel]);

  const changeModel = useCallback(async () => {
    await window.electronAPI.releaseWhisper();
    setStatus((s) => ({ ...s, whisperReady: false, downloaded: false }));
  }, []);

  return {
    status,
    models,
    selectedModel,
    selectedLanguage,
    setSelectedModel,
    setSelectedLanguage,
    downloadModel,
    initializeWhisper,
    changeModel,
  };
}
