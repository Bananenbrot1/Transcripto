import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, Monitor, FileAudio, Copy, Trash2 } from 'lucide-react';
import type { TranscriptSegment } from '@/types/transcription';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
  onRenameSpeaker: (speakerId: string, name: string) => void;
  onUpdateText?: (id: string, text: string) => void;
  onDeleteSegment?: (id: string) => void;
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
  const isFile = segment.source === 'file';
  const isMic = segment.source === 'mic';
  const colorClass = isFile ? 'text-purple-600' : isMic ? 'text-blue-600' : 'text-green-600';
  const Icon = isFile ? FileAudio : isMic ? Mic : Monitor;

  const handleClick = () => {
    if (!speakerId) return;
    setEditing(true);
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

function EditableText({
  segment,
  onUpdateText,
  onDeleteSegment,
  editingId,
  setEditingId,
}: {
  segment: TranscriptSegment;
  onUpdateText?: (id: string, text: string) => void;
  onDeleteSegment?: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(segment.text);
  const isEditing = editingId === segment.id;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [isEditing]);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onDeleteSegment?.(segment.id);
    } else if (trimmed !== segment.text) {
      onUpdateText?.(segment.id, trimmed);
    }
    setEditingId(null);
  }, [draft, segment.id, segment.text, onUpdateText, onDeleteSegment, setEditingId]);

  const startEditing = () => {
    if (!onUpdateText) return;
    setDraft(segment.text);
    setEditingId(segment.id);
  };

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            setDraft(segment.text);
            setEditingId(null);
          }
        }}
        className="w-full text-sm leading-relaxed bg-transparent border border-border rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
        rows={1}
      />
    );
  }

  return (
    <p
      className={`text-sm leading-relaxed ${onUpdateText ? 'cursor-text rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-muted/50' : ''}`}
      onClick={startEditing}
    >
      {segment.text}
    </p>
  );
}

function SegmentActions({
  segment,
  onDeleteSegment,
}: {
  segment: TranscriptSegment;
  onDeleteSegment?: (id: string) => void;
}) {
  if (!onDeleteSegment) return null;

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        className="p-0.5 rounded hover:bg-muted text-muted-foreground"
        title="Copy segment"
        onClick={() => navigator.clipboard.writeText(`${segment.speaker}: ${segment.text}`)}
      >
        <Copy className="size-3" />
      </button>
      <button
        className="p-0.5 rounded hover:bg-muted text-destructive/60 hover:text-destructive"
        title="Delete segment"
        onClick={() => onDeleteSegment(segment.id)}
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

export function TranscriptPanel({
  segments,
  speakerNames,
  onRenameSpeaker,
  onUpdateText,
  onDeleteSegment,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments.length, editingId]);

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
        <div key={segment.id} className="group flex gap-3 items-start">
          <div className="shrink-0 pt-0.5">
            <SpeakerLabel
              segment={segment}
              speakerNames={speakerNames}
              onRenameSpeaker={onRenameSpeaker}
            />
          </div>
          <div className="flex-1 min-w-0">
            <EditableText
              segment={segment}
              onUpdateText={onUpdateText}
              onDeleteSegment={onDeleteSegment}
              editingId={editingId}
              setEditingId={setEditingId}
            />
          </div>
          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            <SegmentActions
              segment={segment}
              onDeleteSegment={onDeleteSegment}
            />
            <span className="text-xs text-muted-foreground">
              {formatTime(segment.timestamp)}
            </span>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
