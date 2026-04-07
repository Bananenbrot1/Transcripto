import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Mic, Monitor, CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepWrapper } from '../step-wrapper';

interface PermissionsStepProps {
  direction: number;
  onNext: () => void;
  onBack: () => void;
}

export function PermissionsStep({ direction, onNext, onBack }: PermissionsStepProps) {
  const [micGranted, setMicGranted] = useState(false);
  const [screenGranted, setScreenGranted] = useState(false);

  const checkPermissions = useCallback(async () => {
    try {
      const perms = await window.electronAPI.getMediaPermissions();
      setMicGranted(perms.mic === 'granted');
      setScreenGranted(perms.screen === 'granted');
    } catch {
      // permissions API might not be available in dev
    }
  }, []);

  useEffect(() => {
    checkPermissions();
    const interval = setInterval(checkPermissions, 2000);
    return () => clearInterval(interval);
  }, [checkPermissions]);

  const requestMic = async () => {
    try {
      const granted = await window.electronAPI.requestMicPermission();
      setMicGranted(granted);
    } catch {
      // fallback
    }
  };

  const openScreenSettings = async () => {
    try {
      await window.electronAPI.openScreenPermissionSettings();
    } catch {
      // fallback
    }
  };

  return (
    <StepWrapper direction={direction}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Permissions</h2>
          <p className="text-muted-foreground">
            Transcripto needs access to your microphone and screen audio to transcribe. Everything stays local on your Mac.
          </p>
        </div>

        <div className="space-y-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`flex items-center gap-4 rounded-lg border px-4 py-4 transition-colors ${
              micGranted ? 'border-green-500/30 bg-green-500/5' : 'border-border'
            }`}
          >
            <div className={`flex items-center justify-center size-10 rounded-lg ${
              micGranted ? 'bg-green-500/10' : 'bg-muted'
            }`}>
              <Mic className={`size-5 ${micGranted ? 'text-green-500' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Microphone</p>
              <p className="text-xs text-muted-foreground">Captures your voice for transcription</p>
            </div>
            {micGranted ? (
              <CheckCircle2 className="size-5 text-green-500" />
            ) : (
              <Button size="sm" variant="outline" onClick={requestMic}>
                Grant
              </Button>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`flex items-center gap-4 rounded-lg border px-4 py-4 transition-colors ${
              screenGranted ? 'border-green-500/30 bg-green-500/5' : 'border-border'
            }`}
          >
            <div className={`flex items-center justify-center size-10 rounded-lg ${
              screenGranted ? 'bg-green-500/10' : 'bg-muted'
            }`}>
              <Monitor className={`size-5 ${screenGranted ? 'text-green-500' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Screen Recording</p>
              <p className="text-xs text-muted-foreground">Needed for system audio capture</p>
            </div>
            {screenGranted ? (
              <CheckCircle2 className="size-5 text-green-500" />
            ) : (
              <Button size="sm" variant="outline" onClick={openScreenSettings}>
                Open Settings
                <ExternalLink className="size-3" />
              </Button>
            )}
          </motion.div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          You can also grant these later. Screen recording permission can only be enabled in System Settings.
        </p>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <Button onClick={onNext}>
            Continue
          </Button>
        </div>
      </div>
    </StepWrapper>
  );
}
