import * as settingsStore from './settings-store.js';
import { decryptString } from './crypto-utils.js';
import * as llmModelManager from './llm-model-manager.js';
import type { Provider, ChatMessage } from '../../shared/types.js';
import type { getLlama as GetLlamaFn, LlamaChatSession as LlamaChatSessionClass } from 'node-llama-cpp';

type LlamaInstance = Awaited<ReturnType<typeof GetLlamaFn>>;
type LlamaModel = Awaited<ReturnType<LlamaInstance['loadModel']>>;
type LlamaContext = Awaited<ReturnType<LlamaModel['createContext']>>;
type LlamaContextSequence = ReturnType<LlamaContext['getSequence']>;

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

// ─── Local backend state (lazy-loaded, one model at a time) ───────────────────

let llamaInstance: LlamaInstance | null = null;
let loadedModelId: string | null = null;
let loadedModel: LlamaModel | null = null;
let loadedContext: LlamaContext | null = null;

async function ensureLocalModel(localModelId: string): Promise<LlamaContext> {
  if (!llmModelManager.isLlmModelDownloaded(localModelId)) {
    throw new Error(`Local model "${localModelId}" is not downloaded. Download it in Settings > Providers.`);
  }

  // If a different model is loaded, tear it down first.
  if (loadedModelId !== null && loadedModelId !== localModelId) {
    if (loadedContext) { await loadedContext.dispose(); loadedContext = null; }
    if (loadedModel) { await loadedModel.dispose(); loadedModel = null; }
    loadedModelId = null;
  }

  if (!llamaInstance) {
    const { getLlama } = await import('node-llama-cpp');
    // build:'never' skips any compile attempt and uses the pre-downloaded binary.
    // Metal GPU is picked up automatically on Apple Silicon.
    llamaInstance = await getLlama({ build: 'never' });
  }

  if (!loadedModel) {
    const modelPath = llmModelManager.getLlmModelPath(localModelId);
    loadedModel = await llamaInstance.loadModel({ modelPath });
    loadedModelId = localModelId;
  }

  if (!loadedContext) {
    loadedContext = await loadedModel.createContext();
  }

  return loadedContext;
}

async function localComplete(
  provider: Provider,
  _modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const localModelId = provider.localModelId;
  if (!localModelId) throw new Error('Local provider has no model configured');

  const { LlamaChatSession } = await import('node-llama-cpp');
  const context = await ensureLocalModel(localModelId);

  // Each call gets a fresh sequence — no chat history bleeds between corrections.
  const sequence = context.getSequence() as LlamaContextSequence;
  const session = new LlamaChatSession({ contextSequence: sequence as ConstructorParameters<typeof LlamaChatSessionClass>[0]['contextSequence'] });

  const userContent = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  try {
    return (await session.prompt(userContent)).trim();
  } finally {
    await session.dispose();
    sequence.dispose(); // Return the slot to the pool — missing this caused "No sequences left"
  }
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
      case 'local': {
        const modelId = provider.localModelId;
        if (!modelId) return { ok: false, error: 'No model configured for this provider' };
        if (!llmModelManager.isLlmModelDownloaded(modelId)) {
          return { ok: false, error: 'Model not downloaded yet. Download it in Settings > Providers.' };
        }
        // Model exists — that is sufficient for a connectivity test on a local provider.
        break;
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Releases the loaded local model. Called on app quit. */
export async function releaseLocalModel(): Promise<void> {
  if (loadedContext) { await loadedContext.dispose(); loadedContext = null; }
  if (loadedModel) { await loadedModel.dispose(); loadedModel = null; }
  loadedModelId = null;
  llamaInstance = null;
}
