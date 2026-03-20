import { safeStorage } from 'electron';
import * as settingsStore from './settings-store.js';
import type { SummaryResult } from '../../shared/types.js';

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

function getApiKey(): string {
  const encrypted = settingsStore.get('summary').apiKey;
  if (!encrypted) return '';
  try {
    return decryptString(encrypted);
  } catch {
    return '';
  }
}

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  const settings = settingsStore.get('summary');
  const apiKey = getApiKey();

  if (!apiKey) {
    return { success: false, error: 'No API key configured' };
  }

  try {
    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: settings.modelId,
        messages: [{ role: 'user', content: 'Reply with "ok".' }],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `API error ${response.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

export async function summarize(transcript: string, title: string): Promise<SummaryResult> {
  const settings = settingsStore.get('summary');
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('No API key configured. Set your API key in Settings > AI Summary.');
  }

  const prompt = settings.promptTemplate
    .replace(/\{\{transcript\}\}/g, transcript)
    .replace(/\{\{title\}\}/g, title || 'Untitled');

  const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: settings.modelId,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? '';
  const usage = data.usage ?? {};

  return {
    text,
    usage: {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    },
  };
}
