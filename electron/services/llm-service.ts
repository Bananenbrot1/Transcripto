import * as settingsStore from './settings-store.js';
import { decryptString } from './crypto-utils.js';
import type { Provider, ChatMessage } from '../../shared/types.js';

function getProvider(providerId: string): Provider {
  const providers = settingsStore.get('providers');
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Provider not found: ${providerId}`);
  return provider;
}

async function parseCompletion(response: Response): Promise<string> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }
  const data = await response.json();
  return (data.choices?.[0]?.message?.content as string) ?? '';
}

async function cloudComplete(
  provider: Provider,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const base = provider.apiBaseUrl;
  if (!base) throw new Error('Cloud provider has no API base URL configured');
  const apiKey = provider.apiKey ? decryptString(provider.apiKey) : '';
  const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelId, messages }),
  });
  return parseCompletion(response);
}

async function ollamaComplete(
  provider: Provider,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const base = (provider.ollamaBaseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages }),
  });
  return parseCompletion(response);
}

export async function ollamaListModels(ollamaBaseUrl: string): Promise<string[]> {
  const base = ollamaBaseUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/api/tags`);
  if (!response.ok) throw new Error(`Ollama error ${response.status}`);
  const data = await response.json();
  return ((data.models ?? []) as { name: string }[]).map((m) => m.name);
}

async function localComplete(
  _provider: Provider,
  _modelId: string,
  _messages: ChatMessage[],
): Promise<string> {
  throw new Error('Local GGUF backend not yet implemented. Use a cloud or Ollama provider.');
}

export async function complete(
  providerId: string,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const provider = getProvider(providerId);
  switch (provider.type) {
    case 'cloud':
      return cloudComplete(provider, modelId, messages);
    case 'ollama':
      return ollamaComplete(provider, modelId, messages);
    case 'local':
      return localComplete(provider, modelId, messages);
  }
}

export async function testConnection(
  provider: Provider,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const testMessages: ChatMessage[] = [{ role: 'user', content: 'Reply with "ok".' }];
    switch (provider.type) {
      case 'cloud':
        await cloudComplete(provider, '', testMessages);
        break;
      case 'ollama':
        await ollamaComplete(provider, '', testMessages);
        break;
      case 'local':
        throw new Error('Local GGUF backend not yet implemented.');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Reserved for future local GGUF unload (Task 8). */
export async function releaseLocalModel(): Promise<void> {
  // no-op until local backend is implemented
}
