import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: { isEncryptionAvailable: () => true, decryptString: (b: Buffer) => b.toString('utf8') },
}));

vi.mock('./settings-store.js', () => ({
  get: vi.fn(),
}));

vi.mock('./crypto-utils.js', () => ({
  decryptString: (s: string) => s,
}));

import * as settingsStore from './settings-store.js';
import type { Provider, ChatMessage } from '../../shared/types.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeFetchOk(content: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    text: () => Promise.resolve(''),
  } as Response);
}

function makeFetchError(status: number, body: string) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve({}),
  } as Response);
}

describe('llm-service cloud backend', async () => {
  const { complete, testConnection } = await import('./llm-service.js');

  const cloudProvider: Provider = {
    id: 'p1',
    name: 'OpenAI',
    type: 'cloud',
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(settingsStore.get).mockImplementation((key) => {
      if (key === 'providers') return [cloudProvider];
      return undefined as never;
    });
  });

  it('calls /chat/completions with Bearer auth and returns content', async () => {
    mockFetch.mockReturnValueOnce(makeFetchOk('Hello!'));
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const result = await complete('p1', 'gpt-4o', messages);
    expect(result).toBe('Hello!');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValueOnce(makeFetchError(401, 'Unauthorized'));
    await expect(complete('p1', 'gpt-4o', [])).rejects.toThrow('API error 401');
  });

  it('testConnection returns ok:true on success', async () => {
    mockFetch.mockReturnValueOnce(makeFetchOk('ok'));
    const result = await testConnection(cloudProvider);
    expect(result.ok).toBe(true);
  });

  it('testConnection returns ok:false on error', async () => {
    mockFetch.mockReturnValueOnce(makeFetchError(403, 'Forbidden'));
    const result = await testConnection(cloudProvider);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
  });

  it('throws when provider not found', async () => {
    await expect(complete('missing', 'gpt-4o', [])).rejects.toThrow('Provider not found');
  });
});

describe('llm-service ollama backend', async () => {
  const { complete, ollamaListModels } = await import('./llm-service.js');

  const ollamaProvider: Provider = {
    id: 'p2',
    name: 'Local Ollama',
    type: 'ollama',
    ollamaBaseUrl: 'http://localhost:11434',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(settingsStore.get).mockImplementation((key) => {
      if (key === 'providers') return [ollamaProvider];
      return undefined as never;
    });
  });

  it('calls Ollama OpenAI-compatible endpoint', async () => {
    mockFetch.mockReturnValueOnce(makeFetchOk('Ollama response'));
    const result = await complete('p2', 'llama3.2', [{ role: 'user', content: 'Hello' }]);
    expect(result).toBe('Ollama response');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('ollamaListModels returns model names', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3.2' }, { name: 'mistral' }] }),
      } as Response),
    );
    const models = await ollamaListModels('http://localhost:11434');
    expect(models).toEqual(['llama3.2', 'mistral']);
  });
});
