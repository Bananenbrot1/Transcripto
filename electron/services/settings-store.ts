import Store from 'electron-store';
import type { StoreSchema } from '../../shared/types.js';
import { STORE_DEFAULTS } from '../../shared/store-defaults.js';

const store = new Store<StoreSchema>({
  name: 'settings',
  defaults: STORE_DEFAULTS,
});

export function get<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
  return store.get(key);
}

export function set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
  store.set(key, value);
}

export function getAll(): StoreSchema {
  return store.store;
}
