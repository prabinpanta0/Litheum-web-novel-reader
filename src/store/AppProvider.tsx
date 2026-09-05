import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getLibrary,
  getPluginSettings,
  getReaderSettings,
  getBookmarks,
  getHistory,
  getCachedNovelMeta,
  saveLibrary,
  savePluginSettings,
  saveReaderSettings,
  saveBookmarks,
  pushHistory,
  getStoragePref,
  type PluginSettings,
  type ReaderSettings,
} from './db';
import { initBackend } from './backends';
import type { LibraryNovel, Bookmark, HistoryEntry } from '@/types';

interface AppState {
  loading: boolean;
  plugins: PluginSettings;
  library: LibraryNovel[];
  settings: ReaderSettings;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  setPlugins(settings: PluginSettings): void;
  setLibrary(list: LibraryNovel[]): void;
  removeFromLibrary(sourceId: string, path: string): void;
  updateSettings(patch: Partial<ReaderSettings>): void;
  setBookmarks(list: Bookmark[]): void;
  setHistory(list: HistoryEntry[]): void;
  addHistory(entry: HistoryEntry): void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [plugins, setPluginsState] = useState<PluginSettings>({
    installed: {},
    enabled: [],
    repos: [],
  });
  const [library, setLibraryState] = useState<LibraryNovel[]>([]);
  const [settings, setSettingsState] = useState<ReaderSettings | null>(null);
  const [bookmarks, setBookmarksState] = useState<Bookmark[]>([]);
  const [history, setHistoryState] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    void (async () => {
      // Resolve which storage backend to use and switch to it before any
      // reads, so library/history bookmarks come from the right store.
      const pref = await getStoragePref();
      await initBackend(pref);
      const [p, l, s, b, h] = await Promise.all([
        getPluginSettings(),
        getLibrary(),
        getReaderSettings(),
        getBookmarks(),
        getHistory(),
      ]);
      setPluginsState(p);
      setLibraryState(l);
      setSettingsState(s);
      setBookmarksState(b);
      setHistoryState(h);
      // Older library rows (or rows added before a source returned a cover)
      // may be missing artwork. Backfill what we can from cached novel meta
      // so every shelf shows its cover without a fresh network fetch.
      const backfilled = await Promise.all(
        l.map(async (n) => {
          if (n.cover) return null;
          const meta = await getCachedNovelMeta(`${n.sourceId}:${n.path}`);
          if (!meta?.cover) return null;
          return {
            ...n,
            cover: meta.cover,
            name: n.name || meta.name,
            author: n.author ?? meta.author,
            genres: n.genres ?? meta.genres,
            summary: n.summary ?? meta.summary,
          };
        })
      );
      if (backfilled.some(Boolean)) {
        const next = l.map((n, i) => backfilled[i] ?? n);
        setLibraryState(next);
        void saveLibrary(next);
      }
      setLoading(false);
    })();
  }, []);

  const value = useMemo<AppState>(
    () => ({
      loading,
      plugins,
      library,
      settings: settings ?? ({} as ReaderSettings),
      bookmarks,
      history,
      setPlugins(next) {
        setPluginsState(next);
        void savePluginSettings(next);
      },
      setLibrary(input) {
        const patch = Array.isArray(input) ? input : [input];
        setLibraryState((cur) => {
          const acc = cur.slice();
          for (const novel of patch) {
            const idx = acc.findIndex(
              (n) => n.sourceId === novel.sourceId && n.path === novel.path
            );
            if (idx >= 0) {
              acc[idx] = { ...acc[idx], ...novel };
            } else {
              acc.push(novel);
            }
          }
          void saveLibrary(acc);
          return acc;
        });
      },
      removeFromLibrary(sourceId, path) {
        setLibraryState((cur) => {
          const acc = cur.filter(
            (n) => !(n.sourceId === sourceId && n.path === path)
          );
          void saveLibrary(acc);
          return acc;
        });
      },
      updateSettings(patch) {
        setSettingsState((cur) => {
          const next = Object.assign({}, cur, patch) as ReaderSettings;
          void saveReaderSettings(patch);
          return next;
        });
      },
      setBookmarks(next) {
        setBookmarksState(next);
        void saveBookmarks(next);
      },
      setHistory(next) {
        setHistoryState(next);
      },
      addHistory(entry) {
        void pushHistory(entry).then(setHistoryState);
      },
    }),
    [loading, plugins, library, settings, bookmarks, history]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function useLibrary() {
  return useApp().library;
}

export function useReaderSettings() {
  const { settings } = useApp();
  return settings;
}
