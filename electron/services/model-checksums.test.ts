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

  it('pins a SHA-256 for every built-in LLM model', () => {
    for (const model of getAvailableLlmModels()) {
      expect(model.sha256, `${model.id} missing sha256`).toMatch(SHA256_HEX);
    }
  });
});
