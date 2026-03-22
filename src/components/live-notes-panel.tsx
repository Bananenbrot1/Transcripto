import { useState, useCallback } from 'react';
import { ClipboardCopy, Loader2, Send, X, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SummaryResult, LiveSummaryGenerationStatus } from '../../shared/types';

interface LiveNotesPanelProps {
  summary: SummaryResult | null;
  status: LiveSummaryGenerationStatus;
  error: string;
  corrections: string[];
  onAddCorrection: (correction: string) => void;
  onRemoveCorrection: (index: number) => void;
}

export function LiveNotesPanel({
  summary,
  status,
  error,
  corrections,
  onAddCorrection,
  onRemoveCorrection,
}: LiveNotesPanelProps) {
  const [copied, setCopied] = useState(false);
  const [correctionInput, setCorrectionInput] = useState('');
  const [correctionsExpanded, setCorrectionsExpanded] = useState(false);

  const handleCopy = useCallback(() => {
    if (!summary) return;
    navigator.clipboard.writeText(summary.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [summary]);

  const handleSubmitCorrection = useCallback(() => {
    const trimmed = correctionInput.trim();
    if (!trimmed) return;
    onAddCorrection(trimmed);
    setCorrectionInput('');
  }, [correctionInput, onAddCorrection]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitCorrection();
    }
  }, [handleSubmitCorrection]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <h2 className="text-sm font-medium">Live Notes</h2>
        {status === 'generating' && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        {status === 'error' && (
          <span className="flex items-center gap-1 text-destructive" title={error}>
            <AlertCircle className="size-3.5" />
            <span className="text-xs truncate max-w-[150px]">{error.split(':')[0] || 'Error'}</span>
          </span>
        )}
        {summary && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="ml-auto h-6 px-2 text-xs"
          >
            <ClipboardCopy className="size-3" />
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        )}
      </div>

      {/* Summary content */}
      <div className="flex-1 overflow-y-auto pr-1 min-h-0">
        {summary ? (
          <div className="whitespace-pre-wrap text-sm">
            {summary.text}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Waiting for enough transcript to generate notes...
          </p>
        )}
      </div>

      {/* Corrections list */}
      {corrections.length > 0 && (
        <div className="shrink-0 mt-2 border-t pt-2">
          <button
            onClick={() => setCorrectionsExpanded(!correctionsExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {correctionsExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {corrections.length} correction{corrections.length !== 1 ? 's' : ''} applied
          </button>
          {correctionsExpanded && (
            <div className="mt-1 flex flex-col gap-1">
              {corrections.map((c, i) => (
                <div key={i} className="flex items-start gap-1 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                  <span className="flex-1">{c}</span>
                  <button
                    onClick={() => onRemoveCorrection(i)}
                    className="shrink-0 hover:text-destructive transition-colors mt-0.5"
                    title="Remove correction"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Correction input */}
      <div className="shrink-0 mt-2 flex gap-1.5">
        <Input
          value={correctionInput}
          onChange={(e) => setCorrectionInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Add a correction... (e.g. "The project is called Atlas")'
          className="h-7 text-xs flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSubmitCorrection}
          disabled={!correctionInput.trim()}
          className="h-7 px-2"
        >
          <Send className="size-3" />
        </Button>
      </div>
    </div>
  );
}
