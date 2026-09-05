import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/store/AppProvider';
import {
  fetchRepository,
  installPlugin,
  type InstalledPlugin,
} from '@/plugins/registry';
import { clearPluginCache } from '@/plugins/useSources';
import type { SourceMeta } from '@/types';

type RepoStatus = 'idle' | 'loading' | 'ready' | 'error';

export function SourcesPage() {
  const { plugins, setPlugins } = useApp();
  const [status, setStatus] = useState<RepoStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<SourceMeta[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'installed' | 'enabled'
  >('all');

  const syncRepo = async () => {
    setStatus('loading');
    setError(null);
    try {
      const url = plugins.repos[0]?.url;
      if (!url) throw new Error('No repository configured.');
      const { sources } = await fetchRepository(url);
      setCatalogue(sources);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(
        err instanceof Error ? err.message : 'Could not sync the repository.'
      );
    }
  };

  // Auto-sync once on mount if we have a repo but no catalogue yet.
  useEffect(() => {
    if (status === 'idle' && plugins.repos.length > 0) void syncRepo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (meta: SourceMeta) => {
    setBusyId(meta.id);
    try {
      if (plugins.installed[meta.id]) {
        // Installed → toggle enabled.
        const enabled = plugins.enabled.includes(meta.id)
          ? plugins.enabled.filter((id) => id !== meta.id)
          : [...plugins.enabled, meta.id];
        setPlugins({ ...plugins, enabled });
      } else {
        // Not installed → download and install, then enable.
        const installed: InstalledPlugin = await installPlugin(meta);
        const nextInstalled = { ...plugins.installed, [meta.id]: installed };
        setPlugins({
          ...plugins,
          installed: nextInstalled,
          enabled: [...plugins.enabled, meta.id],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed.');
    } finally {
      setBusyId(null);
    }
  };

  const uninstall = (id: string) => {
    const nextInstalled = { ...plugins.installed };
    delete nextInstalled[id];
    setPlugins({
      ...plugins,
      installed: nextInstalled,
      enabled: plugins.enabled.filter((e) => e !== id),
    });
    clearPluginCache();
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = catalogue;
    if (langFilter !== 'all')
      filtered = filtered.filter((s) => s.lang.trim() === langFilter);
    if (statusFilter === 'installed')
      filtered = filtered.filter((s) => plugins.installed[s.id]);
    if (statusFilter === 'enabled')
      filtered = filtered.filter((s) => plugins.enabled.includes(s.id));
    if (q) {
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.site.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
      );
    }

    const byLang = new Map<string, SourceMeta[]>();
    for (const s of filtered) {
      const lang = s.lang.trim() || 'Other';
      if (!byLang.has(lang)) byLang.set(lang, []);
      byLang.get(lang)!.push(s);
    }
    return Array.from(byLang.entries());
  }, [
    catalogue,
    query,
    langFilter,
    statusFilter,
    plugins.installed,
    plugins.enabled,
  ]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const s of catalogue) set.add(s.lang.trim() || 'Other');
    return Array.from(set).sort();
  }, [catalogue]);

  const installedCount = Object.keys(plugins.installed).length;
  const enabledCount = plugins.enabled.length;

  return (
    <div className="sources">
      <h1 className="sources-title">Sources</h1>
      <p className="sources-sub">
        Sources are the libraries your collection is drawn from. Install one to
        search its shelves, then enable it to keep it live. Everything is
        managed locally; the reading room never phones home on its own.
      </p>

      <div className="repo-bar">
        <span className="repo-name">LNReader Built-in</span>
        <span className="repo-url">github.com/LNReader/lnreader-plugins</span>
        <div className="repo-actions">
          <span className="repo-stat">
            {enabledCount} enabled · {installedCount} installed
          </span>
          <button
            className="btn btn-ghost"
            onClick={syncRepo}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {status === 'error' && error && (
        <div className="sources-error">
          <p>{error}</p>
          <button className="btn btn-ghost" onClick={syncRepo}>
            Retry
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="sources-loading">Syncing the repository…</div>
      )}

      {status === 'ready' && (
        <>
          <div className="store-filterbar">
            <input
              type="search"
              className="search-input store-search"
              placeholder="Filter sources by name or site…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter sources"
            />
            <select
              className="select store-lang"
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              aria-label="Filter by language"
            >
              <option value="all">All languages</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <div
              className="store-status-tabs"
              role="group"
              aria-label="Filter by status"
            >
              {(
                [
                  ['all', 'All'],
                  ['installed', 'Installed'],
                  ['enabled', 'Enabled'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`store-tab ${statusFilter === key ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="sources-meta-count">
            {groups.reduce((n, [, items]) => n + items.length, 0)} of{' '}
            {catalogue.length} sources
          </p>
          {groups.length === 0 && (
            <div className="sources-error">
              <p>No sources match the current filters.</p>
            </div>
          )}
          {groups.map(([lang, items]) => (
            <section key={lang} className="source-lang-group">
              <h2 className="source-lang-title">{lang}</h2>
              <div className="source-list">
                {items.map((meta) => (
                  <SourceRow
                    key={meta.id}
                    meta={meta}
                    installed={Boolean(plugins.installed[meta.id])}
                    enabled={plugins.enabled.includes(meta.id)}
                    busy={busyId === meta.id}
                    onToggle={() => toggle(meta)}
                    onUninstall={() => uninstall(meta.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function SourceRow({
  meta,
  installed,
  enabled,
  busy,
  onToggle,
  onUninstall,
}: {
  meta: SourceMeta;
  installed: boolean;
  enabled: boolean;
  busy: boolean;
  onToggle(): void;
  onUninstall(): void;
}) {
  return (
    <div className="source-row">
      <div className="source-icon">
        {meta.iconUrl ? (
          <img src={meta.iconUrl} alt="" loading="lazy" />
        ) : (
          meta.name.slice(0, 1)
        )}
      </div>
      <div className="source-info">
        <span className="source-name">{meta.name}</span>
        <span className="source-site">{meta.site}</span>
        <div className="source-badges">
          <span className="badge">v{meta.version}</span>
          {installed && (
            <span className="badge installed-badge">installed</span>
          )}
        </div>
      </div>
      <div className="source-toggle">
        {installed ? (
          <>
            <button
              className="switch"
              role="switch"
              aria-checked={enabled}
              aria-label={`Enable ${meta.name}`}
              onClick={onToggle}
              disabled={busy}
            />
            <button
              className="btn btn-quiet uninstall-btn"
              onClick={onUninstall}
              aria-label={`Uninstall ${meta.name}`}
              title="Uninstall"
            >
              Remove
            </button>
          </>
        ) : (
          <button className="btn btn-quiet" onClick={onToggle} disabled={busy}>
            {busy ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>
    </div>
  );
}
