import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppProvider';
import { getSession, subscribeSync, pullNow, syncNow } from './store';
import type { SyncPayload } from './client';
import type { Bookmark, HistoryEntry } from '@/types';

const PUSH_DEBOUNCE_MS = 1500;

/**
 * Renders nothing; silently keeps the cloud copy in step with the device.
 *
 * While a user is signed in it:
 *   - pulls the latest snapshot down once on mount and applies it locally, and
 *   - pushes local changes up (debounced) whenever the library / history /
 *     bookmarks / plugins change.
 *
 * Sign-in state lives in `src/sync/store.ts`; both this component and the
 * Settings page subscribe to it, so auto-sync runs from anywhere in the app.
 */
export function SyncManager() {
  const {
    library,
    history,
    bookmarks,
    plugins,
    setLibrary,
    setBookmarks,
    setHistory,
  } = useApp();
  const [signedIn, setSignedIn] = useState(!!getSession().token);
  const appliedPull = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return subscribeSync(() => setSignedIn(!!getSession().token));
  }, []);

  // Auto-pull once on first mount, if signed in.
  useEffect(() => {
    if (!signedIn || appliedPull.current) return;
    appliedPull.current = true;
    void (async () => {
      const remote = await pullNow();
      if (!remote) return;
      if (remote.library) setLibrary(remote.library);
      if (remote.bookmarks) setBookmarks(remote.bookmarks as Bookmark[]);
      if (remote.history) setHistory(remote.history as HistoryEntry[]);
      // Plugin config is device-specific; don't clobber it from the cloud.
    })();
  }, [signedIn, setLibrary, setBookmarks, setHistory]);

  // Debounced auto-push whenever local state changes while signed in.
  useEffect(() => {
    if (!signedIn || !mounted.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const payload: SyncPayload = {
        library,
        history,
        bookmarks,
        plugins: { installed: plugins.installed, enabled: plugins.enabled },
        updatedAt: Date.now(),
      };
      void syncNow(payload);
    }, PUSH_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [signedIn, library, history, bookmarks, plugins]);

  return null;
}
