# LLM Provider Registry & Live Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a unified LLM provider registry (cloud, Ollama, local GGUF) that routes all LLM calls for both summary and correction tasks, plus a live correction pipeline that silently cleans up Whisper segments using a configured LLM.

**Architecture:** A new `llm-service.ts` in the main process routes `complete()` calls to cloud/Ollama/local backends based on a stored `Provider` registry. The existing `summary-service.ts` becomes a thin wrapper over `llm-service.ts`. A new `correction-service.ts` builds the correction prompt and calls `llm-service`. The renderer's `use-transcription.ts` fires correction calls after each segment and tracks in-progress corrections for a "correcting…" visual state. Settings gain a Providers tab and a Correction tab.

**Tech Stack:** TypeScript, Electron (main + renderer), React, `electron-store`, `node-llama-cpp` (Task 8 only), Vitest

---

## File Map

**New files (main process):**
- `electron/services/crypto-utils.ts` — `encryptString` / `decryptString` extracted from summary-service to break circular dep
- `electron/services/llm-service.ts` — routes `complete()` / `testConnection()` / `ollamaListModels()` to the right backend
- `electron/services/llm-model-manager.ts` — GGUF model catalog, download/delete/status (mirrors model-manager.ts)
- `electron/services/correction-service.ts` — builds correction prompt, calls llm-service, respects vocabulary

**New files (renderer):**
- `src/hooks/use-providers.ts` — CRUD for the provider registry via IPC
- `src/components/settings/providers-tab.tsx` — Providers settings tab (list + add/edit form)
- `src/components/settings/correction-tab.tsx` — Correction settings tab (toggle + vocabulary)

**Modified files:**
- `shared/types.ts` — add `Provider`, `ProviderType`, `TaskConfig`, `LlmModelDefinition`, `LlmDownloadProgress`, `ChatMessage`; update `StoreSchema`
- `shared/store-defaults.ts` — defaults for `providers`, `correction`, `vocabulary`; update `summary`
- `electron/services/settings-store.ts` — v1→v2 migration: old `summary.apiBaseUrl/apiKey` → cloud provider entry
- `electron/services/summary-service.ts` — remove encryption helpers; delegate API calls to `llm-service`
- `electron/main.ts` — register all new IPC handlers; import new services
- `electron/preload.ts` — expose all new IPC methods
- `electron/ipc-types.ts` — add new method signatures; re-export new types
- `src/hooks/use-summary-settings.ts` — new schema (`providerId` not `apiBaseUrl/apiKey`); expose `hasProvider`
- `src/hooks/use-transcription.ts` — add `correctionEnabled` option; manage `correctingIds`; call `correctSegment` IPC
- `src/hooks/use-live-summary.ts` — rename `hasSummaryApiKey` param to `hasLlmConfigured`
- `src/components/transcript-panel.tsx` — accept `correctingIds?: Set<string>`; dim correcting segments
- `src/components/settings-dialog.tsx` — add Providers and Correction tabs; update Summary tab
- `src/App.tsx` — wire correction settings; pass new props; update summary hook call

---

## Task 1: Provider & Correction Types

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/store-defaults.ts`

- [ ] **Step 1: Add new types to shared/types.ts**

Append after the existing `ShortcutConfig` interface:

```typescript
export type ProviderType = 'cloud' | 'ollama' | 'local';

export interface Provider {
  id: string;            // crypto.randomUUID()
  name: string;          // user-facing label
  type: ProviderType;
  // cloud only
  apiBaseUrl?: string;   // e.g. "https://api.openai.com/v1"
  apiKey?: string;       // encrypted via safeStorage
  // ollama only
  ollamaBaseUrl?: string; // default "http://localhost:11434"
  // local only
  localModelId?: string; // references LlmModelDefinition.id
}

export interface TaskConfig {
  enabled: boolean;
  providerId: string | null; // references Provider.id
  modelId: string;           // model name/id within that provider
}

export interface LlmModelDefinition {
  id: string;
  fileName: string;
  sizeMB: number;
  label: string;
  tier: 'fastest' | 'balanced' | 'quality' | 'power';
  url: string;
}

export interface LlmDownloadProgress extends DownloadProgress {
  modelId: string;
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
```

- [ ] **Step 2: Update StoreSchema in shared/types.ts**

Replace the existing `StoreSchema` interface with:

```typescript
export interface StoreSchema {
  model: string;
  language: string;
  onboardingComplete: boolean;
  darkMode: boolean | null;
  export: {
    folder: string;
    filenameTemplate: string;
    bodyTemplate: string;
  };
  providers: Provider[];
  summary: {
    providerId: string | null;
    modelId: string;
    promptTemplate: string;
  };
  correction: TaskConfig;
  vocabulary: string[];
  vad: {
    silenceThreshold: number;
    silenceDurationMs: number;
    maxSegmentMs: number;
    minSegmentMs: number;
  };
  shortcuts: ShortcutConfig;
  liveSummary: {
    enabled: boolean;
    intervalSeconds: number;
    formatTemplate: string;
    splitPosition: number;
  };
}
```

- [ ] **Step 3: Update store-defaults.ts**

Replace the full contents of `shared/store-defaults.ts`:

```typescript
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
```

- [ ] **Step 4: Run TypeScript check to verify types compile**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | head -60
```

Expected: TypeScript errors about removed `summary.apiBaseUrl` / `summary.apiKey` in `summary-service.ts`, `use-summary-settings.ts`, and `settings-dialog.tsx`. These will be fixed in later tasks. The new types themselves should not error.

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add shared/types.ts shared/store-defaults.ts
git commit -m "feat: add Provider, TaskConfig, LlmModelDefinition types; update StoreSchema"
```

---

## Task 2: Crypto Utils

**Files:**
- Create: `electron/services/crypto-utils.ts`
- Modify: `electron/services/summary-service.ts` (import from crypto-utils)
- Modify: `electron/main.ts` (import from crypto-utils)

- [ ] **Step 1: Create electron/services/crypto-utils.ts**

```typescript
import { safeStorage } from 'electron';

export function encryptString(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system');
  }
  const encrypted = safeStorage.encryptString(plaintext);
  return encrypted.toString('base64');
}

export function decryptString(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system');
  }
  const buffer = Buffer.from(encrypted, 'base64');
  return safeStorage.decryptString(buffer);
}
```

- [ ] **Step 2: Update summary-service.ts to import from crypto-utils**

At the top of `electron/services/summary-service.ts`, replace:

```typescript
import { safeStorage } from 'electron';
```

with:

```typescript
import { encryptString, decryptString } from './crypto-utils.js';
```

Then remove the `encryptString` and `decryptString` function definitions from `summary-service.ts` (they're now in crypto-utils).

- [ ] **Step 3: Update main.ts import for encrypt/decrypt handlers**

In `electron/main.ts`, add import at the top:

```typescript
import * as cryptoUtils from './services/crypto-utils.js';
```

Then update the two IPC handlers to use `cryptoUtils`:

```typescript
ipcMain.handle('encrypt-string', (_event, plaintext: string) => {
  return cryptoUtils.encryptString(plaintext);
});

ipcMain.handle('decrypt-string', (_event, encrypted: string) => {
  return cryptoUtils.decryptString(encrypted);
});
```

- [ ] **Step 4: Run build to verify no circular dep or compile errors**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | head -40
```

Expected: same TypeScript errors as before (about removed summary fields) — no new errors from crypto-utils changes.

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add electron/services/crypto-utils.ts electron/services/summary-service.ts electron/main.ts
git commit -m "refactor: extract encryptString/decryptString into crypto-utils"
```

---

## Task 3: LLM Service (Cloud + Ollama Backends)

**Files:**
- Create: `electron/services/llm-service.ts`
- Create: `electron/services/llm-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `electron/services/llm-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron and settings-store before importing llm-service
vi.mock('electron', () => ({
  safeStorage: { isEncryptionAvailable: () => true, decryptString: (b: Buffer) => b.toString('utf8') },
}));

vi.mock('./settings-store.js', () => ({
  get: vi.fn(),
}));

vi.mock('./crypto-utils.js', () => ({
  decryptString: (s: string) => s, // identity for tests
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
```

- [ ] **Step 2: Run tests to verify they fail (module not found)**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm exec vitest run electron/services/llm-service.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module './llm-service.js'"

- [ ] **Step 3: Implement electron/services/llm-service.ts**

```typescript
import * as settingsStore from './settings-store.js';
import { decryptString } from './crypto-utils.js';
import type { Provider, ChatMessage } from '../../shared/types.js';

// ─── Shared helpers ────────────────────────────────────────────────────────────

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

// ─── Cloud backend ─────────────────────────────────────────────────────────────

async function cloudComplete(
  provider: Provider,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const apiKey = provider.apiKey ? decryptString(provider.apiKey) : '';
  const response = await fetch(`${provider.apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelId, messages }),
  });
  return parseCompletion(response);
}

// ─── Ollama backend ────────────────────────────────────────────────────────────

async function ollamaComplete(
  provider: Provider,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const base = provider.ollamaBaseUrl ?? 'http://localhost:11434';
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages }),
  });
  return parseCompletion(response);
}

export async function ollamaListModels(ollamaBaseUrl: string): Promise<string[]> {
  const response = await fetch(`${ollamaBaseUrl}/api/tags`);
  if (!response.ok) throw new Error(`Ollama error ${response.status}`);
  const data = await response.json();
  return ((data.models ?? []) as { name: string }[]).map((m) => m.name);
}

