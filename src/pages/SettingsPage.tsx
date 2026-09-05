import { useEffect, useState } from 'react';
import {
  HardDrive,
  Database,
  Cloud,
  RefreshCw,
  Download,
  Upload,
  BookOpen,
} from 'lucide-react';
import { useApp } from '@/store/AppProvider';
import {
  getStoragePref,
  saveStoragePref,
  type ReaderSettings,
} from '@/store/db';
import { initBackend } from '@/store/backends';
import { exportBackup, downloadBackup } from '@/util/exportImport';
import { ReaderSettingsControls } from '@/components/reader/ReaderSettings';
import {
  signIn,
  signUp,
  signOut,
  syncNow,
  subscribeSync,
  getSession,
} from '@/sync/store';

type Email = string;
type Password = string;

const TABS = [
  { key: 'reading', label: 'Reading', icon: BookOpen },
  { key: 'storage', label: 'Storage', icon: Database },
  { key: 'backup', label: 'Backup', icon: Download },
  { key: 'sync', label: 'Sync', icon: Cloud },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function SettingsPage() {
  const { updateSettings, library, history, bookmarks, plugins } = useApp();
  const [storage, setStorageState] =
    useState<ReaderSettings['storage']>('indexeddb');
  const [prefLoaded, setPrefLoaded] = useState(false);

  const [tab, setTab] = useState<TabKey>('reading');

  const [storageMsg, setStorageMsg] = useState<string | null>(null);
  const [syncEmail, setSyncEmail] = useState<Email>('');
  const [syncPassword, setSyncPassword] = useState<Password>('');
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncedEmail, setSyncedEmail] = useState<string | null>(
    getSession().email
  );

  useEffect(() => {
    return subscribeSync(() => setSyncedEmail(getSession().email));
  }, []);

  useEffect(() => {
    void getStoragePref().then((pref) => {
      setStorageState(pref);
      setPrefLoaded(true);
    });
  }, []);

  const changeStorage = async (pref: ReaderSettings['storage']) => {
    setStorageState(pref);
    await initBackend(pref);
    await saveStoragePref(pref);
    updateSettings({ storage: pref });
    setStorageMsg(
      `Storage switched to ${pref === 'opfs' ? 'device (files)' : 'browser (database)'}.`
    );
  };

  const doExport = async () => {
    const backup = await exportBackup();
    downloadBackup(backup);
  };

  const makePayload = () => ({
    library,
    history,
    bookmarks,
    plugins: { installed: plugins.installed, enabled: plugins.enabled },
    updatedAt: Date.now(),
  });

  const doSync = async (kind: 'register' | 'login') => {
    if (!syncEmail || !syncPassword) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      if (kind === 'register') await signUp(syncEmail, syncPassword);
      else await signIn(syncEmail, syncPassword);
      await syncNow(makePayload());
      setSyncMsg(
        `${kind === 'register' ? 'Account created' : 'Signed in'} and synced as ${syncEmail}.`
      );
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const doSyncNow = async () => {
    setSyncing(true);
    setSyncMsg(null);
    const result = await syncNow(makePayload());
    setSyncMsg(
      result.kind === 'error'
        ? result.message
        : `Synced as ${syncedEmail}. Automatic sync is on.`
    );
    setSyncing(false);
  };

  const doSignOut = () => {
    signOut();
    setSyncMsg(null);
    setSyncEnabled(false);
  };

  return (
    <div className="settings">
      <h1 className="settings-title">Settings</h1>

      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`settings-tab ${tab === t.key ? 'is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      <section className="settings-section" hidden={tab !== 'reading'}>
        <h2 className="settings-heading">
          <BookOpen size={18} /> Reading
        </h2>
        <p className="settings-desc">
          Appearance and layout for the reader. These apply wherever you read
          and are the same controls available inside the reader.
        </p>
        <div className="settings-reader">
          <ReaderSettingsControls />
        </div>
      </section>

      <section className="settings-section" hidden={tab !== 'storage'}>
        <h2 className="settings-heading">
          <Database size={18} /> Storage
        </h2>
        <p className="settings-desc">
          Reading works with no account; everything lives locally. Choose where
          Litheum keeps your library, history and bookmarks.
        </p>
        <div
          className="storage-cards"
          role="radiogroup"
          aria-label="Storage backend"
        >
          <button
            className={`storage-card ${storage === 'indexeddb' ? 'is-selected' : ''}`}
            role="radio"
            aria-checked={storage === 'indexeddb'}
            disabled={!prefLoaded}
            onClick={() => void changeStorage('indexeddb')}
          >
            <Database size={20} />
            <strong>Browser</strong>
            <span>
              IndexedDB in your browser. Cleared only if site data is wiped.
            </span>
          </button>
          <button
            className={`storage-card ${storage === 'opfs' ? 'is-selected' : ''}`}
            role="radio"
            aria-checked={storage === 'opfs'}
            disabled={!prefLoaded}
            onClick={() => void changeStorage('opfs')}
          >
            <HardDrive size={20} />
            <strong>Device files</strong>
            <span>
              Origin Private File System — file-backed on this device, survives
              browsing.
            </span>
          </button>
        </div>
        {storageMsg && <p className="sync-msg">{storageMsg}</p>}
      </section>

      <section className="settings-section" hidden={tab !== 'backup'}>
        <h2 className="settings-heading">
          <Download size={18} /> Data backup
        </h2>
        <p className="settings-desc">
          Take a portable snapshot of your whole reading room as a single JSON
          file. Restore by importing it (available in a future step).
        </p>
        <div className="settings-actions">
          <button className="btn btn-primary" onClick={() => void doExport()}>
            <Download size={16} /> Export backup
          </button>
          <button className="btn btn-ghost" disabled>
            <Upload size={16} /> Import
          </button>
        </div>
      </section>

      <section className="settings-section" hidden={tab !== 'sync'}>
        <h2 className="settings-heading">
          <Cloud size={18} /> Sync <span className="badge badge-new">Neon</span>
        </h2>
        <p className="settings-desc">
          Optional. Create an account or sign in to sync your library across
          devices through Neon Functions + Auth. Syncing is off by default and
          never required.
        </p>
        <div className="sync-box">
          {syncedEmail ? (
            <>
              <p className="settings-desc">
                Synced as <strong>{syncedEmail}</strong>. While signed in,
                changes to your library are pushed automatically and a snapshot
                is pulled on launch. You can also sync manually.
              </p>
              <div className="settings-actions">
                <button
                  className="btn btn-primary"
                  disabled={syncing}
                  onClick={() => void doSyncNow()}
                >
                  <RefreshCw size={16} /> {syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={syncing}
                  onClick={doSignOut}
                >
                  Sign out
                </button>
              </div>
            </>
          ) : !syncEnabled ? (
            <div className="settings-actions">
              <button
                className="btn btn-primary"
                onClick={() => setSyncEnabled(true)}
              >
                <Cloud size={16} /> Enable cloud sync
              </button>
            </div>
          ) : (
            <>
              <p className="settings-desc">
                Sign into your account. Your library is then kept in step
                automatically and follows you across devices.
              </p>
              <div className="field">
                <label htmlFor="sync-email">Email</label>
                <input
                  id="sync-email"
                  className="search-input"
                  type="email"
                  value={syncEmail}
                  onChange={(e) => setSyncEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label htmlFor="sync-password">Password</label>
                <input
                  id="sync-password"
                  className="search-input"
                  type="password"
                  value={syncPassword}
                  onChange={(e) => setSyncPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <div className="settings-actions">
                <button
                  className="btn btn-primary"
                  disabled={syncing || !syncEmail || !syncPassword}
                  onClick={() => void doSync('login')}
                >
                  <RefreshCw size={16} /> {syncing ? 'Syncing…' : 'Sign in'}
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={syncing || !syncEmail || !syncPassword}
                  onClick={() => void doSync('register')}
                >
                  Create account
                </button>
              </div>
            </>
          )}
          {syncMsg && <p className="sync-msg">{syncMsg}</p>}
        </div>
      </section>
    </div>
  );
}
