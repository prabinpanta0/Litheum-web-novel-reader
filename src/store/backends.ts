import { createStore, get, set, del, keys, type UseStore } from 'idb-keyval';
import { getBrowserCaches } from './caches';

/**
 * Pluggable local storage backends.
 *
 * Local-first is the core design: nothing is required to leave the device.
 * Two backends are offered on the Settings page:
 *
 *  - `indexeddb` (default) — the browser's IndexedDB; reliable, clears only
 *    if the user wipes site data.
 *  - `opfs`       (device) — the Origin Private File System; a real local
 *    file-backed store on the device that survives normal browsing.
 *
 * `initBackend` is called once at app startup (before any reads) using the
 * user's stored preference; the store functions in `db.ts` delegate here.
 */

export type StorageBackend = 'indexeddb' | 'opfs';

export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

function makeIndexedDB(): StorageAdapter {
  const store: UseStore = createStore('litheum', 'litheum-store');
  return {
    get: (k) => get(k, store),
    set: (k, v) => set(k, v, store),
    delete: (k) => del(k, store),
    keys: () => keys(store),
  };
}

async function makeOPFS(): Promise<StorageAdapter> {
  const dir = await getBrowserCaches('litheum');
  const handleDir = dir as unknown as {
    getFileHandle(
      name: string,
      opts?: { create?: boolean }
    ): Promise<{
      getFile(): Promise<{ text(): Promise<string> }>;
      createWritable(): Promise<{
        write(s: string): Promise<void>;
        close(): Promise<void>;
      }>;
    }>;
    removeEntry(name: string): Promise<void>;
    entries(): AsyncIterableIterator<[string, unknown]>;
  };
  return {
    async get<T>(key: string): Promise<T | undefined> {
      try {
        const handle = await handleDir.getFileHandle(key);
        const f = await handle.getFile();
        const text = await f.text();
        return text ? (JSON.parse(text) as T) : undefined;
      } catch {
        return undefined;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      const handle = await handleDir.getFileHandle(key, { create: true });
      const w = await handle.createWritable();
      await w.write(JSON.stringify(value));
      await w.close();
    },
    async delete(key: string): Promise<void> {
      try {
        await handleDir.removeEntry(key);
      } catch {
        /* no-op */
      }
    },
    async keys(): Promise<string[]> {
      const out: string[] = [];
      for await (const [name] of handleDir.entries()) out.push(name);
      return out;
    },
  };
}

let active: StorageAdapter = makeIndexedDB();
let activeBackend: StorageBackend = 'indexeddb';

export async function initBackend(backend: StorageBackend): Promise<void> {
  activeBackend = backend;
  active = backend === 'indexeddb' ? makeIndexedDB() : await makeOPFS();
}

export function getBackend(): StorageBackend {
  return activeBackend;
}

/** The active adapter; used internally by the store functions in `db.ts`. */
export const adapter: () => StorageAdapter = () => active;
