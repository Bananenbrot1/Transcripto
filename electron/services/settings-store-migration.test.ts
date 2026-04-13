import { describe, it, expect } from 'vitest';
import { migrateV1ToV2 } from './migrate-settings-v1-v2.js';

describe('migrateV1ToV2', () => {
  it('creates a cloud provider from old summary.apiBaseUrl + apiKey', () => {
    const raw: Record<string, unknown> = {
      summary: {
        apiBaseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'encrypted-key',
        modelId: 'claude-3',
        promptTemplate: 'template',
      },
    };
    const result = migrateV1ToV2(raw);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].type).toBe('cloud');
    expect(result.providers[0].apiBaseUrl).toBe('https://openrouter.ai/api/v1');
    expect(result.providers[0].apiKey).toBe('encrypted-key');
    expect(result.summary.providerId).toBe(result.providers[0].id);
    expect(result.summary.modelId).toBe('claude-3');
  });

  it('is a no-op when providers already exist', () => {
    const raw: Record<string, unknown> = {
      providers: [{ id: 'existing', name: 'Existing', type: 'cloud' }],
      summary: { apiBaseUrl: 'https://api.openai.com/v1', apiKey: 'key', modelId: 'm', promptTemplate: 't' },
    };
    const result = migrateV1ToV2(raw);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].id).toBe('existing');
  });

  it('is a no-op when no old apiBaseUrl exists', () => {
    const raw: Record<string, unknown> = {
      summary: { modelId: 'x', promptTemplate: 'y' },
    };
    const result = migrateV1ToV2(raw);
    expect(result.providers ?? []).toHaveLength(0);
  });
});
