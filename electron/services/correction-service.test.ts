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
    vi.mocked(settingsStore.get).mockReset();
    vi.mocked(settingsStore.get).mockImplementation((key) => {
      if (key === 'correction') return { enabled: true, providerId: 'p1', modelId: 'm' };
      if (key === 'vocabulary') return [];
      return undefined as never;
    });
    vi.mocked(llmService.complete).mockResolvedValueOnce('Clean text.');
    await correct('raw text');
    const calls = vi.mocked(llmService.complete).mock.calls;
    const call = calls[calls.length - 1];
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
