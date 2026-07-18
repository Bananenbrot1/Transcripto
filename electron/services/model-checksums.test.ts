import { describe, expect, it } from 'vitest';
import { getAvailableModels } from './model-manager.js';
import { getAvailableLlmModels } from './llm-model-manager.js';

const SHA256_HEX = /^[a-f0-9]{64}$/;

describe('model catalog checksums', () => {
  it('pins a SHA-256 for every STT model', () => {
    for (const model of getAvailableModels()) {
      expect(model.sha256, `${model.id} missing sha256`).toMatch(SHA256_HEX);
    }
  });

  it('lists models with Parakeet and Turbo before legacy Medium', () => {
    const ids = getAvailableModels().map((m) => m.id);
    expect(ids.indexOf('parakeet-tdt-0.6b-v3')).toBeLessThan(ids.indexOf('large-v3-turbo-q5'));
    expect(ids.indexOf('large-v3-turbo-q5')).toBeLessThan(ids.indexOf('medium'));
    expect(ids.at(-1)).toBe('medium');
  });

  it('pins a SHA-256 for every built-in LLM model', () => {
    for (const model of getAvailableLlmModels()) {
      expect(model.sha256, `${model.id} missing sha256`).toMatch(SHA256_HEX);
    }
  });
});
