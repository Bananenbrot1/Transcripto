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
