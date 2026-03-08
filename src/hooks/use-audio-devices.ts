import { useState, useEffect, useCallback } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

/**
 * Enumerates available audio input devices via the Web MediaDevices API.
 * Re-enumerates when devices change (plug/unplug).
 */
export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);

  const enumerate = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = all
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
        }));
      setDevices(audioInputs);
    } catch (err) {
      console.warn('[use-audio-devices] enumerateDevices failed:', err);
    }
  }, []);

  useEffect(() => {
    enumerate();
    navigator.mediaDevices.addEventListener('devicechange', enumerate);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate);
  }, [enumerate]);

  return devices;
}
