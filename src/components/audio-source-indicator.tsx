import { useEffect, useState } from 'react';
import { Mic, MicOff, Monitor, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SystemAudioStatus } from '@/hooks/use-audio-capture';

interface AudioSourceIndicatorProps {
  micRMS: number;
  systemRMS: number;
  isCapturing: boolean;
  systemAudioStatus: SystemAudioStatus;
  isMicMuted: boolean;
}

function LevelBar({ level, max = 0.3 }: { level: number; max?: number }) {
  const percent = Math.min(100, (level / max) * 100);
  return (
    <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
      <div
        className="bg-primary h-full rounded-full transition-all duration-75"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function PermissionBanner() {
  const [appName, setAppName] = useState<string>('');

  useEffect(() => {
    window.electronAPI.getAppInfo().then((info) => {
      setAppName(info.appName);
    });
  }, []);

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-medium text-amber-800">
            System audio permission required
          </p>
          <p className="text-amber-700">
            To capture audio from other apps (Zoom, Teams, etc.), add{' '}
            <span className="font-mono font-medium">
              {appName || 'Electron'}
            </span>{' '}
            to <span className="font-medium">System Audio Recording</span> in
            Privacy & Security settings, then restart the app.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.electronAPI.openScreenPermissionSettings()}
      >
        <ExternalLink className="size-3" />
        Open Privacy Settings
      </Button>
    </div>
  );
}

export function AudioSourceIndicator({
  micRMS,
  systemRMS,
  isCapturing,
  systemAudioStatus,
  isMicMuted,
}: AudioSourceIndicatorProps) {
  if (!isCapturing) return null;

  const MicIcon = isMicMuted ? MicOff : Mic;

  return (
    <div className="space-y-3">
      <div className="flex gap-6 items-center">
        <div className="flex items-center gap-2 flex-1">
          <MicIcon className={`size-4 shrink-0 ${isMicMuted ? 'text-red-500' : 'text-muted-foreground'}`} />
          <LevelBar level={isMicMuted ? 0 : micRMS} />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Monitor className="size-4 text-muted-foreground shrink-0" />
          <LevelBar level={systemRMS} />
        </div>
      </div>

      {(systemAudioStatus === 'no-permission' || systemAudioStatus === 'failed') && (
        <PermissionBanner />
      )}
    </div>
  );
}
