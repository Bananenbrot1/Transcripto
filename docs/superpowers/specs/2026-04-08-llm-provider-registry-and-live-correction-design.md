# LLM Provider Registry & Live Correction Design

**Date:** 2026-04-08
**Status:** Approved

## Overview

This feature introduces a unified LLM provider/model configuration system and a live correction pipeline that automatically cleans up Whisper transcription output using a small LLM. Both the existing summary feature and the new correction feature route through this shared system.

---

## Goals

- Automatic, silent cleanup of each Whisper segment: remove filler words, fix misheard words, correct punctuation and casing.
- A global vocabulary/glossary list of correct spellings (names, companies, jargon) injected into every correction call.
- A unified provider registry where users configure cloud, Ollama, and local GGUF providers once and assign them independently to each task (summary, correction).
- No disruption when correction fails — raw Whisper text is always the fallback.

---

## Section 1 — Provider Registry (Data Model)

### Settings Schema Additions

```ts
type ProviderType = 'cloud' | 'ollama' | 'local';

interface Provider {
  id: string;             // nanoid, e.g. "prov_abc123"
  name: string;           // user-facing label, e.g. "OpenAI", "My Ollama", "Tiny Qwen"
  type: ProviderType;

  // cloud only
  apiBaseUrl?: string;    // e.g. "https://api.openai.com/v1"
  apiKey?: string;        // stored encrypted via safeStorage

  // ollama only
  ollamaBaseUrl?: string; // default "http://localhost:11434"

  // local only
  localModelId?: string;  // references a downloaded GGUF model id
}

interface TaskConfig {
  enabled: boolean;
  providerId: string | null;  // references Provider.id
  modelId: string;            // model name/id within that provider
}
```

### Settings Store Changes

| Key | Type | Notes |
|-----|------|-------|
| `providers` | `Provider[]` | New. The provider registry. |
| `summary` | `TaskConfig & { promptTemplate }` | Refactored. Gains `providerId`. |
| `correction` | `TaskConfig` | New. |
| `vocabulary` | `string[]` | New. Global glossary of canonical terms. |

### Migration

On first launch after upgrade, the existing `summary.apiBaseUrl` + `summary.apiKey` are silently migrated into a new cloud provider entry. The `summary` task config is updated to point to it. The user sees their existing config already populated in the new UI with no action required.

---

## Section 2 — LLMService (Main Process)

New file: `electron/services/llm-service.ts`

### Interface

```ts
complete(
  providerId: string,
  modelId: string,
  messages: ChatMessage[]
): Promise<string>

testConnection(provider: Provider): Promise<{ ok: boolean; error?: string }>
```

### Backends

**CloudBackend**
- The existing fetch-based OpenAI-compatible call from `summary-service.ts` moves here.
- Calls `POST {apiBaseUrl}/chat/completions` with Bearer auth.

**OllamaBackend**
- Calls Ollama's OpenAI-compatible endpoint: `POST {ollamaBaseUrl}/v1/chat/completions`.
- No extra library — plain `fetch`.
- `listModels()` calls `GET {ollamaBaseUrl}/api/tags` and returns available model names for the settings UI dropdown.

**LocalBackend**
- Uses `node-llama-cpp` to load and run a downloaded GGUF file.
- One model context is kept loaded at a time (lazy init on first call, ~1–2s one-time cost). If two tasks use different local providers (e.g. correction uses Qwen, summary uses Phi), the backend releases the current context and loads the requested one on demand. In practice users will configure both tasks to the same local provider to avoid this swap.
- Released on app quit.

### Summary Service Refactor

`electron/services/summary-service.ts` becomes a thin wrapper: it builds the prompt and calls `llmService.complete(providerId, modelId, messages)`. No user-visible behaviour change.

---

## Section 3 — Local Models (GGUF)

New file: `electron/services/llm-model-manager.ts`

Follows the same pattern as `model-manager.ts` (Whisper):
- A curated catalog of small GGUF models, downloaded from HuggingFace to `userData/llm-models/`.
- Download/delete/status IPC handlers mirroring the Whisper model handlers.

### Model Catalog

The exact catalog is finalized at implementation time based on what is currently available, prioritising the latest SmolLM and Qwen releases. Target range: 200MB–1GB Q4-quantized models suitable for fast CPU inference. Example tiers:

| Tier | Target size | Purpose |
|------|-------------|---------|
| Fastest | ~200–350MB | Correction only, minimal latency |
| Balanced | ~350–600MB | Good quality, still fast |
| Quality | ~600MB–1GB | Near-cloud quality, correction + summary |
| Power | ~1–2.5GB | Best local quality |

