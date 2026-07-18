import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  applyTemplate,
  buildExportVariables,
  formatSrt,
  formatVtt,
  formatPlainText,
  formatSubtitleTimestamp,
  buildExportContent,
} from './format-export';
import type { TranscriptSegment } from '@/types/transcription';

describe('sanitizeFilename', () => {
  it('removes invalid characters', () => {
    expect(sanitizeFilename('my<file>name')).toBe('myfilename');
    expect(sanitizeFilename('test:file/path')).toBe('testfilepath');
    expect(sanitizeFilename('file"with|pipes?')).toBe('filewithpipes');
  });

  it('trims whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });

  it('preserves valid characters', () => {
    expect(sanitizeFilename('2024-01-15 Meeting Notes')).toBe(
      '2024-01-15 Meeting Notes',
    );
  });
});

describe('applyTemplate', () => {
  it('replaces known placeholders', () => {
    const result = applyTemplate('Hello {{name}}, today is {{day}}', {
      name: 'World',
      day: 'Monday',
    });
    expect(result).toBe('Hello World, today is Monday');
  });

  it('leaves unknown placeholders unchanged', () => {
    const result = applyTemplate('{{known}} and {{unknown}}', {
      known: 'yes',
    });
    expect(result).toBe('yes and {{unknown}}');
  });

  it('handles empty template', () => {
    expect(applyTemplate('', { key: 'value' })).toBe('');
  });

  it('handles template with no placeholders', () => {
    expect(applyTemplate('plain text', { key: 'value' })).toBe('plain text');
  });

  it('replaces multiple occurrences of the same placeholder', () => {
    const result = applyTemplate('{{x}} and {{x}}', { x: 'hi' });
    expect(result).toBe('hi and hi');
  });
});

describe('buildExportVariables', () => {
  const segments: TranscriptSegment[] = [
    {
      id: 'seg-1',
      source: 'mic',
      speaker: 'You',
      text: 'Hello world',
      timestamp: new Date('2024-06-15T10:30:15').getTime(),
      speechStartMs: new Date('2024-06-15T10:30:15').getTime(),
      startTime: 0,
      endTime: 2000,
    },
    {
      id: 'seg-2',
      source: 'system',
      speaker: 'Speaker 1',
      text: 'Response here',
      timestamp: new Date('2024-06-15T10:30:25').getTime(),
      speechStartMs: new Date('2024-06-15T10:30:25').getTime(),
      startTime: 2000,
      endTime: 4000,
    },
  ];

  it('produces date in YYYY-MM-DD format', () => {
    const vars = buildExportVariables(segments, 'Test', Date.now() - 60000);
    expect(vars.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses title or defaults to Untitled', () => {
    expect(buildExportVariables(segments, 'My Title', Date.now()).title).toBe(
      'My Title',
    );
    expect(buildExportVariables(segments, '', Date.now()).title).toBe(
      'Untitled',
    );
  });

  it('renders segments with speaker labels', () => {
    const vars = buildExportVariables(segments, 'Test', Date.now());
    expect(vars.segments).toContain('**You**');
    expect(vars.segments).toContain('Hello world');
    expect(vars.segments).toContain('**Speaker 1**');
    expect(vars.segments).toContain('Response here');
  });

  it('calculates duration', () => {
    const startTime = Date.now() - 65000; // 65 seconds ago
    const vars = buildExportVariables(segments, 'Test', startTime);
    expect(vars.duration).toMatch(/1m \d+s/);
  });
});

describe('subtitle / plain export', () => {
  const start = 1_000_000;
  const cues: TranscriptSegment[] = [
    {
      id: 'diar-0',
      source: 'system',
      speaker: 'Speaker A',
      text: 'Hello',
      timestamp: start,
      speechStartMs: start,
      startTime: 0,
      endTime: 1.5,
    },
    {
      id: 'diar-1',
      source: 'system',
      speaker: 'Speaker B',
      text: 'Hi there',
      timestamp: start + 1500,
      speechStartMs: start + 1500,
      startTime: 1.5,
      endTime: 3,
    },
  ];

  it('formats SRT with comma decimals', () => {
    const srt = formatSrt(cues, start);
    expect(srt).toContain('1\n');
    expect(srt).toContain('00:00:00,000 --> 00:00:01,500');
    expect(srt).toContain('Speaker A: Hello');
    expect(srt).toContain('Speaker B: Hi there');
  });

  it('formats VTT with WEBVTT header and dot decimals', () => {
    const vtt = formatVtt(cues, start);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.500');
  });

  it('formats plain text without markdown', () => {
    expect(formatPlainText(cues)).toBe('Speaker A: Hello\n\nSpeaker B: Hi there');
  });

  it('pads subtitle timestamps', () => {
    expect(formatSubtitleTimestamp(3661001, ',')).toBe('01:01:01,001');
  });

  it('buildExportContent picks the right extension', () => {
    expect(buildExportContent('srt', cues, 'T', start, '').extension).toBe('srt');
    expect(buildExportContent('vtt', cues, 'T', start, '').extension).toBe('vtt');
    expect(buildExportContent('txt', cues, 'T', start, '').extension).toBe('txt');
    expect(buildExportContent('md', cues, 'T', start, '# {{title}}').extension).toBe('md');
  });
});

