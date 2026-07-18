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

export type ExportFormat = 'md' | 'srt' | 'vtt' | 'txt';

export function formatSubtitleTimestamp(ms: number, decimalSep: ',' | '.'): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${decimalSep}${pad(millis, 3)}`;
}

/** Cue range for a segment on the recording timeline (ms from recording start). */
export function segmentCueMs(
  seg: TranscriptSegment,
  recordingStartTime: number,
  next?: TranscriptSegment,
): { startMs: number; endMs: number } {
  // Diarized segments store absolute seconds on the recording timeline.
  if (seg.id.startsWith('diar-') && seg.endTime > seg.startTime) {
    return { startMs: seg.startTime * 1000, endMs: seg.endTime * 1000 };
  }

  const startMs = Math.max(0, seg.speechStartMs - recordingStartTime);
  if (next) {
    const nextStart = Math.max(0, next.speechStartMs - recordingStartTime);
    if (nextStart > startMs) return { startMs, endMs: nextStart };
  }

  let dur = seg.endTime - seg.startTime;
  if (dur > 0) {
    // whisper.cpp bindings often emit centiseconds; treat large deltas as such.
    const durMs = dur > 600 ? dur * 10 : dur * 1000;
    return { startMs, endMs: startMs + Math.max(500, durMs) };
  }
  return { startMs, endMs: startMs + 2000 };
}

export function formatPlainText(segments: TranscriptSegment[]): string {
  return segments.map((seg) => `${seg.speaker}: ${seg.text}`).join('\n\n');
}

export function formatSrt(
  segments: TranscriptSegment[],
  recordingStartTime: number,
): string {
  return segments
    .map((seg, i) => {
      const { startMs, endMs } = segmentCueMs(seg, recordingStartTime, segments[i + 1]);
      return [
        String(i + 1),
        `${formatSubtitleTimestamp(startMs, ',')} --> ${formatSubtitleTimestamp(endMs, ',')}`,
        `${seg.speaker}: ${seg.text}`,
        '',
      ].join('\n');
    })
    .join('\n');
}

export function formatVtt(
  segments: TranscriptSegment[],
  recordingStartTime: number,
): string {
  const body = segments
    .map((seg, i) => {
      const { startMs, endMs } = segmentCueMs(seg, recordingStartTime, segments[i + 1]);
      return [
        `${formatSubtitleTimestamp(startMs, '.')} --> ${formatSubtitleTimestamp(endMs, '.')}`,
        `${seg.speaker}: ${seg.text}`,
        '',
      ].join('\n');
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function buildExportContent(
  format: ExportFormat,
  segments: TranscriptSegment[],
  title: string,
  recordingStartTime: number,
  bodyTemplate: string,
  summaryText?: string,
): { content: string; extension: string } {
  switch (format) {
    case 'srt':
      return { content: formatSrt(segments, recordingStartTime), extension: 'srt' };
    case 'vtt':
      return { content: formatVtt(segments, recordingStartTime), extension: 'vtt' };
    case 'txt':
      return { content: formatPlainText(segments), extension: 'txt' };
    case 'md':
    default: {
      const vars = buildExportVariables(segments, title, recordingStartTime, summaryText);
      return { content: applyTemplate(bodyTemplate, vars), extension: 'md' };
    }
  }
}
