import { useEffect, useRef, useState } from 'react';
import { Mic, Monitor } from 'lucide-react';
import type { TranscriptSegment } from '@/types/transcription';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
  onRenameSpeaker: (speakerId: string, name: string) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function SpeakerLabel({
  segment,
  speakerNames,
  onRenameSpeaker,
}: {
  segment: TranscriptSegment;
  speakerNames: Record<string, string>;
  onRenameSpeaker: (speakerId: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const speakerId = segment.speakerId;
  const displayName = speakerId ? (speakerNames[speakerId] ?? segment.speaker) : segment.speaker;
  const isMic = segment.source === 'mic';
  const colorClass = isMic ? 'text-blue-600' : 'text-green-600';
  const Icon = isMic ? Mic : Monitor;

  const handleClick = () => {
    if (!speakerId) return;
    setEditing(true);
    // Focus the input after render
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (speakerId && value) {
      onRenameSpeaker(speakerId, value);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  if (editing && speakerId) {
    return (
      <div className={`flex items-center gap-1.5 text-xs font-medium ${colorClass} min-w-[60px]`}>
        <Icon className="size-3 shrink-0" />
        <input
          ref={inputRef}
          defaultValue={displayName}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-20 bg-transparent border-b border-current outline-none text-xs"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium ${colorClass} min-w-[60px] ${speakerId ? 'cursor-pointer hover:opacity-70' : ''}`}
      onClick={handleClick}
      title={speakerId ? 'Click to rename speaker' : undefined}
    >
      <Icon className="size-3" />
      {displayName}
    </div>
  );
}

export function TranscriptPanel({ segments, speakerNames, onRenameSpeaker }: TranscriptPanelProps) {
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
            <SpeakerLabel
              segment={segment}
              speakerNames={speakerNames}
              onRenameSpeaker={onRenameSpeaker}
            />
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
