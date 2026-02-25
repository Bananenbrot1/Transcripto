import { useState, useEffect, useCallback } from 'react';
import { Loader2, Users, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DiarizationState } from '@/hooks/use-transcription';
import type { DiarizationDownloadProgress } from '@/types/electron-api';

interface DiarizationControlsProps {
  diarizationState: DiarizationState;
  onAnalyze: (numSpeakers?: number) => void;
  elapsedMs?: number;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec} s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} m ${s} s`;
}

export function DiarizationControls({ diarizationState, onAnalyze, elapsedMs = 0 }: DiarizationControlsProps) {
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

  const parsedNumSpeakers = (): number | undefined => {
    const n = parseInt(numSpeakersInput, 10);
    return n >= 1 ? n : undefined;
  };

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setDownloadError(null);
    setDownloadProgress(null);

    const unsubscribe = window.electronAPI.onDiarizationDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });

    try {
      await window.electronAPI.downloadDiarizationModels();
      // Models downloaded — now check status to transition to 'available'
      const status = await window.electronAPI.checkDiarizationModels();
      if (status.segmentation && status.embedding) {
        onAnalyze(); // auto-trigger analysis after download
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      unsubscribe();
      setDownloading(false);
      setDownloadProgress(null);
    }
  }, [onAnalyze]);

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
          min={1}
          max={20}
          value={numSpeakersInput}
          onChange={(e) => setNumSpeakersInput(e.target.value)}
          placeholder="# speakers"
          className="h-8 w-28 text-sm"
        />
        <Button variant="outline" size="sm" onClick={() => onAnalyze(parsedNumSpeakers())}>
          <Users className="size-3.5" />
          Analyze speakers
        </Button>
      </div>
    );
  }

  if (diarizationState === 'processing') {
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
          min={1}
          max={20}
          value={numSpeakersInput}
          onChange={(e) => setNumSpeakersInput(e.target.value)}
          placeholder="# speakers"
          className="h-8 w-28 text-sm"
        />
        <Button variant="outline" size="sm" onClick={() => onAnalyze(parsedNumSpeakers())}>
          Retry
        </Button>
      </div>
    );
  }

  return null;
}
