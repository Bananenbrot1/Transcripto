import { useCallback, useMemo } from 'react';
import { useStoreValue } from './use-store';
import type { Provider } from '../../shared/types';

export interface SummarySettings {
  providerId: string | null;
  modelId: string;
  promptTemplate: string;
}

export function useSummarySettings(providers: Provider[]) {
  const [summaryData, setSummaryData] = useStoreValue('summary');

  const hasProvider = useMemo(
    () =>
      summaryData.providerId !== null &&
      providers.some((p) => p.id === summaryData.providerId),
    [summaryData.providerId, providers],
  );

  const setProviderId = useCallback(
    (providerId: string | null) => setSummaryData({ ...summaryData, providerId }),
    [summaryData, setSummaryData],
  );

  const setModelId = useCallback(
    (modelId: string) => setSummaryData({ ...summaryData, modelId }),
    [summaryData, setSummaryData],
  );

  const setPromptTemplate = useCallback(
    (promptTemplate: string) => setSummaryData({ ...summaryData, promptTemplate }),
    [summaryData, setSummaryData],
  );

  return {
    settings: summaryData,
    hasProvider,
    setProviderId,
    setModelId,
    setPromptTemplate,
  };
}
