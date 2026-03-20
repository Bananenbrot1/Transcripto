import { useState, useCallback, useEffect } from 'react';
import { useStoreValue } from './use-store';

export interface SummarySettings {
  apiBaseUrl: string;
  apiKey: string;
  modelId: string;
  promptTemplate: string;
}

export function useSummarySettings() {
  const [summaryData, setSummaryData] = useStoreValue('summary');
  const [decryptedKey, setDecryptedKey] = useState('');
  const [keyLoaded, setKeyLoaded] = useState(false);

  // Decrypt the API key on mount / when the encrypted value changes
  useEffect(() => {
    if (!summaryData.apiKey) {
      setDecryptedKey('');
      setKeyLoaded(true);
      return;
    }
    window.electronAPI.decryptString(summaryData.apiKey)
      .then(setDecryptedKey)
      .catch(() => setDecryptedKey(''))
      .finally(() => setKeyLoaded(true));
  }, [summaryData.apiKey]);

  const setApiBaseUrl = useCallback((value: string) => {
    setSummaryData({ ...summaryData, apiBaseUrl: value });
  }, [summaryData, setSummaryData]);

  const setApiKey = useCallback(async (plaintext: string) => {
    if (!plaintext) {
      setSummaryData({ ...summaryData, apiKey: '' });
      setDecryptedKey('');
      return;
    }
    const encrypted = await window.electronAPI.encryptString(plaintext);
    setSummaryData({ ...summaryData, apiKey: encrypted });
    setDecryptedKey(plaintext);
  }, [summaryData, setSummaryData]);

  const setModelId = useCallback((value: string) => {
    setSummaryData({ ...summaryData, modelId: value });
  }, [summaryData, setSummaryData]);

  const setPromptTemplate = useCallback((value: string) => {
    setSummaryData({ ...summaryData, promptTemplate: value });
  }, [summaryData, setSummaryData]);

  const hasApiKey = keyLoaded && decryptedKey.length > 0;

  return {
    settings: summaryData,
    decryptedKey,
    hasApiKey,
    keyLoaded,
    setApiBaseUrl,
    setApiKey,
    setModelId,
    setPromptTemplate,
  };
}
