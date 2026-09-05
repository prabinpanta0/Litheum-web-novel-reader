import { adapter } from './backends';

/**
 * Local persistence backed by the active storage backend (IndexedDB by
 * default, OPFS if the user selects device storage on the Settings page).
 * Keeps the whole reading library, plugin installs, progress, bookmarks
 * and history on-device so nothing leaves the machine.
 */

const K = {
  plugins: 'plugins',
  library: 'library',
  settings: 'settings',
  bookmarks: 'bookmarks',
  history: 'history',
};

export async function dbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await adapter().get<T>(key);
  } catch {
    return undefined;
  }
}

export async function dbSet<T>(key: string, value: T): Promise<void> {
  await adapter().set(key, value);
}

export async function dbDelete(key: string): Promise<void> {
  await adapter().delete(key);
}

export async function dbKeys(): Promise<string[]> {
  return adapter().keys();
}

// ---- Plugins -------------------------------------------------------------

import type { InstalledPlugin } from '@/plugins/registry';

export type PluginSettings = {
  installed: Record<string, InstalledPlugin>;
  enabled: string[];
  repos: { id: string; name: string; url: string }[];
};

export const DEFAULT_REPOS = [
  {
    id: 'lnreader',
    name: 'LNReader Built-in',
    url: 'https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json',
  },
];

export async function getPluginSettings(): Promise<PluginSettings> {
  const existing = await dbGet<PluginSettings>(K.plugins);
  // Re-seed the built-in repository if a previous run persisted no repos
  // (or an older shape did). Harmless to run repeatedly.
  const repos = mergeDefaultRepos(existing?.repos ?? []);
  const next: PluginSettings = {
    installed: existing?.installed ?? {},
    enabled: existing?.enabled ?? [],
    repos,
  };
  await dbSet(K.plugins, next);
  return next;
}

function mergeDefaultRepos(
  repos: PluginSettings['repos']
): PluginSettings['repos'] {
  const byId = new Map(repos.map((r) => [r.id, r]));
  for (const def of DEFAULT_REPOS) {
    if (!byId.has(def.id)) {
      byId.set(def.id, def);
      repos = [...repos, def];
    }
  }
  return repos;
}

export async function savePluginSettings(
  settings: PluginSettings
): Promise<void> {
  await dbSet(K.plugins, settings);
}

// ---- Library -------------------------------------------------------------

import type { LibraryNovel } from '@/types';

export async function getLibrary(): Promise<LibraryNovel[]> {
  const list = await dbGet<LibraryNovel[]>(K.library);
  return list ?? [];
}

export async function saveLibrary(list: LibraryNovel[]): Promise<void> {
  await dbSet(K.library, list);
}

async function mutateLibrary(
  fn: (list: LibraryNovel[]) => LibraryNovel[]
): Promise<LibraryNovel[]> {
  const list = await getLibrary();
  const next = fn(list);
  await saveLibrary(next);
  return next;
}

export async function upsertNovel(
  novel: LibraryNovel
): Promise<LibraryNovel[]> {
  return mutateLibrary((list) => {
    const idx = list.findIndex(
      (n) => n.sourceId === novel.sourceId && n.path === novel.path
    );
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...novel };
      return [...list];
    }
    return [...list, novel];
  });
}

export async function removeNovel(
  sourceId: string,
  path: string
): Promise<LibraryNovel[]> {
  return mutateLibrary((list) =>
    list.filter((n) => !(n.sourceId === sourceId && n.path === path))
  );
}

// ---- Settings (reader prefs) --------------------------------------------

export type ReaderFont = 'serif' | 'sans' | 'book' | 'georgia' | 'mono';
export type ReaderTheme = 'paper' | 'sepia' | 'dark' | 'oled' | 'custom';

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  paragraphGap: number;
  theme: ReaderTheme;
  /** Custom palette (only used while theme === 'custom'). */
  customBg?: string;
  customText?: string;
  width: 'narrow' | 'comfortable' | 'wide';
  font: ReaderFont;
  /** Justify the reading column. */
  textAlign: 'left' | 'center' | 'right';
  /** Lock text selection/copying inside the reader. */
  copyText: boolean;
  /** Emphasize the leading letters of each word. */
  bionicReading: boolean;
  autoDownload: number;
  autoDeleteRead: 'immediately' | 'off';
  storage: 'indexeddb' | 'opfs';
  /** Read-aloud speaking rate. */
  ttsRate: number;
  /** Read-aloud pitch. */
  ttsPitch: number;
  /** Read-aloud voice URI, remembered across sessions. */
  ttsVoiceURI?: string;
  /**
   * The on-device voice (F1–F5 / M1–M5 from the Supertonic model) used when
   * `ttsEngine` is `'ai'`.
   */
  ttsAiVoice: string;
  /**
   * Read-aloud engine: the built-in Web Speech voices, or the on-device
   * Supertonic model (download once, then fully local).
   */
  ttsEngine: 'web' | 'ai';
}

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.75,
  paragraphGap: 1.5,
  theme: 'sepia',
  width: 'comfortable',
  font: 'serif',
  textAlign: 'left',
  copyText: true,
  bionicReading: false,
  autoDownload: 5,
  autoDeleteRead: 'off',
  storage: 'indexeddb',
  ttsRate: 1,
  ttsPitch: 1,
  ttsEngine: 'web',
  ttsAiVoice: 'F1',
};

