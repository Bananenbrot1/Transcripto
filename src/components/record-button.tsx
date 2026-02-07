import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RecordingState } from '@/types/transcription';

interface RecordButtonProps {
  recordingState: RecordingState;
  onStart: () => void;
  onStop: () => void;
}

export function RecordButton({ recordingState, onStart, onStop }: RecordButtonProps) {
  if (recordingState === 'stopping') {
    return (
      <Button variant="secondary" disabled>
        <Loader2 className="size-4 animate-spin" />
        Stopping...
      </Button>
    );
  }

  if (recordingState === 'recording') {
    return (
      <Button variant="destructive" onClick={onStop}>
        <Square className="size-4" />
        Stop Recording
      </Button>
    );
  }

  return (
    <Button onClick={onStart}>
      <Mic className="size-4" />
      Start Recording
    </Button>
  );
}
