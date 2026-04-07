import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BannerState = 'hidden' | 'downloading' | 'ready';

export function UpdateBanner() {
  const [state, setState] = useState<BannerState>('hidden');
  const [version, setVersion] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setVersion(info.version);
      setState('downloading');
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setVersion(info.version);
      setState('ready');
    });

    return () => {
      unsubAvailable();
      unsubDownloaded();
    };
  }, []);

  if (dismissed || state === 'hidden') return null;

  return (
    <div className="flex items-center gap-3 bg-primary/10 border-b border-primary/20 px-6 py-2 text-sm shrink-0">
      {state === 'downloading' && (
        <span className="text-foreground flex items-center gap-2">
          <span className="size-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" />
          Downloading Transcripto {version}…
        </span>
      )}
      {state === 'ready' && (
        <>
          <span className="text-foreground">
            Transcripto {version} is ready.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" onClick={() => window.electronAPI.quitAndInstall()}>
              Restart to Update
            </Button>
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss update banner"
            >
              <X className="size-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
