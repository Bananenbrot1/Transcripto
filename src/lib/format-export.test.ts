import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  applyTemplate,
  buildExportVariables,
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
      text: 'Hello world',
      timestamp: new Date('2024-06-15T10:30:15').getTime(),
      startTime: 0,
      endTime: 2000,
    },
    {
      id: 'seg-2',
      source: 'system',
      text: 'Response here',
      timestamp: new Date('2024-06-15T10:30:25').getTime(),
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
    expect(vars.segments).toContain('**Others**');
    expect(vars.segments).toContain('Response here');
  });

  it('calculates duration', () => {
    const startTime = Date.now() - 65000; // 65 seconds ago
    const vars = buildExportVariables(segments, 'Test', startTime);
    expect(vars.duration).toMatch(/1m \d+s/);
  });
});
