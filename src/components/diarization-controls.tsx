import { useState, useEffect, useCallback } from 'react';
import { Loader2, Users, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DiarizationState } from '@/hooks/use-transcription';
import type { DiarizationDownloadProgress } from '@/types/electron-api';

interface DiarizationControlsProps {
  diarizationState: DiarizationState;
  onAnalyze: (numSpeakers: number) => void;
  onModelsReady: () => void;
  elapsedMs?: number;
  retranscribeProgress?: { current: number; total: number; elapsedMs: number } | null;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec} s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} m ${s} s`;
}

/** Valid speaker counts are integers in [2, 20]. */
export function parseNumSpeakers(input: string): number | undefined {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = parseInt(trimmed, 10);
  return n >= 2 && n <= 20 ? n : undefined;
}

export function DiarizationControls({
  diarizationState,
  onAnalyze,
  onModelsReady,
  elapsedMs = 0,
  retranscribeProgress = null,
}: DiarizationControlsProps) {
  const [numSpeakersInput, setNumSpeakersInput] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DiarizationDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [totalSizeMB, setTotalSizeMB] = useState(35);

  useEffect(() => {
    if (diarizationState === 'models-missing') {
      window.electronAPI.checkDiarizationModels().then((status) => {
        setTotalSizeMB(status.totalSizeMB);
      });
    }
  }, [diarizationState]);

  const numSpeakers = parseNumSpeakers(numSpeakersInput);
  const canAnalyze = numSpeakers !== undefined;

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setDownloadError(null);
    setDownloadProgress(null);

    const unsubscribe = window.electronAPI.onDiarizationDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });

    try {
      await window.electronAPI.downloadDiarizationModels();
      const status = await window.electronAPI.checkDiarizationModels();
      if (status.segmentation && status.embedding) {
        // Transition to available so the user can enter a speaker count.
        onModelsReady();
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      unsubscribe();
      setDownloading(false);
      setDownloadProgress(null);
    }
  }, [onModelsReady]);

  if (diarizationState === 'idle' || diarizationState === 'done') {
    if (diarizationState === 'done') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5" />
          Speaker analysis complete — click a speaker label to rename
        </div>
      );
    }
    return null;
  }

  if (diarizationState === 'models-missing') {
    if (downloading) {
      const phase = downloadProgress?.phase;
      const percent = downloadProgress?.percent ?? 0;
      const label =
        phase === 'segmentation'
          ? `Downloading segmentation model… ${percent}%`
          : phase === 'embedding'
            ? `Downloading embedding model… ${percent}%`
            : phase === 'extracting'
              ? 'Extracting models…'
              : 'Downloading speaker models…';
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {label}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="size-3.5" />
          Download speaker analysis (~{totalSizeMB}MB)
        </Button>
        {downloadError && (
          <span className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="size-3" />
            {downloadError}
          </span>
        )}
      </div>
    );
  }

  if (diarizationState === 'available') {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={2}
          max={20}
          value={numSpeakersInput}
          onChange={(e) => setNumSpeakersInput(e.target.value)}
          placeholder="Speakers (required)"
          aria-label="Number of speakers (required, 2–20)"
          className="h-8 w-36 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!canAnalyze}
          onClick={() => {
            if (numSpeakers !== undefined) onAnalyze(numSpeakers);
          }}
        >
          <Users className="size-3.5" />
          Analyze speakers
        </Button>
      </div>
    );
  }

  if (diarizationState === 'processing') {
    if (retranscribeProgress) {
      const elapsed = retranscribeProgress.elapsedMs > 0 ? ` — ${formatElapsed(retranscribeProgress.elapsedMs)}` : '';
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {`Re-transcribing segments… (${retranscribeProgress.current}/${retranscribeProgress.total})${elapsed}`}
        </div>
      );
    }
    const elapsed = elapsedMs > 0 ? ` (${formatElapsed(elapsedMs)})` : '';
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {`Analyzing speakers…${elapsed}`}
      </div>
    );
  }

  if (diarizationState === 'error') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="size-3" />
          Analysis failed
        </span>
        <Input
          type="number"
          min={2}
          max={20}
          value={numSpeakersInput}
          onChange={(e) => setNumSpeakersInput(e.target.value)}
          placeholder="Speakers (required)"
          aria-label="Number of speakers (required, 2–20)"
          className="h-8 w-36 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!canAnalyze}
          onClick={() => {
            if (numSpeakers !== undefined) onAnalyze(numSpeakers);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return null;
}
