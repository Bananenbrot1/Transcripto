import type { StoreSchema } from './types.js';

export const STORE_DEFAULTS: StoreSchema = {
  model: 'large-v3-turbo-q5',
  language: 'auto',
  onboardingComplete: false,
  darkMode: null,
  export: {
    folder: '',
    filenameTemplate: '{{date}} {{title}}',
    bodyTemplate: `# {{title}}

**Date:** {{date}}
**Duration:** {{duration}}

---

{{segments}}`,
    autoSave: false,
  },
  vad: {
    silenceThreshold: 0.01,
    silenceDurationMs: 800,
    maxSegmentMs: 30000,
    minSegmentMs: 500,
  },
};
