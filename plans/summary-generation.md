# Plan: AI Summary Generation

> Source PRD: Summary feature design from grill-me session

## Architectural decisions

Durable decisions that apply across all phases:

- **Store schema**: New `summary` section in `StoreSchema` with `apiBaseUrl` (string), `apiKey` (string, encrypted via safeStorage), `modelId` (string), `promptTemplate` (string with `{{transcript}}` and `{{title}}` variables)
- **IPC channels**: `summarize(transcript, title)` → returns `{ text, usage }`, `test-summary-connection()` → returns `{ success, error? }`, `encrypt-string` / `decrypt-string` for safeStorage access
- **API client**: OpenAI-compatible chat completions (`/v1/chat/completions`), called from main process via `fetch`
- **Data model**: Summary result (`text`, `usage`) lives in renderer React state + localStorage, same lifecycle as transcript segments
- **Template variable**: `{{summary}}` added to the existing `applyTemplate()` regex system in `format-export.ts`
- **Transcript format for prompt**: `[HH:MM:SS] Speaker: text` per segment, merged chronologically

---

## Phase 1: Remove auto-save

**User stories**: Clean up unused auto-save feature to simplify export settings before adding summary

### What to build

Remove the `autoSave` flag from the store schema, defaults, settings UI (Export tab toggle), and the recording-stop logic in App.tsx that triggers automatic saves. Keep manual Save button, export folder, filename template, and body template intact.

### Acceptance criteria

- [ ] `autoSave` removed from `StoreSchema` and `storeDefaults`
- [ ] Auto-save toggle removed from Export tab in settings dialog
- [ ] Auto-save logic removed from App.tsx (the `useEffect` watching recording state transitions)
- [ ] Save status UI tied to auto-save removed
- [ ] Manual Save button still works correctly
- [ ] App builds without errors (`pnpm build`)

---

## Phase 2: Summary settings & encrypted storage

**User stories**: User can configure API connection details for summary generation

### What to build

Add a new "AI Summary" tab to the settings dialog with four fields: API Base URL (text, default OpenRouter), API Key (masked input, encrypted at rest via Electron safeStorage), Model ID (free text, default `anthropic/claude-sonnet-4-20250514`), and Prompt Template (textarea with `{{transcript}}` and `{{title}}` placeholder documentation). Add a "Test Connection" button that sends a minimal request through the main process to verify the configuration works, showing inline success/error feedback.

### Acceptance criteria

- [ ] `summary` section added to `StoreSchema` with `apiBaseUrl`, `apiKey`, `modelId`, `promptTemplate`
- [ ] Defaults set: OpenRouter base URL, empty API key, `anthropic/claude-sonnet-4-20250514`, default prompt template
- [ ] API key encrypted via `safeStorage.encryptString()` before storing, decrypted on read
- [ ] IPC channels for `encrypt-string` and `decrypt-string` added to preload bridge
- [ ] "AI Summary" tab appears in settings dialog with all 4 fields
- [ ] "Test Connection" button sends a small chat completion request from main process
- [ ] Success shows green checkmark, failure shows error message inline
- [ ] App builds without errors

---

## Phase 3: Summarize end-to-end

**User stories**: User can generate a summary of their transcript after recording

### What to build

Add a "Summarize" button to the post-recording bar. When clicked, format all transcript segments as `[HH:MM:SS] Speaker: text`, inject into the prompt template, and send to the main process via IPC. Main process calls the OpenAI-compatible chat completions endpoint with the configured base URL, API key, and model. Display the result in a new "Summary" tab next to "Transcript" (tab only appears after generation). Show loading spinner on button while in-flight, disable button. Show errors via toast. Display token usage below the summary as muted text. Add a Copy button on the summary tab. Button is disabled with tooltip when no API key is configured. Re-clicking Summarize overwrites the previous summary.

### Acceptance criteria

- [ ] "Summarize" button in post-recording bar with loading spinner
- [ ] Button disabled with tooltip when no API key configured
- [ ] Transcript formatted as `[HH:MM:SS] Speaker: text` for the prompt
- [ ] Prompt template variables (`{{transcript}}`, `{{title}}`) substituted correctly
- [ ] IPC `summarize` channel calls OpenAI-compatible `/v1/chat/completions` from main process
- [ ] Response parsed for summary text and usage (prompt_tokens, completion_tokens)
- [ ] "Summary" tab appears next to "Transcript" after generation
- [ ] Summary displayed as read-only rendered markdown
- [ ] Token usage shown below summary as muted text
- [ ] Copy button copies summary text to clipboard
- [ ] Errors shown via toast notification
- [ ] Re-generate overwrites previous summary

---

## Phase 4: Summary persistence & export

**User stories**: Summary survives app restart and is included in markdown exports

### What to build

Persist the summary (text + usage) to localStorage alongside transcript segments using the same debounce pattern. Clear summary when transcript is dismissed, when a new recording starts, or on manual clear. Add `{{summary}}` as a template variable in the export system. When no summary exists, strip the `{{summary}}` placeholder and any adjacent separator (`---`) from the rendered output. Update the default body template to `{{summary}}\n\n---\n\n{{segments}}`.

### Acceptance criteria

- [ ] Summary persisted to localStorage (new key `transcripto-session-summary`)
- [ ] Summary restored on app restart / session load
- [ ] Summary cleared on dismiss transcript, new recording start
- [ ] `{{summary}}` variable available in export template system
- [ ] Empty `{{summary}}` and surrounding `---` separator stripped cleanly
- [ ] Default body template updated to include `{{summary}}` above segments
- [ ] Manual Save produces correct markdown with summary when present
- [ ] Manual Save produces clean markdown without summary artifacts when absent
