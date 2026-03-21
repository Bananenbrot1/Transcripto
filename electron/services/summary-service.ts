import { safeStorage } from 'electron';
import * as settingsStore from './settings-store.js';
import type { SummaryResult, LiveSummarizeRequest } from '../../shared/types.js';

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

  const language = settingsStore.get('language') || 'auto';
  const languageLabel = language === 'auto'
    ? 'the same language as the transcript'
    : language;

  const prompt = settings.promptTemplate
    .replace(/\{\{transcript\}\}/g, transcript)
    .replace(/\{\{title\}\}/g, title || 'Untitled')
    .replace(/\{\{language\}\}/g, languageLabel);

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

export async function liveSummarize(request: LiveSummarizeRequest): Promise<SummaryResult> {
  const settings = settingsStore.get('summary');
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('No API key configured. Set your API key in Settings > AI Summary.');
  }

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

  const prompt = parts.join('\n');

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