// The active storage backend must be known before we can trust the pluggable
// adapter, so it lives in a fixed, always-usable IndexedDB store of its own.
// NB: preference lives in a separate database (`litheum-prefs`) so its object
// store is always created on first open; sharing `litheum` with the main
// adapter would connect at the existing version and never run the upgrade that
// creates a second store.
import { createStore, get as kGet, set as kSet } from 'idb-keyval';
const prefStore = createStore('litheum-prefs', 'litheum-pref');
export async function getStoragePref(): Promise<'indexeddb' | 'opfs'> {
  try {
    return (
      (await kGet<'indexeddb' | 'opfs'>('storage-backend', prefStore)) ??
      'indexeddb'
    );
  } catch {
    return 'indexeddb';
  }
}
export async function saveStoragePref(
  pref: 'indexeddb' | 'opfs'
): Promise<void> {
  await kSet('storage-backend', pref, prefStore);
}

export async function getReaderSettings(): Promise<ReaderSettings> {
  const stored = await dbGet<Partial<ReaderSettings>>(K.settings);
  return { ...defaultReaderSettings, ...stored };
}

export async function saveReaderSettings(
  patch: Partial<ReaderSettings>
): Promise<ReaderSettings> {
  const next = { ...(await getReaderSettings()), ...patch };
  await dbSet(K.settings, next);
  return next;
}

// ---- Bookmarks & history -------------------------------------------------

import type { Bookmark, HistoryEntry } from '@/types';

export async function getBookmarks(): Promise<Bookmark[]> {
  return (await dbGet<Bookmark[]>(K.bookmarks)) ?? [];
}

export async function saveBookmarks(list: Bookmark[]): Promise<void> {
  await dbSet(K.bookmarks, list);
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return (await dbGet<HistoryEntry[]>(K.history)) ?? [];
}

// The reader flushes progress on every scroll tick, so pushHistory can be
// called many times in the same frame (e.g. scrolling straight into the next
// chapter). Serialize those writes — a naive read-modify-write would interleave
// and silently drop entries, which made history look like it only kept the
// latest read.
let historyChain: Promise<unknown> = Promise.resolve();
function withHistoryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = historyChain.then(fn, fn);
  historyChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Record a reading visit. History is a log of reading activity: latest entry
 * per novel+chapter (updated in place on re-scroll), newest first, capped so
 * it stays cheap. Removing a book from the library never erases this log.
 */
export async function pushHistory(
  entry: HistoryEntry
): Promise<HistoryEntry[]> {
  return withHistoryLock(async () => {
    const list = await getHistory();
    const dup = list.findIndex(
      (e) =>
        e.novelId === entry.novelId && e.chapterIndex === entry.chapterIndex
    );
    const rest = dup >= 0 ? list.filter((_, i) => i !== dup) : list;
    const next = [entry, ...rest].slice(0, 200);
    await dbSet(K.history, next);
    return next;
  });
}

// ---- Chapter content cache ----------------------------------------------

const K_CHAPTER = (novelId: string, index: number) =>
  `chapter:${novelId}:${index}`;
export async function getCachedChapter(
  novelId: string,
  index: number
): Promise<string | undefined> {
  return dbGet<string>(K_CHAPTER(novelId, index));
}

export async function setCachedChapter(
  novelId: string,
  index: number,
  html: string
): Promise<void> {
  await dbSet(K_CHAPTER(novelId, index), html);
}

export async function deleteNovelChapters(novelId: string): Promise<void> {
  const all = await dbKeys();
  const prefix = `chapter:${novelId}:`;
  await Promise.all(
    all.filter((k) => k.startsWith(prefix)).map((k) => dbDelete(k))
  );
}

// ---- Novel metadata cache ------------------------------------------------

import type { SourceNovelDetail } from '@/types';

const K_META = (novelId: string) => `meta:${novelId}`;

/**
 * Cache the fetched novel metadata (name, chapters list, summary) keyed by
 * sourceId:path so returning to a novel—or opening the reader for it—doesn't
 * re-fetch the chapter list from the source every time.
 */
export async function getCachedNovelMeta(
  novelId: string
): Promise<SourceNovelDetail | undefined> {
  return dbGet<SourceNovelDetail>(K_META(novelId));
}

export async function setCachedNovelMeta(
  novelId: string,
  detail: SourceNovelDetail
): Promise<void> {
  await dbSet(K_META(novelId), detail);
}