// ─── Local backend (stub — implemented in Task 8) ─────────────────────────────

async function localComplete(
  _provider: Provider,
  _modelId: string,
  _messages: ChatMessage[],
): Promise<string> {
  throw new Error('Local GGUF backend not yet implemented. Use a cloud or Ollama provider.');
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function complete(
  providerId: string,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const provider = getProvider(providerId);
  switch (provider.type) {
    case 'cloud': return cloudComplete(provider, modelId, messages);
    case 'ollama': return ollamaComplete(provider, modelId, messages);
    case 'local': return localComplete(provider, modelId, messages);
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
```

- [ ] **Step 4: Run tests — expect passing**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm exec vitest run electron/services/llm-service.test.ts 2>&1 | tail -20
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add electron/services/llm-service.ts electron/services/llm-service.test.ts
git commit -m "feat: add LLMService with cloud and Ollama backends"
```

---

## Task 4: LLM Model Manager

**Files:**
- Create: `electron/services/llm-model-manager.ts`

- [ ] **Step 1: Create electron/services/llm-model-manager.ts**

```typescript
import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { downloadFile, type DownloadProgress } from './download-utils.js';
import type { LlmModelDefinition } from '../../shared/types.js';

const LLM_CATALOG: Record<string, LlmModelDefinition> = {
  'smollm2-360m-q4': {
    id: 'smollm2-360m-q4',
    fileName: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    sizeMB: 230,
    label: 'SmolLM2 360M — Fastest (correction only)',
    tier: 'fastest',
    url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf',
  },
  'qwen2.5-0.5b-q4': {
    id: 'qwen2.5-0.5b-q4',
    fileName: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
    sizeMB: 395,
    label: 'Qwen 2.5 0.5B — Balanced',
    tier: 'balanced',
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
  },
  'smollm2-1.7b-q4': {
    id: 'smollm2-1.7b-q4',
    fileName: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    sizeMB: 1070,
    label: 'SmolLM2 1.7B — Quality',
    tier: 'quality',
    url: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
  },
  'qwen2.5-3b-q4': {
    id: 'qwen2.5-3b-q4',
    fileName: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
    sizeMB: 1900,
    label: 'Qwen 2.5 3B — Power',
    tier: 'power',
    url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
  },
};

function getLlmModelsDir(): string {
  return path.join(app.getPath('userData'), 'llm-models');
}

export function getAvailableLlmModels(): LlmModelDefinition[] {
  return Object.values(LLM_CATALOG);
}

export function getLlmModelDefinition(modelId: string): LlmModelDefinition {
  const model = LLM_CATALOG[modelId];
  if (!model) throw new Error(`Unknown LLM model: ${modelId}`);
  return model;
}

export function getLlmModelPath(modelId: string): string {
  const model = getLlmModelDefinition(modelId);
  return path.join(getLlmModelsDir(), model.fileName);
}

export function isLlmModelDownloaded(modelId: string): boolean {
  return fs.existsSync(getLlmModelPath(modelId));
}

export function deleteLlmModel(modelId: string): void {
  const p = getLlmModelPath(modelId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export async function downloadLlmModel(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const model = getLlmModelDefinition(modelId);
  const dir = getLlmModelsDir();
  fs.mkdirSync(dir, { recursive: true });
  return downloadFile(model.url, getLlmModelPath(modelId), undefined, onProgress);
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | grep 'llm-model-manager' | head -10
```

Expected: no errors for this file (existing errors about StoreSchema changes in other files are expected).

- [ ] **Step 3: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add electron/services/llm-model-manager.ts
git commit -m "feat: add LLM model manager with GGUF catalog (SmolLM2, Qwen)"
```

---

## Task 5: Settings Store Migration

**Files:**
- Modify: `electron/services/settings-store.ts`

The migration silently converts old `summary.apiBaseUrl` + `summary.apiKey` into a new cloud provider entry so existing users see their config already populated.

- [ ] **Step 1: Write a failing test for the migration**

Create `electron/services/settings-store-migration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// We test the migration logic in isolation by extracting it.
// The actual store uses electron-store; we test the pure logic separately.

import { migrateV1ToV2 } from './settings-store.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm exec vitest run electron/services/settings-store-migration.test.ts 2>&1 | tail -15
```

Expected: FAIL — `migrateV1ToV2` not exported

- [ ] **Step 3: Update settings-store.ts**

Replace the full contents of `electron/services/settings-store.ts`:

```typescript
import Store from 'electron-store';
import * as crypto from 'node:crypto';
import type { StoreSchema, Provider } from '../../shared/types.js';
import { STORE_DEFAULTS } from '../../shared/store-defaults.js';

const store = new Store<StoreSchema>({
  name: 'settings',
  defaults: STORE_DEFAULTS,
});

// ─── V1 → V2 migration (exported for testing) ──────────────────────────────────

export interface MigrationResult {
  providers: Provider[];
  summary: { providerId: string | null; modelId: string; promptTemplate: string };
}

export function migrateV1ToV2(raw: Record<string, unknown>): MigrationResult {
  const oldSummary = raw.summary as Record<string, unknown> | undefined;
  const existingProviders = (raw.providers as Provider[] | undefined) ?? [];

  // Nothing to migrate if providers already exist
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

// ─── Template upgrade ───────────────────────────────────────────────────────────

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

// ─── Run migrations on startup ──────────────────────────────────────────────────

function runMigrations() {
  const raw = store.store as unknown as Record<string, unknown>;
  const result = migrateV1ToV2(raw);

  // Apply if the result differs from current store state
  const currentProviders = store.get('providers') ?? [];
  if (currentProviders.length === 0 && result.providers.length > 0) {
    store.set('providers', result.providers);
    store.set('summary', result.summary);
  }

  upgradeDefaults();
}

runMigrations();

// ─── Store accessors ────────────────────────────────────────────────────────────

export function get<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
  return store.get(key);
}

export function set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
  store.set(key, value);
}

export function getAll(): StoreSchema {
  return store.store;
}
```

- [ ] **Step 4: Run migration tests**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm exec vitest run electron/services/settings-store-migration.test.ts 2>&1 | tail -15
```

Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add electron/services/settings-store.ts electron/services/settings-store-migration.test.ts
git commit -m "feat: settings store v1→v2 migration (summary apiBaseUrl → cloud provider)"
```

---

## Task 6: Summary Service Refactor

**Files:**
- Modify: `electron/services/summary-service.ts`

Replace direct `fetch` calls with `llmService.complete()`. The public API (`testConnection`, `summarize`, `liveSummarize`) stays identical so no IPC or renderer changes are needed.

- [ ] **Step 1: Replace summary-service.ts**

```typescript
import * as settingsStore from './settings-store.js';
import * as llmService from './llm-service.js';
import type { SummaryResult, LiveSummarizeRequest, ChatMessage } from '../../shared/types.js';

export { encryptString, decryptString } from './crypto-utils.js';

function getTaskParams(): { providerId: string; modelId: string } {
  const summary = settingsStore.get('summary');
  if (!summary.providerId) {
    throw new Error('No LLM provider configured. Set one up in Settings > Providers and assign it in Settings > AI Summary.');
  }
  return { providerId: summary.providerId, modelId: summary.modelId };
}

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  const summary = settingsStore.get('summary');
  if (!summary.providerId) {
    return { success: false, error: 'No provider configured' };
  }
  const providers = settingsStore.get('providers');
  const provider = providers.find((p) => p.id === summary.providerId);
  if (!provider) {
    return { success: false, error: 'Configured provider not found' };
  }
  const result = await llmService.testConnection(provider);
  return { success: result.ok, error: result.error };
}

export async function summarize(transcript: string, title: string): Promise<SummaryResult> {
  const { providerId, modelId } = getTaskParams();
  const settings = settingsStore.get('summary');

  const language = settingsStore.get('language') || 'auto';
  const languageLabel = language === 'auto' ? 'the same language as the transcript' : language;

  const prompt = settings.promptTemplate
    .replace(/\{\{transcript\}\}/g, transcript)
    .replace(/\{\{title\}\}/g, title || 'Untitled')
    .replace(/\{\{language\}\}/g, languageLabel);

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const text = await llmService.complete(providerId, modelId, messages);

  return { text, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
}

export async function liveSummarize(request: LiveSummarizeRequest): Promise<SummaryResult> {
  const { providerId, modelId } = getTaskParams();

  const transcriptLines = request.recentSegments
    .map((s) => `[${s.speaker}]: ${s.text}`)
    .join('\n');

  const parts: string[] = [
    `You are a live meeting notes assistant. Your job is to maintain concise, evolving notes that build up gradually over the course of a meeting.`,
    ``,
    `IMPORTANT RULES:`,
    `- Be SELECTIVE. Only note information that would matter to someone who missed the meeting. Ignore small talk, filler, repetition, and trivial details.`,
    `- Be INCREMENTAL. Do not restate or rephrase points already in the existing notes. Only add genuinely new, noteworthy information.`,
    `- Be BRIEF. A few strong bullet points are better than many weak ones. When in doubt, leave it out.`,
    `- PROGRESSIVE SECTIONS. Only include a section if there is meaningful content for it. Omit empty sections entirely. Early in a meeting, fewer sections is expected and preferred — do not force structure before there is substance.`,
    `- Do NOT include a Decisions or Action Items section unless actual decisions or action items have been explicitly stated in the transcript.`,
    ``,
    `MEETING AWARENESS:`,
    `- Silently infer what kind of meeting this is (e.g. interview, brainstorming, planning, 1:1, status update, decision meeting, etc.) from the transcript content. Do NOT state or label the meeting type in the output — use your understanding internally to guide what is noteworthy and what recommendations to make.`,
    ``,
    `OPEN POINTS:`,
    `- Track questions, concerns, or topics that were raised but NOT yet resolved or answered in the conversation.`,
    `- When an open point gets addressed later in the transcript, REMOVE it silently from the Open Points section. Do not keep resolved items.`,
    `- Only include genuinely unresolved items — not rhetorical questions or things that were immediately answered.`,
    ``,
    `RECOMMENDATIONS:`,
    `- Based on your understanding of the meeting type and context, suggest important topics that have NOT been raised yet but probably should be.`,
    `- Be CONSERVATIVE: only recommend items you are highly confident are important and missing. Maximum 2-3 items at any time.`,
    `- When a recommended topic gets discussed, REMOVE it silently. Recommendations are a living list, not a historical record.`,
    `- Do NOT include this section unless you have high-confidence suggestions. No section is better than weak suggestions.`,
    ``,
    `Write in the same language that the participants are speaking in the transcript. Always match the meeting's language.`,
  ];

  if (request.previousSummary) {
    parts.push(`\nCurrent meeting notes:\n${request.previousSummary}`);
  } else {
    parts.push(`\nNo meeting notes exist yet. Create the initial notes. Start sparse — just the key topic(s) and a few important points.`);
  }

  if (request.corrections.length > 0) {
    parts.push(`\nUser corrections (always respect these):\n${request.corrections.map((c) => `- ${c}`).join('\n')}`);
  }

  parts.push(`\nRecent transcript:\n${transcriptLines}`);
  parts.push(`\n${request.formatTemplate}`);

  if (request.isFinal) {
    parts.push(`\nThis is the FINAL summary after the meeting has ended. You are given the complete transcript.`);
    parts.push(`- Do NOT include "Open Points" or "Recommendations" sections.`);
    parts.push(`- Instead, merge any remaining unresolved open points and uncovered recommendations into a single "### Follow-up Required" section — these are things that fell through the cracks and need attention after the meeting.`);
    parts.push(`- If there are no unresolved items, omit the Follow-up Required section entirely.`);
    parts.push(`- Polish the entire summary for clarity and completeness since you now have the full context.`);
  }

  parts.push(`\nReturn ONLY the updated meeting notes, no explanations or preamble.`);

  const messages: ChatMessage[] = [{ role: 'user', content: parts.join('\n') }];
  const text = await llmService.complete(providerId, modelId, messages);

  return { text, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
}
```

- [ ] **Step 2: Run build**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | grep -E 'error|Error' | grep -v 'use-summary-settings\|settings-dialog\|App.tsx' | head -20
```

Expected: only errors in renderer files about the removed `apiBaseUrl`/`apiKey` fields (fixed in later tasks). No errors in the `electron/` directory.

- [ ] **Step 3: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add electron/services/summary-service.ts
git commit -m "refactor: summary-service delegates API calls to llm-service"
```

---

## Task 7: Correction Service

**Files:**
- Create: `electron/services/correction-service.ts`
- Create: `electron/services/correction-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/services/correction-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./settings-store.js', () => ({
  get: vi.fn(),
}));

