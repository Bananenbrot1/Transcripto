import { useEffect, useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Monitor, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SystemAudioStatus } from '@/hooks/use-audio-capture';

interface AudioSourceIndicatorProps {
  micRMS: number;
  systemRMS: number;
  isCapturing: boolean;
  systemAudioStatus: SystemAudioStatus;
  isMicMuted: boolean;
  showPermissionBanner?: boolean;
}

const WAVEFORM_BARS = 24;
const WAVEFORM_MAX = 0.3;

function Waveform({ level, color = 'currentColor' }: { level: number; color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>(new Array(WAVEFORM_BARS).fill(0));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const history = historyRef.current;
    history.push(Math.min(1, level / WAVEFORM_MAX));
    if (history.length > WAVEFORM_BARS) history.shift();

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    const barWidth = w / WAVEFORM_BARS;
    const gap = Math.max(1, barWidth * 0.2);

    ctx.fillStyle = color;
    for (let i = 0; i < history.length; i++) {
      const barHeight = Math.max(2 * dpr, history[i] * h);
      const x = i * barWidth + gap / 2;
      const y = (h - barHeight) / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth - gap, barHeight, 1 * dpr);
      ctx.fill();
    }
  }, [level, color]);

  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-4"
      style={{ display: 'block' }}
    />
  );
}

export function PermissionBanner() {
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
  showPermissionBanner = true,
}: AudioSourceIndicatorProps) {
  if (!isCapturing) return null;

  const MicIcon = isMicMuted ? MicOff : Mic;

  return (
    <div className="flex gap-4 items-center flex-1">
      <div className="flex items-center gap-2 flex-1">
        <MicIcon className={`size-4 shrink-0 ${isMicMuted ? 'text-red-500' : 'text-muted-foreground'}`} />
        <Waveform level={isMicMuted ? 0 : micRMS} color={isMicMuted ? 'oklch(0.637 0.237 25.331)' : 'oklch(0.488 0.243 264.376)'} />
      </div>
      <div className="flex items-center gap-2 flex-1">
        <Monitor className="size-4 text-muted-foreground shrink-0" />
        <Waveform level={systemRMS} color="oklch(0.696 0.17 162.48)" />
      </div>

      {showPermissionBanner && (systemAudioStatus === 'no-permission' || systemAudioStatus === 'failed') && (
        <PermissionBanner />
      )}
    </div>
  );
}
