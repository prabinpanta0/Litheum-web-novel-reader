import {
  getLibrary,
  getHistory,
  getBookmarks,
  getPluginSettings,
} from '@/store/db';

export interface LitheumBackup {
  app: 'litheum';
  version: 1;
  exportedAt: number;
  library: Awaited<ReturnType<typeof getLibrary>>;
  history: Awaited<ReturnType<typeof getHistory>>;
  bookmarks: Awaited<ReturnType<typeof getBookmarks>>;
  plugins: Awaited<ReturnType<typeof getPluginSettings>>;
}

/** Collect every piece of on-device reading state into a single object. */
export async function exportBackup(): Promise<LitheumBackup> {
  const [library, history, bookmarks, plugins] = await Promise.all([
    getLibrary(),
    getHistory(),
    getBookmarks(),
    getPluginSettings(),
  ]);
  return {
    app: 'litheum',
    version: 1,
    exportedAt: Date.now(),
    library,
    history,
    bookmarks,
    plugins,
  };
}

export function downloadBackup(backup: LitheumBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `litheum-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
