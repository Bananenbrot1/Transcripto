import { useState, useEffect, useCallback } from 'react';
import type { StoreSchema } from '../../shared/types';
import { STORE_DEFAULTS } from '../../shared/store-defaults';

/**
 * React hook that provides a useState-like API backed by electron-store.
 * Returns [value, update, loaded] where loaded is true once the async
 * IPC round-trip to read the initial value has completed.
 */
export function useStoreValue<K extends keyof StoreSchema>(key: K) {
  const [value, setValue] = useState<StoreSchema[K]>(STORE_DEFAULTS[key]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.storeGet(key).then((v) => {
      if (!cancelled) {
        setValue(v);
        setLoaded(true);
      }
    }).catch(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [key]);

  const update = useCallback((newValue: StoreSchema[K]) => {
    setValue(newValue);
    window.electronAPI.storeSet(key, newValue);
  }, [key]);

  return [value, update, loaded] as const;
}
