import type { Provider } from '../../shared/types.js';
import { STORE_DEFAULTS } from '../../shared/store-defaults.js';
import * as crypto from 'node:crypto';

export interface MigrationResult {
  providers: Provider[];
  summary: { providerId: string | null; modelId: string; promptTemplate: string };
}

export function migrateV1ToV2(raw: Record<string, unknown>): MigrationResult {
  const oldSummary = raw.summary as Record<string, unknown> | undefined;
  const existingProviders = (raw.providers as Provider[] | undefined) ?? [];

  if (existingProviders.length > 0) {
    return {
      providers: existingProviders,
      summary: {
        providerId: (oldSummary?.providerId as string | null | undefined) ?? null,
        modelId: (oldSummary?.modelId as string | undefined) ?? '',
        promptTemplate: (oldSummary?.promptTemplate as string | undefined) ?? STORE_DEFAULTS.summary.promptTemplate,
      },
    };
  }

  const oldApiBaseUrl = oldSummary?.apiBaseUrl as string | undefined;
  const oldApiKey = oldSummary?.apiKey as string | undefined;

  if (!oldApiBaseUrl) {
    return {
      providers: [],
      summary: {
        providerId: null,
        modelId: (oldSummary?.modelId as string | undefined) ?? STORE_DEFAULTS.summary.modelId,
        promptTemplate: (oldSummary?.promptTemplate as string | undefined) ?? STORE_DEFAULTS.summary.promptTemplate,
      },
    };
  }

  const providerId = crypto.randomUUID();
  const newProvider: Provider = {
    id: providerId,
    name: 'My Provider',
    type: 'cloud',
    apiBaseUrl: oldApiBaseUrl,
    apiKey: oldApiKey || '',
  };

  return {
    providers: [newProvider],
    summary: {
      providerId,
      modelId: (oldSummary?.modelId as string | undefined) ?? STORE_DEFAULTS.summary.modelId,
      promptTemplate: (oldSummary?.promptTemplate as string | undefined) ?? STORE_DEFAULTS.summary.promptTemplate,
    },
  };
}
