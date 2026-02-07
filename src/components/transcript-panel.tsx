import { useEffect, useRef } from 'react';
import { Mic, Monitor } from 'lucide-react';
import type { TranscriptSegment } from '@/types/transcription';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TranscriptPanel({ segments }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length]);

  if (segments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Transcript will appear here...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
      {segments.map((segment) => (
        <div key={segment.id} className="flex gap-3 items-start">
          <div className="shrink-0 pt-0.5">
            {segment.source === 'mic' ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 min-w-[60px]">
                <Mic className="size-3" />
                You
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 min-w-[60px]">
                <Monitor className="size-3" />
                Others
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed">{segment.text}</p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
            {formatTime(segment.timestamp)}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
