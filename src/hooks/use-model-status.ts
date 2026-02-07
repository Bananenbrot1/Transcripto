import { useState, useEffect, useCallback } from 'react';
import type { ModelStatus } from '@/types/transcription';

export function useModelStatus() {
  const [status, setStatus] = useState<ModelStatus>({
    downloaded: false,
    downloading: false,
    progress: 0,
    error: null,
    whisperReady: false,
  });

  useEffect(() => {
    window.electronAPI.checkModelStatus().then(({ downloaded }) => {
      setStatus((s) => ({ ...s, downloaded }));
    });
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onDownloadProgress((progress) => {
      setStatus((s) => ({ ...s, progress: progress.percent }));
    });
    return unsubscribe;
  }, []);

  const downloadModel = useCallback(async () => {
    setStatus((s) => ({ ...s, downloading: true, error: null, progress: 0 }));
    try {
      await window.electronAPI.downloadModel();
      setStatus((s) => ({ ...s, downloaded: true, downloading: false, progress: 100 }));
    } catch (err) {
      setStatus((s) => ({
        ...s,
        downloading: false,
        error: err instanceof Error ? err.message : 'Download failed',
      }));
    }
  }, []);

  const initializeWhisper = useCallback(async () => {
    try {
      await window.electronAPI.initializeWhisper();
      setStatus((s) => ({ ...s, whisperReady: true }));
    } catch (err) {
      setStatus((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Initialization failed',
      }));
    }
  }, []);

  return { status, downloadModel, initializeWhisper };
}
