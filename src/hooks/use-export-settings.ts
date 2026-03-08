import { useCallback } from 'react';
import { useStoreValue } from './use-store';

export interface ExportSettings {
  folder: string;
  filenameTemplate: string;
  bodyTemplate: string;
  autoSave: boolean;
}

export function useExportSettings() {
  const [exportData, setExportData] = useStoreValue('export');

  const setFolder = useCallback((value: string) => {
    setExportData({ ...exportData, folder: value });
  }, [exportData, setExportData]);

  const setFilenameTemplate = useCallback((value: string) => {
    setExportData({ ...exportData, filenameTemplate: value });
  }, [exportData, setExportData]);

  const setBodyTemplate = useCallback((value: string) => {
    setExportData({ ...exportData, bodyTemplate: value });
  }, [exportData, setExportData]);

  const setAutoSave = useCallback((value: boolean) => {
    setExportData({ ...exportData, autoSave: value });
  }, [exportData, setExportData]);

  const settings: ExportSettings = exportData;

  return {
    settings,
    setFolder,
    setFilenameTemplate,
    setBodyTemplate,
    setAutoSave,
  };
}
