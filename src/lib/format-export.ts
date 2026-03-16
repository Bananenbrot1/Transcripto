import type { TranscriptSegment } from '@/types/transcription';

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

export function applyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match;
  });
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
}

export function buildExportVariables(
  segments: TranscriptSegment[],
  title: string,
  recordingStartTime: number,
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
  };
}
