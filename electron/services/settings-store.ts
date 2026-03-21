import Store from 'electron-store';
import type { StoreSchema } from '../../shared/types.js';
import { STORE_DEFAULTS } from '../../shared/store-defaults.js';

const store = new Store<StoreSchema>({
  name: 'settings',
  defaults: STORE_DEFAULTS,
});

/**
 * Replace a stored template with the current default if it matches any known
 * outdated version. This runs on every launch — no version tracking needed.
 * Users who customized their template won't be affected.
 */
function upgradeDefaults() {
  const oldBodyTemplates = [
    `# {{title}}\n\n**Date:** {{date}}\n**Duration:** {{duration}}\n\n---\n\n{{segments}}`,
  ];

  const oldPromptTemplates = [
    `Summarize the following meeting transcript titled "{{title}}".\nHighlight key decisions, action items, and topics discussed.\nUse markdown formatting.\n\n{{transcript}}`,
    `Summarize the following meeting transcript titled "{{title}}".\nHighlight key decisions, action items, and topics discussed.\nUse markdown formatting.\nWrite the summary in {{language}}.\n\n{{transcript}}`,
  ];

  const exp = store.get('export');
  if (oldBodyTemplates.includes(exp.bodyTemplate)) {
    store.set('export.bodyTemplate', STORE_DEFAULTS.export.bodyTemplate);
  }

  const sum = store.get('summary');
  if (oldPromptTemplates.includes(sum.promptTemplate)) {
    store.set('summary.promptTemplate', STORE_DEFAULTS.summary.promptTemplate);
  }
}

upgradeDefaults();

export function get<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
  return store.get(key);
}

export function set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
  store.set(key, value);
}

export function getAll(): StoreSchema {
  return store.store;
}