**Ollama:** No download management needed. The `OllamaBackend` lists models via the Ollama API. Users manage Ollama models themselves.

---

## Section 4 — Correction Pipeline

### Flow

1. Whisper returns a raw transcript segment.
2. Segment is added to the transcript immediately with a subtle **"correcting…" visual state** (slightly dimmed).
3. `electronAPI.correctSegment(rawText)` is called via IPC.
4. Main process calls `LLMService.complete()` with the correction prompt.
5. Corrected text returned → segment updates silently in place, visual state clears.
6. On any failure or timeout (2s hard limit) → raw Whisper text stays, visual state clears silently. No error shown to user.

### Correction Prompt

```
You are a transcript corrector. Fix filler words (um, uh, like, you know),
obvious Whisper mishearings, and casing/punctuation. Do NOT rephrase or add
meaning. Return only the corrected text, nothing else.

Known vocabulary — correct these spellings if you recognise them in any form:
{vocabulary list, comma-separated}

Text: "{raw segment}"
```

The vocabulary line is omitted when the list is empty.

### Toggle

Correction can be enabled or disabled in Settings > Correction. When disabled, the pipeline is bypassed entirely — zero latency impact on transcription.

---

## Section 5 — Global Vocabulary List

A `vocabulary: string[]` field in the settings store. Each entry is the canonical correct spelling of a proper noun, name, company, or domain-specific term.

**Behaviour:** The LLM uses fuzzy recognition — the user only provides the correct form (e.g. `Max Kirschning`), and the model identifies and corrects all Whisper variants (e.g. "max körshling", "max kirsching") automatically.

**Scope:** Global. Injected into every correction call. May be injected into summary prompts in a future iteration.

**Storage:** Plain `string[]` in the settings store. No encryption needed.

---

## Section 6 — Settings UI

### Providers Tab (new)

A new tab in the Settings dialog listing all configured providers. Each row shows name + type badge (Cloud / Ollama / Local).

Actions per row: **Edit**, **Delete**, **Test**.

**Add / Edit form** — fields shown depend on type:

| Type | Fields |
|------|--------|
| Cloud | Name, Base URL, API Key (masked input) |
| Ollama | Name, Base URL, "Fetch models" button |
| Local | Name, model picker from downloadable catalog with download/delete/progress |

> **Note on local providers:** A local provider IS a specific model — `localModelId` is set when creating the provider. When a task is assigned a local provider, the model field is hidden (it's already determined by the provider). Users create one local provider per model they want available (e.g. "Qwen 0.5B", "SmolLM3 360M").

**Test button** pings the backend and shows ✓ or an error message inline.

### Updated Summary Tab

The existing API key / base URL / model text fields are replaced with:
- **Provider** dropdown (populated from the registry)
- **Model** field (free text for cloud/local; dropdown populated from Ollama for Ollama providers)
- Prompt template stays as-is.

### New Correction Tab

- Enable/disable toggle
- **Provider** dropdown
- **Model** field
- **Vocabulary** section: text input to add a term (Enter to add) + list of current terms with individual remove buttons.

---

## IPC Surface (New Handlers)

| Handler | Direction | Purpose |
|---------|-----------|---------|
| `get-providers` | invoke | List all providers |
| `add-provider` | invoke | Add a new provider |
| `update-provider` | invoke | Update existing provider |
| `delete-provider` | invoke | Remove provider |
| `test-provider` | invoke | Test connectivity |
| `ollama-list-models` | invoke | Fetch available models from Ollama |
| `get-available-llm-models` | invoke | List downloadable local GGUF catalog |
| `get-llm-model-status` | invoke | Check download status of a local model |
| `download-llm-model` | invoke | Start download |
| `delete-llm-model` | invoke | Remove downloaded model |
| `on-llm-download-progress` | event | Download progress updates |
| `correct-segment` | invoke | Run correction on a single transcript segment |

---

## Error Handling & Degradation

- **Correction timeout (2s):** Raw Whisper text is used. No error shown.
- **Provider not configured:** Correction is skipped silently. The enable toggle is greyed out with a hint to configure a provider.
- **Local model not downloaded:** Same as above — greyed out with a "Download a model first" hint.
- **Ollama not running:** `test-provider` shows an error. Correction falls back to raw text.
- **Migration failure:** If old summary settings can't be parsed, the summary task is reset to unconfigured state and the user is prompted to reconfigure.

---

## Out of Scope

- Per-task vocabulary overrides (global only for now)
- Import/export of vocabulary list
- Streaming/token-by-token correction display
- Cross-segment correction queuing — each segment's correction is an independent async call; segments don't wait for each other's correction to complete
- Applying correction retroactively to existing segments
