import type { TranscriptSegment } from '@/types/transcription';

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

export function applyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match;
  });

  // Strip empty summary section (heading + separator) when no summary text
  result = result.replace(/\n## Summary\n\s*\n---\n/m, '\n---\n');
  // Strip empty summary and surrounding separator/whitespace
  result = result.replace(/^\s*\n---\n/m, '');
  // Also clean up any leading blank lines left behind
  result = result.replace(/^\n+/, '');

  return result;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatTranscriptForPrompt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => {
      const totalSec = Math.floor(seg.timestamp / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      const time = `${pad(h)}:${pad(m)}:${pad(s)}`;
      return `[${time}] ${seg.speaker}: ${seg.text}`;
    })
    .join('\n');
}

export function renderSegments(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => {
      const time = formatTimestamp(seg.timestamp);
      return `**${seg.speaker}** *${time}*\n${seg.text}`;
    })
    .join('\n\n');
}

export interface ExportVariables extends Record<string, string> {
  date: string;
  time: string;
  title: string;
  duration: string;
  segments: string;
  summary: string;
}

export function buildExportVariables(
  segments: TranscriptSegment[],
  title: string,
  recordingStartTime: number,
  summaryText?: string,
): ExportVariables {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const duration =
    segments.length > 0
      ? formatDuration(Date.now() - recordingStartTime)
      : '0s';

  return {
    date,
    time,
    title: title || 'Untitled',
    duration,
    segments: renderSegments(segments),
    summary: summaryText ?? '',
  };
}
