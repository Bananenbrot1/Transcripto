import type { StoreSchema } from './types.js';

export const STORE_DEFAULTS: StoreSchema = {
  model: 'parakeet-tdt-0.6b-v3',
  language: 'auto',
  onboardingComplete: false,
  darkMode: null,
  export: {
    folder: '',
    filenameTemplate: '{{date}} {{title}}',
    bodyTemplate: `# {{title}}

**Date:** {{date}}
**Duration:** {{duration}}

## Summary

{{summary}}

---

## Segments
{{segments}}`,
  },
  providers: [],
  summary: {
    providerId: null,
    modelId: 'anthropic/claude-sonnet-4-20250514',
    promptTemplate: `Summarize the following meeting transcript titled "{{title}}".
Highlight key decisions, action items, and topics discussed.
Use markdown formatting with headings starting at ### (h3) level.
Write the summary in {{language}}.

{{transcript}}`,
  },
  correction: {
    enabled: false,
    providerId: null,
    modelId: '',
  },
  vocabulary: [],
  vad: {
    silenceThreshold: 0.015,
    silenceDurationMs: 800,
    maxSegmentMs: 30000,
    minSegmentMs: 800,
  },
  shortcuts: {
    toggleRecording: null,
    togglePause: null,
    toggleMicMute: null,
  },
  liveSummary: {
    enabled: false,
    intervalSeconds: 60,
    splitPosition: 50,
    formatTemplate: `Available sections (only include those with substance):
### Key Topics
### Decisions
### Action Items
### Open Points
(Things raised but not yet resolved — remove once addressed)
### Recommendations
(Important topics not yet covered given the nature of this meeting — remove once discussed)
### Discussion
Use bullet points. Keep it concise. Omit any section that has no content yet.`,
  },
};