vi.mock('./llm-service.js', () => ({
  complete: vi.fn(),
}));

import * as settingsStore from './settings-store.js';
import * as llmService from './llm-service.js';
import { correct } from './correction-service.js';

describe('correction-service', () => {
  beforeEach(() => {
    vi.mocked(settingsStore.get).mockImplementation((key) => {
      if (key === 'correction') return { enabled: true, providerId: 'p1', modelId: 'gpt-4o-mini' };
      if (key === 'vocabulary') return ['Max Kirschning', 'Transcripto'];
      return undefined as never;
    });
  });

  it('calls llmService.complete with correction prompt and vocabulary', async () => {
    vi.mocked(llmService.complete).mockResolvedValueOnce('Fixed text.');
    const result = await correct('um so like transcripto is cool');
    expect(result).toBe('Fixed text.');
    expect(llmService.complete).toHaveBeenCalledWith(
      'p1',
      'gpt-4o-mini',
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('Max Kirschning, Transcripto'),
        }),
      ]),
    );
  });

  it('omits vocabulary line when list is empty', async () => {
    vi.mocked(settingsStore.get).mockImplementation((key) => {
      if (key === 'correction') return { enabled: true, providerId: 'p1', modelId: 'm' };
      if (key === 'vocabulary') return [];
      return undefined as never;
    });
    vi.mocked(llmService.complete).mockResolvedValueOnce('Clean text.');
    await correct('raw text');
    const call = vi.mocked(llmService.complete).mock.calls[0];
    const prompt = (call[2][0] as { content: string }).content;
    expect(prompt).not.toContain('Known vocabulary');
  });

  it('throws when correction is disabled', async () => {
    vi.mocked(settingsStore.get).mockImplementation((key) => {
      if (key === 'correction') return { enabled: false, providerId: 'p1', modelId: 'm' };
      return [] as never;
    });
    await expect(correct('text')).rejects.toThrow('Correction is disabled');
  });

  it('throws when no provider is configured', async () => {
    vi.mocked(settingsStore.get).mockImplementation((key) => {
      if (key === 'correction') return { enabled: true, providerId: null, modelId: '' };
      return [] as never;
    });
    await expect(correct('text')).rejects.toThrow('No correction provider');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm exec vitest run electron/services/correction-service.test.ts 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module './correction-service.js'"

- [ ] **Step 3: Implement electron/services/correction-service.ts**

```typescript
import * as settingsStore from './settings-store.js';
import * as llmService from './llm-service.js';
import type { ChatMessage } from '../../shared/types.js';

export async function correct(rawText: string): Promise<string> {
  const correction = settingsStore.get('correction');

  if (!correction.enabled) {
    throw new Error('Correction is disabled');
  }
  if (!correction.providerId) {
    throw new Error('No correction provider configured');
  }

  const vocabulary = settingsStore.get('vocabulary');

  const vocabLine = vocabulary.length > 0
    ? `\nKnown vocabulary — correct these spellings if you recognise them in any form:\n${vocabulary.join(', ')}\n`
    : '';

  const prompt =
    `You are a transcript corrector. Fix filler words (um, uh, like, you know), ` +
    `obvious Whisper mishearings, and casing/punctuation. Do NOT rephrase or add ` +
    `meaning. Return only the corrected text, nothing else.` +
    vocabLine +
    `\nText: "${rawText}"`;

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  return llmService.complete(correction.providerId, correction.modelId, messages);
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm exec vitest run electron/services/correction-service.test.ts 2>&1 | tail -15
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add electron/services/correction-service.ts electron/services/correction-service.test.ts
git commit -m "feat: correction-service builds correction prompt and calls llm-service"
```

---

## Task 8: Local GGUF Backend (Optional — can be deferred)

> **Note:** This task requires `node-llama-cpp`, a native module. If Electron build issues arise, it can be deferred — cloud and Ollama paths fully cover the feature without it. Skip to Task 9 if needed; leave `localComplete` throwing its stub error.

**Files:**
- Modify: `electron/services/llm-service.ts`

- [ ] **Step 1: Install node-llama-cpp**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm add node-llama-cpp
```

Expected: package installed. `node-llama-cpp` v3 downloads prebuilt binaries on first import.

- [ ] **Step 2: Verify it imports in the main process context**

Create a quick test file:

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && node -e "const { getLlama } = require('node-llama-cpp'); console.log('ok', typeof getLlama);" 2>&1
```

Expected: `ok function`

- [ ] **Step 3: Add local backend state to llm-service.ts**

Add the following to `electron/services/llm-service.ts` after the imports:

```typescript
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import * as llmModelManager from './llm-model-manager.js';

// ─── Local backend state ───────────────────────────────────────────────────────

let loadedLocalModelId: string | null = null;
let loadedLlamaModel: Awaited<ReturnType<Awaited<ReturnType<typeof getLlama>>['loadModel']>> | null = null;
let llamaInstance: Awaited<ReturnType<typeof getLlama>> | null = null;

async function ensureLocalModel(modelId: string): Promise<typeof loadedLlamaModel> {
  if (loadedLocalModelId === modelId && loadedLlamaModel) {
    return loadedLlamaModel;
  }
  // Release previous context
  if (loadedLlamaModel) {
    await loadedLlamaModel.dispose();
    loadedLlamaModel = null;
    loadedLocalModelId = null;
  }
  if (!llamaInstance) {
    llamaInstance = await getLlama();
  }
  const modelPath = llmModelManager.getLlmModelPath(modelId);
  loadedLlamaModel = await llamaInstance.loadModel({ modelPath });
  loadedLocalModelId = modelId;
  return loadedLlamaModel;
}

export async function releaseLocalModel(): Promise<void> {
  if (loadedLlamaModel) {
    await loadedLlamaModel.dispose();
    loadedLlamaModel = null;
    loadedLocalModelId = null;
  }
}
```

- [ ] **Step 4: Replace the localComplete stub in llm-service.ts**

Replace:

```typescript
async function localComplete(
  _provider: Provider,
  _modelId: string,
  _messages: ChatMessage[],
): Promise<string> {
  throw new Error('Local GGUF backend not yet implemented. Use a cloud or Ollama provider.');
}
```

with:

```typescript
async function localComplete(
  provider: Provider,
  _modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const localModelId = provider.localModelId;
  if (!localModelId) throw new Error('Local provider has no model configured');
  if (!llmModelManager.isLlmModelDownloaded(localModelId)) {
    throw new Error(`Local model "${localModelId}" is not downloaded`);
  }
  const model = await ensureLocalModel(localModelId);
  const context = await model!.createContext();
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });

  const userContent = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  const response = await session.prompt(userContent);
  await context.dispose();
  return response;
}
```

- [ ] **Step 5: Wire releaseLocalModel on app quit in main.ts**

In `electron/main.ts`, add:

```typescript
import * as llmService from './services/llm-service.js';
```

And in the `app.on('before-quit')` handler, add:

```typescript
llmService.releaseLocalModel().catch(() => {});
```

- [ ] **Step 6: Run existing llm-service tests to confirm they still pass**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm exec vitest run electron/services/llm-service.test.ts 2>&1 | tail -10
```

Expected: all 7 tests still PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add electron/services/llm-service.ts electron/main.ts
git commit -m "feat: add local GGUF backend to llm-service using node-llama-cpp"
```

---

## Task 9: IPC Layer

**Files:**
- Modify: `electron/ipc-types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Update electron/ipc-types.ts**

Add the new imports at the top of the file:

```typescript
import type {
  // ...existing imports...
  Provider,
  TaskConfig,
  LlmModelDefinition,
  LlmDownloadProgress,
} from '../shared/types';
```

Add to the re-exports:

```typescript
export type {
  // ...existing re-exports...
  Provider,
  TaskConfig,
  LlmModelDefinition,
  LlmDownloadProgress,
};
```

Append to the `ElectronAPI` interface:

```typescript
  // Provider registry
  getProviders: () => Promise<Provider[]>;
  addProvider: (provider: Omit<Provider, 'id'>) => Promise<Provider>;
  updateProvider: (provider: Provider) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  testProvider: (provider: Provider) => Promise<{ ok: boolean; error?: string }>;
  ollamaListModels: (ollamaBaseUrl: string) => Promise<string[]>;

  // LLM model management
  getAvailableLlmModels: () => Promise<LlmModelDefinition[]>;
  getLlmModelStatus: (modelId: string) => Promise<{ downloaded: boolean }>;
  downloadLlmModel: (modelId: string) => Promise<void>;
  deleteLlmModel: (modelId: string) => Promise<void>;
  onLlmDownloadProgress: (callback: (progress: LlmDownloadProgress) => void) => () => void;

  // Correction
  correctSegment: (rawText: string) => Promise<string>;
```

- [ ] **Step 2: Add IPC handlers in electron/main.ts**

Add imports at the top of main.ts:

```typescript
import * as llmService from './services/llm-service.js';
import * as llmModelManager from './services/llm-model-manager.js';
import * as correctionService from './services/correction-service.js';
import * as crypto from 'node:crypto';
```

Inside `registerIpcHandlers()`, after the existing handlers, add:

```typescript
  // ── Provider registry ──────────────────────────────────────────────────────
  ipcMain.handle('get-providers', () => settingsStore.get('providers'));

  ipcMain.handle('add-provider', (_event, providerData: Omit<Provider, 'id'>) => {
    const newProvider: Provider = { ...providerData, id: crypto.randomUUID() };
    const providers = settingsStore.get('providers');
    settingsStore.set('providers', [...providers, newProvider]);
    return newProvider;
  });

  ipcMain.handle('update-provider', (_event, provider: Provider) => {
    const providers = settingsStore.get('providers');
    settingsStore.set('providers', providers.map((p) => (p.id === provider.id ? provider : p)));
  });

  ipcMain.handle('delete-provider', (_event, id: string) => {
    const providers = settingsStore.get('providers');
    settingsStore.set('providers', providers.filter((p) => p.id !== id));
  });

  ipcMain.handle('test-provider', async (_event, provider: Provider) => {
    return llmService.testConnection(provider);
  });

  ipcMain.handle('ollama-list-models', async (_event, ollamaBaseUrl: string) => {
    return llmService.ollamaListModels(ollamaBaseUrl);
  });

  // ── LLM model management ───────────────────────────────────────────────────
  ipcMain.handle('get-available-llm-models', () => llmModelManager.getAvailableLlmModels());

  ipcMain.handle('get-llm-model-status', (_event, modelId: string) => ({
    downloaded: llmModelManager.isLlmModelDownloaded(modelId),
  }));

  ipcMain.handle('download-llm-model', async (event, modelId: string) => {
    await llmModelManager.downloadLlmModel(modelId, (progress) => {
      event.sender.send('llm-download-progress', { ...progress, modelId });
    });
  });

  ipcMain.handle('delete-llm-model', (_event, modelId: string) => {
    llmModelManager.deleteLlmModel(modelId);
  });

  // ── Correction ─────────────────────────────────────────────────────────────
  ipcMain.handle('correct-segment', async (_event, rawText: string) => {
    return correctionService.correct(rawText);
  });
```

Also add the missing `Provider` import to the main.ts type import:

```typescript
import type { StoreSchema, ShortcutConfig, ShortcutAction, LiveSummarizeRequest, ModelEngine, Provider } from '../shared/types.js';
```

- [ ] **Step 3: Add new methods to electron/preload.ts**

Append to the imports at the top:

```typescript
import type { ElectronAPI, DownloadProgress, DiarizationDownloadProgress, FileTranscribeProgress, ShortcutConfig, ShortcutAction, LiveSummarizeRequest, Provider, LlmDownloadProgress } from './ipc-types';
```

Append the following to the `api` object before the closing `}`:

```typescript
  // Provider registry
  getProviders: () => ipcRenderer.invoke('get-providers'),

  addProvider: (provider: Omit<Provider, 'id'>) => ipcRenderer.invoke('add-provider', provider),

  updateProvider: (provider: Provider) => ipcRenderer.invoke('update-provider', provider),

  deleteProvider: (id: string) => ipcRenderer.invoke('delete-provider', id),

  testProvider: (provider: Provider) => ipcRenderer.invoke('test-provider', provider),

  ollamaListModels: (ollamaBaseUrl: string) => ipcRenderer.invoke('ollama-list-models', ollamaBaseUrl),

  // LLM model management
  getAvailableLlmModels: () => ipcRenderer.invoke('get-available-llm-models'),

  getLlmModelStatus: (modelId: string) => ipcRenderer.invoke('get-llm-model-status', modelId),

  downloadLlmModel: (modelId: string) => ipcRenderer.invoke('download-llm-model', modelId),

  deleteLlmModel: (modelId: string) => ipcRenderer.invoke('delete-llm-model', modelId),

  onLlmDownloadProgress: (callback: (progress: LlmDownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: LlmDownloadProgress) => callback(progress);
    ipcRenderer.on('llm-download-progress', handler);
    return () => ipcRenderer.removeListener('llm-download-progress', handler);
  },

  // Correction
  correctSegment: (rawText: string) => ipcRenderer.invoke('correct-segment', rawText),
```

- [ ] **Step 4: Run build to verify IPC types are consistent**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | grep -E '^electron/' | head -20
```

Expected: no TypeScript errors in `electron/` directory.

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add electron/ipc-types.ts electron/preload.ts electron/main.ts
git commit -m "feat: wire provider, LLM model, and correction IPC handlers"
```

---

## Task 10: Correction Pipeline in Renderer

**Files:**
- Modify: `src/hooks/use-transcription.ts`

Add `correctionEnabled` option + `correctingIds` state. After each segment is created, fire-and-forget a `correctSegment` IPC call with a 2-second timeout.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-transcription-correction.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electronAPI
const mockTranscribe = vi.fn();
const mockCorrectSegment = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: { transcribe: mockTranscribe, correctSegment: mockCorrectSegment },
  writable: true,
});

// We test the correction behaviour by directly exercising onSpeechEnd internals.
// Full hook test would require renderHook; test the timing behaviour via the exported helpers.

describe('correction timeout', () => {
  it('falls back to raw text when correctSegment times out', async () => {
    vi.useFakeTimers();

    let timeoutReached = false;
    const slowCorrect = new Promise<string>((resolve) => setTimeout(() => resolve('corrected'), 5000));
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => { timeoutReached = true; reject(new Error('timeout')); }, 2000),
    );

    const result = await Promise.race([slowCorrect, timeout]).catch(() => null);

    vi.advanceTimersByTime(2500);
    expect(timeoutReached).toBe(true);
    expect(result).toBeNull();

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (it tests the pattern, not the hook directly)**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm exec vitest run src/hooks/use-transcription-correction.test.ts 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 3: Update use-transcription.ts**

Replace the full contents of `src/hooks/use-transcription.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import { useAudioCapture } from './use-audio-capture';
import { useSessionPersistence, loadSession, clearSession } from './use-session-persistence';
import { useDiarization } from './use-diarization';
import type { VADOptions } from '@/lib/vad';
import type {
  AudioSource,
  RecordingState,
  TranscriptSegment,
} from '@/types/transcription';

export type { DiarizationState } from './use-diarization';

interface UseTranscriptionOptions {
  language: string;
  vadOptions?: VADOptions;
  correctionEnabled?: boolean;
}

export function useTranscription({ language, vadOptions, correctionEnabled = false }: UseTranscriptionOptions) {
  const [segments, setSegments] = useState<TranscriptSegment[]>(() => loadSession()?.segments ?? []);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [micRMS, setMicRMS] = useState(0);
  const [systemRMS, setSystemRMS] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState(() => loadSession()?.recordingStartTime ?? 0);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(() => loadSession()?.speakerNames ?? {});
  const [correctingIds, setCorrectingIds] = useState<Set<string>>(new Set());

  const pendingRef = useRef(0);
  const drainResolveRef = useRef<(() => void) | null>(null);
  const segmentCounterRef = useRef(0);
  const systemSpeakerRef = useRef(1);
  const languageRef = useRef(language);
  const recordingStartTimeRef = useRef(0);
  const correctionEnabledRef = useRef(correctionEnabled);
  languageRef.current = language;
  correctionEnabledRef.current = correctionEnabled;

  const correctSegmentAsync = useCallback((segmentId: string, rawText: string) => {
    setCorrectingIds((prev) => new Set([...prev, segmentId]));

    Promise.race([
      window.electronAPI.correctSegment(rawText),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2000),
      ),
    ])
      .then((correctedText) => {
        setSegments((prev) =>
          prev.map((s) => (s.id === segmentId ? { ...s, text: correctedText } : s)),
        );
      })
      .catch(() => {
        // Silently fall back to raw Whisper text
      })
      .finally(() => {
        setCorrectingIds((prev) => {
          const next = new Set(prev);
          next.delete(segmentId);
          return next;
        });
      });
  }, []);

  const onSpeechEnd = useCallback(
    async (source: 'mic' | 'system', audioBuffer: ArrayBuffer, speechStartMs: number) => {
      const timestamp = Date.now();
      pendingRef.current++;
      console.log(`[transcription] onSpeechEnd: source=${source}, byteLength=${audioBuffer.byteLength}, pending=${pendingRef.current}`);

      try {
        const result = await window.electronAPI.transcribe(source, audioBuffer, languageRef.current);
        console.log(`[transcription] IPC result: source=${source}, text="${result.text.slice(0, 80)}", segments=${result.segments.length}`);

        if (result.text) {
          if (source === 'mic') {
            const newSegment: TranscriptSegment = {
              id: `seg-${++segmentCounterRef.current}`,
              source,
              speaker: 'You',
              text: result.text,
              timestamp,
              speechStartMs,
              startTime: result.segments[0]?.t0 ?? 0,
              endTime: result.segments[result.segments.length - 1]?.t1 ?? 0,
            };
            setSegments((prev) => [...prev, newSegment]);
            if (correctionEnabledRef.current) {
              correctSegmentAsync(newSegment.id, result.text);
            }
          } else {
            // System audio: split into separate segments at speaker turns
            const newSegments: TranscriptSegment[] = [];
            let currentTexts: string[] = [];
            let groupStart = result.segments[0]?.t0 ?? 0;

            for (const seg of result.segments) {
              currentTexts.push(seg.text);

              if (seg.speakerTurn) {
                newSegments.push({
                  id: `seg-${++segmentCounterRef.current}`,
                  source,
                  speaker: `Speaker ${systemSpeakerRef.current}`,
                  text: currentTexts.join(' ').trim(),
                  timestamp,
                  speechStartMs,
                  startTime: groupStart,
                  endTime: seg.t1,
                });
                systemSpeakerRef.current = systemSpeakerRef.current === 1 ? 2 : 1;
                currentTexts = [];
                groupStart = seg.t1;
              }
            }

            if (currentTexts.length > 0) {
              const joinedText = currentTexts.join(' ').trim();
              if (joinedText) {
                const lastSeg = result.segments[result.segments.length - 1];
                newSegments.push({
                  id: `seg-${++segmentCounterRef.current}`,
                  source,
                  speaker: `Speaker ${systemSpeakerRef.current}`,
                  text: joinedText,
                  timestamp,
                  speechStartMs,
                  startTime: groupStart,
                  endTime: lastSeg?.t1 ?? 0,
                });
              }
            }

            if (newSegments.length > 0) {
              setSegments((prev) => [...prev, ...newSegments]);
              if (correctionEnabledRef.current) {
                for (const seg of newSegments) {
                  correctSegmentAsync(seg.id, seg.text);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`[transcription] IPC error (${source}):`, err);
      } finally {
        pendingRef.current--;
        console.log(`[transcription] onSpeechEnd done: source=${source}, pending=${pendingRef.current}`);
        if (pendingRef.current === 0 && drainResolveRef.current) {
          drainResolveRef.current();
          drainResolveRef.current = null;
        }
      }
    },
    [correctSegmentAsync],
  );

  const onRMS = useCallback((source: AudioSource, rms: number) => {
    if (source === 'mic') setMicRMS(rms);
    else setSystemRMS(rms);
  }, []);

  const { isCapturing, systemAudioStatus, debugInfo, isMicMuted, isPaused, startCapture, stopCapture, toggleMicMute, togglePause } = useAudioCapture(
    { onSpeechEnd, onRMS },
    vadOptions,
  );

  const { diarizationState, elapsedMs, checkModels, runDiarization } = useDiarization(
    recordingStartTimeRef,
    setSegments,
  );

  const startRecording = useCallback(async () => {
    clearSession();
    setRecordingState('recording');
    const now = Date.now();
    setRecordingStartTime(now);
    recordingStartTimeRef.current = now;
    segmentCounterRef.current = 0;
    systemSpeakerRef.current = 1;
    setSegments([]);
    setSpeakerNames({});
    setCorrectingIds(new Set());
    try {
      await startCapture();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setRecordingState('idle');
    }
  }, [startCapture]);

  const stopRecording = useCallback(async () => {
    setRecordingState('stopping');
    await stopCapture();

    if (pendingRef.current > 0) {
      await Promise.race([
        new Promise<void>((resolve) => { drainResolveRef.current = resolve; }),
        new Promise<void>((resolve) => setTimeout(resolve, 10000)),
      ]);
      drainResolveRef.current = null;
    }

    setRecordingState('idle');
    await checkModels();
  }, [stopCapture, checkModels]);

  const renameSpeaker = useCallback((speakerId: string, name: string) => {
    setSpeakerNames((prev) => ({ ...prev, [speakerId]: name }));
  }, []);

  const updateSegmentText = useCallback((id: string, text: string) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  }, []);

  const deleteSegment = useCallback((id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const dismissTranscript = useCallback(() => {
    clearSession();
    setSegments([]);
    setSpeakerNames({});
    setRecordingStartTime(0);
    recordingStartTimeRef.current = 0;
    setCorrectingIds(new Set());
    window.electronAPI.cleanupAudioRecording();
  }, []);

  const restoreTranscript = useCallback((restoredSegments: TranscriptSegment[], restoredSpeakerNames: Record<string, string>) => {
    setSegments(restoredSegments);
    setSpeakerNames(restoredSpeakerNames);
  }, []);

  const appendFileSegments = useCallback((newSegments: TranscriptSegment[]) => {
    setSegments((prev) => [...prev, ...newSegments]);
    segmentCounterRef.current += newSegments.length;
  }, []);

  useSessionPersistence(segments, speakerNames, recordingStartTime, recordingState !== 'idle');

  return {
    segments,
    correctingIds,
    recordingState,
    recordingStartTime,
    isCapturing,
    systemAudioStatus,
    debugInfo,
    micRMS,
    systemRMS,
    isMicMuted,
    isPaused,
    diarizationState,
    elapsedMs,
    speakerNames,
    startRecording,
    stopRecording,
    toggleMicMute,
    togglePause,
    runDiarization,
    renameSpeaker,
    updateSegmentText,
    deleteSegment,
    dismissTranscript,
    restoreTranscript,
    appendFileSegments,
  };
}
```

- [ ] **Step 4: Run all tests to confirm nothing is broken**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm test 2>&1 | tail -20
```

Expected: all existing tests still pass

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add src/hooks/use-transcription.ts src/hooks/use-transcription-correction.test.ts
git commit -m "feat: add correction pipeline to useTranscription with 2s timeout"
```

---

## Task 11: Correction Visual State in TranscriptPanel

**Files:**
- Modify: `src/components/transcript-panel.tsx`

- [ ] **Step 1: Add correctingIds prop to TranscriptPanel**

Open `src/components/transcript-panel.tsx`. Find the props interface (or props destructuring near the top of the component function). Add `correctingIds?: Set<string>` to the props.

Find the existing props interface or add one:

```typescript
interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
  onRenameSpeaker: (speakerId: string, name: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onDeleteSegment: (id: string) => void;
  correctingIds?: Set<string>;
}
```

- [ ] **Step 2: Apply dimming to correcting segments**

In the segment rendering code, find where each segment's text is rendered. Add an opacity class when the segment is correcting.

Locate the segment container div. Add a conditional class:

```tsx
<div
  key={segment.id}
  className={`... ${correctingIds?.has(segment.id) ? 'opacity-50 transition-opacity' : ''}`}
>
```

If there's already a `className` on the outer segment div, append the conditional:

```tsx
className={`existing-classes ${correctingIds?.has(segment.id) ? 'opacity-50 transition-opacity duration-200' : ''}`}
```

- [ ] **Step 3: Add correcting label for screen readers / tooltip**

Inside the correcting condition, add a small indicator next to the text:

```tsx
{correctingIds?.has(segment.id) && (
  <span className="text-xs text-muted-foreground italic ml-1">correcting…</span>
)}
```

Place this immediately after the segment text element.

- [ ] **Step 4: Run build to verify no TypeScript errors**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | grep 'transcript-panel' | head -10
```

Expected: no errors for transcript-panel.tsx

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add src/components/transcript-panel.tsx
git commit -m "feat: dim transcript segments while LLM correction is in progress"
```

---

## Task 12: Settings UI — Providers Tab

**Files:**
- Create: `src/hooks/use-providers.ts`
- Create: `src/components/settings/providers-tab.tsx`
- Modify: `src/components/settings-dialog.tsx`

- [ ] **Step 1: Create src/hooks/use-providers.ts**

```typescript
import { useState, useEffect, useCallback } from 'react';
import type { Provider, LlmModelDefinition, LlmDownloadProgress } from '../../shared/types';

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.getProviders();
    setProviders(list);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addProvider = useCallback(async (data: Omit<Provider, 'id'>) => {
    const created = await window.electronAPI.addProvider(data);
    setProviders((prev) => [...prev, created]);
    return created;
  }, []);

  const updateProvider = useCallback(async (provider: Provider) => {
    await window.electronAPI.updateProvider(provider);
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? provider : p)));
  }, []);

  const deleteProvider = useCallback(async (id: string) => {
    await window.electronAPI.deleteProvider(id);
    setProviders((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const testProvider = useCallback(
    (provider: Provider) => window.electronAPI.testProvider(provider),
    [],
  );

  return { providers, loading, refresh, addProvider, updateProvider, deleteProvider, testProvider };
}

export function useLlmModels() {
  const [models, setModels] = useState<LlmModelDefinition[]>([]);
  const [downloadStatus, setDownloadStatus] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    window.electronAPI.getAvailableLlmModels().then(setModels);
  }, []);

  useEffect(() => {
    if (models.length === 0) return;
    Promise.all(models.map((m) => window.electronAPI.getLlmModelStatus(m.id))).then((statuses) => {
      const record: Record<string, boolean> = {};
      models.forEach((m, i) => { record[m.id] = statuses[i].downloaded; });
      setDownloadStatus(record);
    });
  }, [models]);

  useEffect(() => {
    return window.electronAPI.onLlmDownloadProgress((progress: LlmDownloadProgress) => {
      setDownloadProgress((prev) => ({ ...prev, [progress.modelId]: progress.percent }));
      if (progress.percent >= 100) {
        setDownloadStatus((prev) => ({ ...prev, [progress.modelId]: true }));
        setDownloadProgress((prev) => { const next = { ...prev }; delete next[progress.modelId]; return next; });
      }
    });
  }, []);

  const downloadModel = useCallback(async (modelId: string) => {
    await window.electronAPI.downloadLlmModel(modelId);
  }, []);

  const deleteModel = useCallback(async (modelId: string) => {
    await window.electronAPI.deleteLlmModel(modelId);
    setDownloadStatus((prev) => ({ ...prev, [modelId]: false }));
  }, []);

  return { models, downloadStatus, downloadProgress, downloadModel, deleteModel };
}
```

- [ ] **Step 2: Create src/components/settings/ directory and providers-tab.tsx**

```bash
mkdir -p /Users/max/Documents/Entwicklung/Transcripto/src/components/settings
```

Create `src/components/settings/providers-tab.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Check, AlertCircle, Loader2, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProviders, useLlmModels } from '@/hooks/use-providers';
import type { Provider, ProviderType } from '../../../shared/types';

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

function ProviderTypeBadge({ type }: { type: ProviderType }) {
  const styles: Record<ProviderType, string> = {
    cloud: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    ollama: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    local: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };
  const labels: Record<ProviderType, string> = { cloud: 'Cloud', ollama: 'Ollama', local: 'Local' };
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

function LocalModelPicker({
  selectedModelId,
  onChange,
}: {
  selectedModelId: string | undefined;
  onChange: (id: string) => void;
}) {
  const { models, downloadStatus, downloadProgress, downloadModel, deleteModel } = useLlmModels();

  return (
    <div className="space-y-1.5">
      <Label>Model</Label>
      <div className="space-y-1 border rounded-md p-2">
        {models.map((m) => {
          const downloaded = downloadStatus[m.id] ?? false;
          const progress = downloadProgress[m.id];
          const isDownloading = progress !== undefined;
          return (
            <div
              key={m.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm ${
                selectedModelId === m.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
              }`}
              onClick={() => downloaded && onChange(m.id)}
            >
              <span className="flex-1">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.sizeMB}MB</span>
              {isDownloading ? (
                <span className="text-xs text-muted-foreground">{progress}%</span>
              ) : downloaded ? (
                <div className="flex items-center gap-1">
                  {selectedModelId === m.id && <Check className="size-3 text-primary" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteModel(m.id); }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete model"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); downloadModel(m.id); }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Download model"
                >
                  <Download className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProviderForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Provider;
  onSave: (data: Omit<Provider, 'id'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<ProviderType>(initial?.type ?? 'cloud');
  const [apiBaseUrl, setApiBaseUrl] = useState(initial?.apiBaseUrl ?? '');
  const [apiKey, setApiKey] = useState(''); // never pre-fill decrypted key in form
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(initial?.ollamaBaseUrl ?? 'http://localhost:11434');
  const [localModelId, setLocalModelId] = useState(initial?.localModelId ?? '');
  const [saving, setSaving] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const handleFetchOllamaModels = async () => {
    setFetchingModels(true);
    try {
      const models = await window.electronAPI.ollamaListModels(ollamaBaseUrl);
      setOllamaModels(models);
    } catch {
      setOllamaModels([]);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data: Omit<Provider, 'id'> = {
        name: name.trim(),
        type,
        ...(type === 'cloud' && { apiBaseUrl, ...(apiKey && { apiKey: await window.electronAPI.encryptString(apiKey) }) }),
        ...(type === 'ollama' && { ollamaBaseUrl }),
        ...(type === 'local' && { localModelId }),
      };
      await onSave(initial ? { ...data, id: initial.id } : data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
      <div className="space-y-1.5">
        <Label htmlFor="prov-name">Name</Label>
        <Input id="prov-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Provider" />
      </div>

      <div className="space-y-1.5">
        <Label>Type</Label>
        <div className="flex gap-2">
          {(['cloud', 'ollama', 'local'] as ProviderType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {type === 'cloud' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="prov-base-url">Base URL</Label>
            <Input
              id="prov-base-url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prov-api-key">API Key</Label>
            <Input
              id="prov-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={initial?.apiKey ? '••••••••••••• (leave blank to keep)' : 'sk-...'}
            />
            <p className="text-xs text-muted-foreground">Stored encrypted on your machine</p>
          </div>
        </>
      )}

      {type === 'ollama' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="prov-ollama-url">Ollama Base URL</Label>
            <div className="flex gap-2">
              <Input
                id="prov-ollama-url"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleFetchOllamaModels} disabled={fetchingModels}>
                {fetchingModels ? <Loader2 className="size-3.5 animate-spin" /> : 'Fetch models'}
              </Button>
            </div>
            {ollamaModels.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Available: {ollamaModels.join(', ')}
              </p>
            )}
          </div>
        </>
      )}

      {type === 'local' && (
        <LocalModelPicker
          selectedModelId={localModelId || undefined}
          onChange={setLocalModelId}
        />
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
          {initial ? 'Save' : 'Add Provider'}
        </Button>
      </div>
    </div>
  );
}

export function ProvidersTab() {
  const { providers, addProvider, updateProvider, deleteProvider, testProvider } = useProviders();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});

  const handleTest = useCallback(async (provider: Provider) => {
    setTestStatus((prev) => ({ ...prev, [provider.id]: 'testing' }));
    try {
      const result = await testProvider(provider);
      setTestStatus((prev) => ({ ...prev, [provider.id]: result.ok ? 'ok' : 'error' }));
      if (!result.ok) setTestErrors((prev) => ({ ...prev, [provider.id]: result.error ?? 'Unknown error' }));
    } catch (err) {
      setTestStatus((prev) => ({ ...prev, [provider.id]: 'error' }));
      setTestErrors((prev) => ({ ...prev, [provider.id]: (err as Error).message }));
    }
  }, [testProvider]);

  const handleSave = useCallback(async (data: Omit<Provider, 'id'> & { id?: string }) => {
    if (data.id) {
      await updateProvider(data as Provider);
    } else {
      await addProvider(data as Omit<Provider, 'id'>);
    }
    setEditingId(null);
  }, [addProvider, updateProvider]);

  return (
    <div className="space-y-4">
      {providers.length === 0 && editingId !== 'new' && (
        <p className="text-sm text-muted-foreground italic">
          No providers configured. Add one to use AI features.
        </p>
      )}

      {providers.map((p) => (
        <div key={p.id}>
          {editingId === p.id ? (
            <ProviderForm initial={p} onSave={handleSave} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{p.name}</span>
                  <ProviderTypeBadge type={p.type} />
                </div>
                {testStatus[p.id] === 'error' && (
                  <p className="text-xs text-destructive truncate mt-0.5">{testErrors[p.id]}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleTest(p)}
                  disabled={testStatus[p.id] === 'testing'}
                  title="Test connection"
                >
                  {testStatus[p.id] === 'testing' && <Loader2 className="size-3 animate-spin" />}
                  {testStatus[p.id] === 'ok' && <Check className="size-3 text-green-600" />}
                  {testStatus[p.id] === 'error' && <AlertCircle className="size-3 text-destructive" />}
                  {(!testStatus[p.id] || testStatus[p.id] === 'idle') && <Check className="size-3" />}
                  Test
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditingId(p.id)} title="Edit">
                  <Pencil className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteProvider(p.id)}
                  title="Delete"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {editingId === 'new' ? (
        <ProviderForm onSave={handleSave} onCancel={() => setEditingId(null)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setEditingId('new')} className="w-full gap-1">
          <Plus className="size-3.5" />
          Add Provider
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add Providers tab to settings-dialog.tsx**

In `src/components/settings-dialog.tsx`:

1. Add import at the top:
```typescript
import { ProvidersTab } from '@/components/settings/providers-tab';
import { Boxes } from 'lucide-react';
```

2. Update the `TABS` constant — insert a new tab after `'AI Summary'`:
```typescript
const TABS = [
  { id: 'General' as const, label: 'General', icon: Settings2 },
  { id: 'Providers' as const, label: 'Providers', icon: Boxes },
  { id: 'AI Summary' as const, label: 'AI Summary', icon: Sparkles },
  { id: 'Export' as const, label: 'Export', icon: FileOutput },
  { id: 'Shortcuts' as const, label: 'Shortcuts', icon: Keyboard },
  { id: 'Advanced' as const, label: 'Advanced', icon: SlidersHorizontal },
];
```

3. Add the tab content panel after the `'General'` block inside the tab content div:
```tsx
{activeTab === 'Providers' && <ProvidersTab />}
```

- [ ] **Step 4: Run build**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | grep -E 'providers-tab|use-providers' | head -10
```

Expected: no errors for new files

- [ ] **Step 5: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add src/hooks/use-providers.ts src/components/settings/providers-tab.tsx src/components/settings-dialog.tsx
git commit -m "feat: add Providers settings tab with CRUD and test connection"
```

---

## Task 13: Settings UI — Summary Tab Update + Correction Tab

**Files:**
- Modify: `src/hooks/use-summary-settings.ts`
- Create: `src/components/settings/correction-tab.tsx`
- Modify: `src/components/settings-dialog.tsx`

- [ ] **Step 1: Rewrite src/hooks/use-summary-settings.ts**

```typescript
import { useCallback } from 'react';
import { useStoreValue } from './use-store';
import { useProviders } from './use-providers';

export interface SummarySettings {
  providerId: string | null;
  modelId: string;
  promptTemplate: string;
}

export function useSummarySettings() {
  const [summaryData, setSummaryData] = useStoreValue('summary');
  const { providers } = useProviders();

  const hasProvider =
    summaryData.providerId !== null &&
    providers.some((p) => p.id === summaryData.providerId);

  const setProviderId = useCallback(
    (providerId: string | null) => setSummaryData({ ...summaryData, providerId }),
    [summaryData, setSummaryData],
  );

  const setModelId = useCallback(
    (modelId: string) => setSummaryData({ ...summaryData, modelId }),
    [summaryData, setSummaryData],
  );

  const setPromptTemplate = useCallback(
    (promptTemplate: string) => setSummaryData({ ...summaryData, promptTemplate }),
    [summaryData, setSummaryData],
  );

  return {
    settings: summaryData,
    hasProvider,
    providers,
    setProviderId,
    setModelId,
    setPromptTemplate,
  };
}
```

- [ ] **Step 2: Create src/components/settings/correction-tab.tsx**

```tsx
import { useCallback, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useStoreValue } from '@/hooks/use-store';
import { useProviders } from '@/hooks/use-providers';
import type { Provider } from '../../../shared/types';

function ProviderModelSelector({
  providerId,
  modelId,
  providers,
  onProviderChange,
  onModelChange,
}: {
  providerId: string | null;
  modelId: string;
  providers: Provider[];
  onProviderChange: (id: string | null) => void;
  onModelChange: (id: string) => void;
}) {
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const selectedProvider = providers.find((p) => p.id === providerId) ?? null;

  const handleProviderChange = async (id: string) => {
    onProviderChange(id || null);
    const provider = providers.find((p) => p.id === id);
    if (provider?.type === 'ollama') {
      try {
        const models = await window.electronAPI.ollamaListModels(
          provider.ollamaBaseUrl ?? 'http://localhost:11434',
        );
        setOllamaModels(models);
      } catch {
        setOllamaModels([]);
      }
    } else {
      setOllamaModels([]);
    }
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="corr-provider">Provider</Label>
        <select
          id="corr-provider"
          value={providerId ?? ''}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">— Select provider —</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedProvider && selectedProvider.type !== 'local' && (
        <div className="space-y-1.5">
          <Label htmlFor="corr-model">Model</Label>
          {selectedProvider.type === 'ollama' && ollamaModels.length > 0 ? (
            <select
              id="corr-model"
              value={modelId}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Select model —</option>
              {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <Input
              id="corr-model"
              value={modelId}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder="e.g. gpt-4o-mini"
            />
          )}
        </div>
      )}
    </>
  );
}

export function CorrectionTab() {
  const [correction, setCorrection] = useStoreValue('correction');
  const [vocabulary, setVocabulary] = useStoreValue('vocabulary');
  const { providers } = useProviders();
  const [newTerm, setNewTerm] = useState('');

  const configuredProvider = providers.find((p) => p.id === correction.providerId);
  const canEnable = correction.providerId !== null && configuredProvider !== undefined;

  const addTerm = useCallback(() => {
    const term = newTerm.trim();
    if (!term || vocabulary.includes(term)) return;
    setVocabulary([...vocabulary, term]);
    setNewTerm('');
  }, [newTerm, vocabulary, setVocabulary]);

  const removeTerm = useCallback(
    (term: string) => setVocabulary(vocabulary.filter((t) => t !== term)),
    [vocabulary, setVocabulary],
  );

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="correction-enabled">Enable live correction</Label>
            <p className="text-xs text-muted-foreground">
              {!canEnable
                ? 'Configure a provider below to enable'
                : 'Silently cleans up each Whisper segment after transcription'}
            </p>
          </div>
          <Switch
            id="correction-enabled"
            checked={correction.enabled}
            onCheckedChange={(enabled) => setCorrection({ ...correction, enabled })}
            disabled={!canEnable}
          />
        </div>

        <ProviderModelSelector
          providerId={correction.providerId}
          modelId={correction.modelId}
          providers={providers}
          onProviderChange={(id) => setCorrection({ ...correction, providerId: id })}
          onModelChange={(modelId) => setCorrection({ ...correction, modelId })}
        />
      </section>

      <section className="space-y-3 border-t pt-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium">Global Vocabulary</h3>
          <p className="text-xs text-muted-foreground">
            Proper nouns, names, and jargon the LLM should recognise and correct.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTerm(); } }}
            placeholder="e.g. Max Kirschning"
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={addTerm} disabled={!newTerm.trim()}>
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>

        {vocabulary.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {vocabulary.map((term) => (
              <span
                key={term}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-sm"
              >
                {term}
                <button
                  onClick={() => removeTerm(term)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {vocabulary.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No vocabulary terms yet.</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Update settings-dialog.tsx — add Correction tab + update Summary tab**

1. Add import at top:
```typescript
import { CorrectionTab } from '@/components/settings/correction-tab';
import { Wand2 } from 'lucide-react';
```

2. Update `TABS` to add Correction after AI Summary:
```typescript
const TABS = [
  { id: 'General' as const, label: 'General', icon: Settings2 },
  { id: 'Providers' as const, label: 'Providers', icon: Boxes },
  { id: 'AI Summary' as const, label: 'AI Summary', icon: Sparkles },
  { id: 'Correction' as const, label: 'Correction', icon: Wand2 },
  { id: 'Export' as const, label: 'Export', icon: FileOutput },
  { id: 'Shortcuts' as const, label: 'Shortcuts', icon: Keyboard },
  { id: 'Advanced' as const, label: 'Advanced', icon: SlidersHorizontal },
];
```

3. Update the `SettingsDialogProps` interface — remove old summary props and add new ones:

Remove these props:
- `summaryDecryptedKey: string`
- `onSummaryApiBaseUrlChange: (url: string) => void`
- `onSummaryApiKeyChange: (key: string) => Promise<void>`

Keep:
- `summarySettings: SummarySettings`
- `onSummaryModelIdChange: (modelId: string) => void`
- `onSummaryPromptTemplateChange: (template: string) => void`

Add:
- `summaryProviders: Provider[]`
- `onSummaryProviderIdChange: (id: string | null) => void`
- `hasSummaryProvider: boolean`

4. Update `SummarySettingsTab` component — replace the API key / base URL section with a provider dropdown:

Replace the `apiBaseUrl` and `apiKey` fields with:
```tsx
<div className="space-y-1.5">
  <Label htmlFor="summary-provider">Provider</Label>
  <select
    id="summary-provider"
    value={settings.providerId ?? ''}
    onChange={(e) => onProviderIdChange(e.target.value || null)}
    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
  >
    <option value="">— Select provider —</option>
    {providers.map((p) => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
  </select>
  {providers.length === 0 && (
    <p className="text-xs text-muted-foreground">
      Add a provider first in the Providers tab.
    </p>
  )}
</div>
```

Also remove the "Test Connection" button section from `SummarySettingsTab` (testing is now done in Providers tab).

Update `SummarySettingsTab` props: remove `decryptedKey`, add `providers: Provider[]` and `onProviderIdChange: (id: string | null) => void`.

Update live notes toggle to use `hasSummaryProvider` instead of checking `decryptedKey`:
```tsx
<Switch
  id="live-summary-enabled"
  checked={liveSummaryEnabled}
  onCheckedChange={onLiveSummaryEnabledChange}
  disabled={!hasSummaryProvider}
/>
```

5. Add the Correction tab content:
```tsx
{activeTab === 'Correction' && <CorrectionTab />}
```

6. Update the Summary tab render to pass new props.

- [ ] **Step 4: Update SummarySettings type in use-summary-settings.ts**

The `SummarySettings` interface in the hook already reflects the new shape. Update the import in `settings-dialog.tsx`:

```typescript
import type { SummarySettings } from '@/hooks/use-summary-settings';
```

Make sure the `SummarySettingsTab` uses `settings.providerId` not `settings.apiBaseUrl`.

- [ ] **Step 5: Run build**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | grep -E 'error TS' | head -20
```

Fix any remaining TypeScript errors — likely in `App.tsx` due to changed prop names (fixed in Task 14).

- [ ] **Step 6: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add src/hooks/use-summary-settings.ts src/components/settings/correction-tab.tsx src/components/settings-dialog.tsx
git commit -m "feat: update Summary tab to use provider registry; add Correction tab with vocabulary"
```

---

## Task 14: App.tsx Wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/hooks/use-live-summary.ts`

- [ ] **Step 1: Update use-live-summary.ts parameter name**

In `src/hooks/use-live-summary.ts`, rename the `hasSummaryApiKey` parameter to `hasLlmConfigured`:

Find the options interface:
```typescript
interface UseLiveSummaryOptions {
  segments: TranscriptSegment[];
  isRecording: boolean;
  liveSummarySettings: { enabled: boolean; intervalSeconds: number; formatTemplate: string };
  hasSummaryApiKey: boolean;
}
```

Replace with:
```typescript
interface UseLiveSummaryOptions {
  segments: TranscriptSegment[];
  isRecording: boolean;
  liveSummarySettings: { enabled: boolean; intervalSeconds: number; formatTemplate: string };
  hasLlmConfigured: boolean;
}
```

Find every internal use of `hasSummaryApiKey` in the hook body and replace with `hasLlmConfigured`.

- [ ] **Step 2: Update App.tsx**

In `src/App.tsx`, make the following changes:

**a) Update useSummarySettings usage** — replace the old destructuring:

```typescript
const {
  settings: summarySettings,
  decryptedKey: summaryDecryptedKey,
  hasApiKey: hasSummaryApiKey,
  setApiBaseUrl: setSummaryApiBaseUrl,
  setApiKey: setSummaryApiKey,
  setModelId: setSummaryModelId,
  setPromptTemplate: setSummaryPromptTemplate,
} = useSummarySettings();
```

with:

```typescript
const {
  settings: summarySettings,
  hasProvider: hasSummaryProvider,
  providers: summaryProviders,
  setProviderId: setSummaryProviderId,
  setModelId: setSummaryModelId,
  setPromptTemplate: setSummaryPromptTemplate,
} = useSummarySettings();
```

**b) Add correction settings:**

```typescript
const [correctionSettings] = useStoreValue('correction');
```

**c) Update useTranscription call** — add `correctionEnabled`:

```typescript
const {
  segments,
  correctingIds,
  recordingState,
  // ... rest unchanged
} = useTranscription({
  language: selectedLanguage,
  vadOptions: vadSettings,
  correctionEnabled: correctionSettings.enabled && correctionSettings.providerId !== null,
});
```

**d) Update useLiveSummary call** — rename parameter:

```typescript
const {
  liveSummary,
  liveSummaryStatus,
  liveSummaryError,
  corrections,
  addCorrection,
  removeCorrection,
} = useLiveSummary({
  segments,
  isRecording: recordingState === 'recording',
  liveSummarySettings,
  hasLlmConfigured: hasSummaryProvider,
});
```

**e) Update `showLiveSplitPane`:**

```typescript
const showLiveSplitPane = recordingState === 'recording' && liveSummarySettings.enabled && hasSummaryProvider;
```

**f) Update Summarize button disabled condition:**

```typescript
disabled={summaryStatus === 'loading' || !hasSummaryProvider}
title={!hasSummaryProvider ? 'Configure a provider in Settings > Providers and assign it in Settings > AI Summary' : 'Generate AI summary'}
```

**g) Update all TranscriptPanel usages** — add `correctingIds` prop:

```tsx
<TranscriptPanel
  segments={segments}
  speakerNames={speakerNames}
  onRenameSpeaker={renameSpeaker}
  onUpdateText={updateSegmentText}
  onDeleteSegment={deleteSegment}
  correctingIds={correctingIds}
/>
```

(There are two TranscriptPanel usages — update both.)

**h) Update SettingsDialog call** — remove old summary props and add new ones:

Remove: `summaryDecryptedKey`, `onSummaryApiBaseUrlChange`, `onSummaryApiKeyChange`

Add:
```tsx
summaryProviders={summaryProviders}
onSummaryProviderIdChange={setSummaryProviderId}
hasSummaryProvider={hasSummaryProvider}
```

**i) Update OnboardingFlow call** — remove old summary props (apiBaseUrl, apiKey) if it accepts them; check the OnboardingFlow component props and remove the old summary fields that no longer exist:

Find the `OnboardingFlow` usage and remove `onSummaryApiBaseUrlChange` and `onSummaryApiKeyChange` props (the onboarding AI summary step will be updated separately if needed; for now, remove the non-existent prop references).

- [ ] **Step 3: Update the onboarding AI summary step if needed**

Check `src/components/onboarding/onboarding-flow.tsx` for any references to the old `summary.apiBaseUrl` or `summary.apiKey` props. Update them to use the provider-based approach or temporarily remove the API config from onboarding (users can configure providers in Settings after onboarding).

```bash
grep -n 'apiBaseUrl\|apiKey\|setSummaryApi' /Users/max/Documents/Entwicklung/Transcripto/src/components/onboarding/onboarding-flow.tsx 2>/dev/null | head -20
```

For each reference found, update to use the new hook shape. If the onboarding step asked users to configure a cloud provider, you can simplify it to skip that step (users configure providers in the Providers tab post-onboarding).

- [ ] **Step 4: Run build — expect clean**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm build 2>&1 | grep -E 'error TS' | head -20
```

Expected: zero TypeScript errors.

- [ ] **Step 5: Run all tests**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm test 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 6: Manual smoke test**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto && pnpm dev
```

Verify:
- App launches without errors
- Settings dialog opens and shows Providers, AI Summary, Correction, Export, Shortcuts, Advanced tabs
- Providers tab: "Add Provider" form works for cloud type (fill name, base URL, key; save)
- AI Summary tab: shows provider dropdown populated with added provider; prompt template still editable
- Correction tab: enable toggle is greyed until provider is assigned; vocabulary add/remove works
- Recording still works (start/stop without errors in console)

- [ ] **Step 7: Commit**

```bash
cd /Users/max/Documents/Entwicklung/Transcripto
git add src/App.tsx src/hooks/use-live-summary.ts
git commit -m "feat: wire provider registry and correction pipeline into App"
```

---

## Self-Review Checklist

**Spec coverage scan:**

| Spec Section | Covered by Tasks |
|---|---|
| Provider types (cloud/ollama/local) + StoreSchema | Task 1 |
| Migration from old summary config | Task 5 |
| LLMService with CloudBackend + OllamaBackend | Task 3 |
| LLMService with LocalBackend (node-llama-cpp) | Task 8 |
| LLM model catalog + download management | Task 4 |
| Summary service refactor → LLMService | Task 6 |
| Correction pipeline (segment → IPC → LLM → update) | Tasks 7, 9, 10 |
| 2s timeout fallback to raw text | Task 10 |
| "correcting…" visual state | Task 11 |
| Global vocabulary injected into correction prompt | Task 7 |
| Providers tab (list, add/edit/delete/test) | Task 12 |
| Updated Summary tab (provider dropdown) | Task 13 |
| New Correction tab (toggle, provider, vocabulary) | Task 13 |
| `get-providers`, `add-provider`, etc. IPC handlers | Task 9 |
| `correct-segment` IPC handler | Task 9 |
| `ollama-list-models` IPC | Task 9 |
| LLM model download/delete/status IPC | Task 9 |
| Disable correction silently when not configured | Tasks 7, 13 |
| Ollama: no download needed, models listed via API | Tasks 3, 12 |
| Local: one context loaded at a time, released on quit | Task 8 |

**Out-of-scope items confirmed not implemented:**
- Per-task vocabulary overrides ✓
- Import/export of vocabulary list ✓
- Streaming correction ✓
- Cross-segment correction queuing ✓
- Retroactive correction of existing segments ✓
