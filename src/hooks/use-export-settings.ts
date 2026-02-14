import { useState, useCallback } from 'react';

const KEYS = {
  folder: 'transcripto-export-folder',
  filename: 'transcripto-export-filename',
  bodyTemplate: 'transcripto-export-body-template',
  autoSave: 'transcripto-export-auto-save',
} as const;

const DEFAULT_FILENAME = '{{date}} {{title}}';

const DEFAULT_BODY_TEMPLATE = `# {{title}}

**Date:** {{date}}
**Duration:** {{duration}}

---

{{segments}}`;

function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export interface ExportSettings {
  folder: string;
  filenameTemplate: string;
  bodyTemplate: string;
  autoSave: boolean;
}

export function useExportSettings() {
  const [folder, setFolderState] = useState(() =>
    readSetting(KEYS.folder, ''),
  );
  const [filenameTemplate, setFilenameTemplateState] = useState(() =>
    readSetting(KEYS.filename, DEFAULT_FILENAME),
  );
  const [bodyTemplate, setBodyTemplateState] = useState(() =>
    readSetting(KEYS.bodyTemplate, DEFAULT_BODY_TEMPLATE),
  );
  const [autoSave, setAutoSaveState] = useState(
    () => readSetting(KEYS.autoSave, 'false') === 'true',
  );

  const setFolder = useCallback((value: string) => {
    localStorage.setItem(KEYS.folder, value);
    setFolderState(value);
  }, []);

  const setFilenameTemplate = useCallback((value: string) => {
    localStorage.setItem(KEYS.filename, value);
    setFilenameTemplateState(value);
  }, []);

  const setBodyTemplate = useCallback((value: string) => {
    localStorage.setItem(KEYS.bodyTemplate, value);
    setBodyTemplateState(value);
  }, []);

  const setAutoSave = useCallback((value: boolean) => {
    localStorage.setItem(KEYS.autoSave, String(value));
    setAutoSaveState(value);
  }, []);

  const settings: ExportSettings = {
    folder,
    filenameTemplate,
    bodyTemplate,
    autoSave,
  };

  return {
    settings,
    setFolder,
    setFilenameTemplate,
    setBodyTemplate,
    setAutoSave,
  };
}
