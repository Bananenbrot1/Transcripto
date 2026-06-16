import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Mic, Monitor, FileAudio, Copy, Trash2, ListChecks, Plus, X } from 'lucide-react';
import type { TranscriptSegment } from '@/types/transcription';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
  onRenameSpeaker: (speakerId: string, name: string) => void;
  onUpdateText?: (id: string, text: string) => void;
  onDeleteSegment?: (id: string) => void;
  correctingIds?: Set<string>;
  onReassignSpeaker?: (segmentIds: Set<string>, targetSpeakerId: string) => void;
  onCreateSpeakerAndReassign?: (segmentIds: Set<string>, name: string) => void;
  disableSelectMode?: boolean;
  disableSelectModeReason?: string;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Format seconds as H:MM:SS (or M:SS when under an hour) for file/video segments. */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getSpeakerDisplayName(
  segment: TranscriptSegment,
  speakerNames: Record<string, string>,
): string {
  return segment.speakerId ? (speakerNames[segment.speakerId] ?? segment.speaker) : segment.speaker;
}

function SpeakerLabel({
  segment,
  speakerNames,
  onRenameSpeaker,
  inert,
}: {
  segment: TranscriptSegment;
  speakerNames: Record<string, string>;
  onRenameSpeaker: (speakerId: string, name: string) => void;
  /** When true, the label is non-interactive (Select Mode suppresses inline rename). */
  inert?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const speakerId = segment.speakerId;
  const displayName = getSpeakerDisplayName(segment, speakerNames);
  const isFile = segment.source === 'file';
  const isMic = segment.source === 'mic';
  const colorClass = isFile ? 'text-purple-600' : isMic ? 'text-blue-600' : 'text-green-600';
  const Icon = isFile ? FileAudio : isMic ? Mic : Monitor;

  const handleClick = () => {
    if (inert || !speakerId) return;
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
      className={`flex items-center gap-1.5 text-xs font-medium ${colorClass} min-w-[60px] ${!inert && speakerId ? 'cursor-pointer hover:opacity-70' : ''}`}
      onClick={handleClick}
      title={!inert && speakerId ? 'Click to rename speaker' : undefined}
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
  isCorrecting,
  inert,
}: {
  segment: TranscriptSegment;
  onUpdateText?: (id: string, text: string) => void;
  onDeleteSegment?: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  isCorrecting?: boolean;
  /** When true, the text is non-interactive (Select Mode suppresses inline text edit). */
  inert?: boolean;
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
    if (inert || !onUpdateText) return;
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
      className={`text-sm leading-relaxed ${!inert && onUpdateText ? 'cursor-text rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-muted/50' : ''}`}
      onClick={startEditing}
    >
      {segment.text}
      {isCorrecting && (
        <span className="text-xs text-muted-foreground italic ml-1">correcting…</span>
      )}
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

/** Unique speakerIds in first-appearance order. */
function uniqueSpeakerIds(segments: TranscriptSegment[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of segments) {
    if (s.speakerId && !seen.has(s.speakerId)) {
      seen.add(s.speakerId);
      result.push(s.speakerId);
    }
  }
  return result;
}

function ReassignPicker({
  segments,
  speakerNames,
  selectedIds,
  onPickExisting,
  onCreateNew,
  onClose,
}: {
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
  selectedIds: Set<string>;
  onPickExisting: (speakerId: string) => void;
  onCreateNew: (name: string) => void;
  onClose: () => void;
}) {
  const [creatingNew, setCreatingNew] = useState(false);
  const speakerIds = useMemo(() => uniqueSpeakerIds(segments), [segments]);
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingNew) {
      setTimeout(() => newInputRef.current?.focus(), 0);
    }
  }, [creatingNew]);

  return (
    <div className="flex flex-col text-sm">
      <div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1">
        Reassign {selectedIds.size} segment{selectedIds.size === 1 ? '' : 's'} to…
      </div>
      <div className="max-h-64 overflow-y-auto">
        {speakerIds.map((id) => {
          const name = speakerNames[id];
          return (
            <button
              key={id}
              className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-accent hover:text-accent-foreground"
              onClick={() => onPickExisting(id)}
            >
              <span className="flex-1 truncate">{name ?? id}</span>
              {name && <span className="text-xs text-muted-foreground truncate">{id}</span>}
            </button>
          );
        })}
      </div>
      <div className="border-t mt-1 pt-1">
        {creatingNew ? (
          <div className="px-2 py-1.5">
            <input
              ref={newInputRef}
              placeholder="New speaker name (optional)"
              className="w-full bg-transparent border-b border-current outline-none text-sm py-0.5"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCreateNew(e.currentTarget.value);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setCreatingNew(false);
                }
              }}
            />
            <div className="text-xs text-muted-foreground mt-1">Enter to create, Esc to cancel</div>
          </div>
        ) : (
          <button
            className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => setCreatingNew(true)}
          >
            <Plus className="size-3.5" />
            New speaker
          </button>
        )}
      </div>
      <div className="border-t mt-1 pt-1">
        <button
          className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-left text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TranscriptPanel({
  segments,
  speakerNames,
  onRenameSpeaker,
  onUpdateText,
  onDeleteSegment,
  correctingIds,
  onReassignSpeaker,
  onCreateSpeakerAndReassign,
  disableSelectMode,
  disableSelectModeReason,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reassignmentEnabled = onReassignSpeaker != null && onCreateSpeakerAndReassign != null;
  const anyDiarized = segments.some((s) => !!s.speakerId);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  // Exit Select Mode automatically if diarization disappears or the panel empties.
  useEffect(() => {
    if (selectMode && (!anyDiarized || segments.length === 0)) {
      setSelectMode(false);
      setSelectedIds(new Set());
      setPickerOpen(false);
    }
  }, [selectMode, anyDiarized, segments.length]);

  // Esc cancels Select Mode when no picker is open (Popover handles its own Esc).
  useEffect(() => {
    if (!selectMode || pickerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectMode, pickerOpen]);

  // Scroll-to-bottom only when new segments arrive — not on any other state
  // change. Without the growth check, exiting Select Mode (selectMode flips
  // false) or closing an inline-edit (editingId flips null) would re-fire
  // this effect and yank the viewport away from wherever the user was
  // looking. Track the previous count via ref and gate the scroll on it.
  const prevSegmentCountRef = useRef(segments.length);
  useEffect(() => {
    const grew = segments.length > prevSegmentCountRef.current;
    prevSegmentCountRef.current = segments.length;
    if (grew && !editingId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments.length, editingId]);

  const toggleSegment = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(segments.filter((s) => s.speakerId).map((s) => s.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setPickerOpen(false);
  };

  const handlePickExisting = (targetSpeakerId: string) => {
    if (selectedIds.size > 0) onReassignSpeaker?.(selectedIds, targetSpeakerId);
    exitSelectMode();
  };

  const handleCreateNew = (name: string) => {
    if (selectedIds.size > 0) onCreateSpeakerAndReassign?.(selectedIds, name);
    exitSelectMode();
  };

  if (segments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Transcript will appear here...</p>
      </div>
    );
  }

  const selectButtonDisabled = !!disableSelectMode || !anyDiarized;
  const selectButtonTitle = disableSelectMode
    ? (disableSelectModeReason ?? 'Selection disabled')
    : !anyDiarized
      ? 'Enable diarization to reassign speakers'
      : 'Select segments to reassign';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {reassignmentEnabled && (
        <div className="shrink-0 pb-2">
          {selectMode ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{selectedIds.size} selected</span>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={selectAll}>
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
              >
                Clear
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" className="h-7 text-xs" disabled={selectedIds.size === 0}>
                      Reassign to…
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-0">
                    <ReassignPicker
                      segments={segments}
                      speakerNames={speakerNames}
                      selectedIds={selectedIds}
                      onPickExisting={handlePickExisting}
                      onCreateNew={handleCreateNew}
                      onClose={() => setPickerOpen(false)}
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exitSelectMode}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={selectButtonDisabled}
              title={selectButtonTitle}
              onClick={() => setSelectMode(true)}
            >
              <ListChecks className="size-3.5" />
              Select
            </Button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {segments.map((segment) => {
          const selectable = selectMode && !!segment.speakerId;
          const isSelected = selectedIds.has(segment.id);
          const rowClick = selectable ? () => toggleSegment(segment.id) : undefined;

          return (
            <div
              key={segment.id}
              className={`group flex gap-3 items-start ${
                correctingIds?.has(segment.id) ? 'opacity-50 transition-opacity duration-200' : ''
              } ${selectable ? 'cursor-pointer rounded -mx-1.5 px-1.5 hover:bg-muted/40' : ''} ${
                isSelected ? 'bg-muted/60 hover:bg-muted/60' : ''
              }`}
              onClick={rowClick}
            >
              {selectMode && (
                <div className="shrink-0 pt-1">
                  {segment.speakerId ? (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSegment(segment.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="size-4" />
                  )}
                </div>
              )}
              <div className="shrink-0 pt-0.5">
                <SpeakerLabel
                  segment={segment}
                  speakerNames={speakerNames}
                  onRenameSpeaker={onRenameSpeaker}
                  inert={selectMode}
                />
              </div>
              <div className="flex-1 min-w-0">
                <EditableText
                  segment={segment}
                  onUpdateText={onUpdateText}
                  onDeleteSegment={onDeleteSegment}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  isCorrecting={correctingIds?.has(segment.id)}
                  inert={selectMode}
                />
              </div>
              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                {!selectMode && <SegmentActions segment={segment} onDeleteSegment={onDeleteSegment} />}
                <span className="text-xs text-muted-foreground">
                  {segment.source === 'file' && segment.startTime != null
                    ? formatDuration(segment.startTime)
                    : formatTime(segment.timestamp)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
