import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Mic, Monitor, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepWrapper } from '../step-wrapper';

type SystemAudioState = 'idle' | 'waiting' | 'granted';

interface PermissionsStepProps {
  direction: number;
  onNext: () => void;
  onBack: () => void;
}

export function PermissionsStep({ direction, onNext, onBack }: PermissionsStepProps) {
  const [micGranted, setMicGranted] = useState(false);
  const [systemAudioState, setSystemAudioState] = useState<SystemAudioState>('idle');

  const checkPermissions = useCallback(async () => {
    try {
      const perms = await window.electronAPI.getMediaPermissions();
      setMicGranted(perms.mic === 'granted');
      if (perms.screen === 'granted') {
        setSystemAudioState('granted');
      }
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
    // Register the app in both macOS TCC permission lists without showing
    // a screen picker. desktopCapturer.getSources triggers kTCCServiceScreenCapture.
    try {
      await window.electronAPI.triggerScreenCaptureRegistration();
    } catch {
      // Registration failed — still open settings; user can add the app manually.
    }
    try {
      await window.electronAPI.openScreenPermissionSettings();
    } catch {
      // fallback
    }
    setSystemAudioState('waiting');
  };

  const screenGranted = systemAudioState === 'granted';

  return (
    <StepWrapper direction={direction}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Permissions</h2>
          <p className="text-muted-foreground">
            Transcripto needs access to your microphone and system audio to transcribe. Everything stays local on your Mac.
          </p>
        </div>

        <div className="space-y-3">
          {/* Mic card */}
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

          {/* System audio card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`rounded-lg border px-4 py-4 transition-colors ${
              screenGranted ? 'border-green-500/30 bg-green-500/5' : 'border-border'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`flex items-center justify-center size-10 rounded-lg shrink-0 ${
                screenGranted ? 'bg-green-500/10' : 'bg-muted'
              }`}>
                <Monitor className={`size-5 ${screenGranted ? 'text-green-500' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">System Audio</p>
                <p className="text-xs text-muted-foreground">
                  Required to capture audio playing on your Mac — we never record your screen.
                </p>
              </div>
              {screenGranted ? (
                <CheckCircle2 className="size-5 text-green-500 shrink-0" />
              ) : systemAudioState === 'waiting' ? (
                <span className="text-xs text-muted-foreground shrink-0">Opened ↗</span>
              ) : (
                <Button size="sm" variant="outline" onClick={openScreenSettings} className="shrink-0">
                  Open Settings
                  <ExternalLink className="size-3" />
                </Button>
              )}
            </div>

            <AnimatePresence>
              {systemAudioState === 'waiting' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 overflow-hidden"
                >
                  <div className="rounded-md bg-muted/50 px-3 py-3 space-y-2">
                    <p className="text-xs font-medium">
                      Transcripto should now appear in both lists — enable the toggle in each:
                    </p>
                    <ol className="text-xs text-muted-foreground space-y-1 list-none">
                      <li className="flex gap-2">
                        <span className="font-medium text-foreground shrink-0">1.</span>
                        <span>Enable under <span className="font-medium text-foreground">"Screen &amp; System Audio Recording"</span></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-medium text-foreground shrink-0">2.</span>
                        <span>Enable under <span className="font-medium text-foreground">"System Audio Recording Only"</span></span>
                      </li>
                    </ol>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="size-2 rounded-full bg-primary animate-pulse shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Waiting for permission… Come back here — we'll detect it automatically.
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
