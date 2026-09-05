import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/store/AppProvider';
import { useSources } from '@/plugins/useSources';
import { novelRoute } from '@/util/id';
import CoverImage from '@/components/CoverImage';
import { SourcesIcon } from '@/components/icons';
import { CheckboxIcon } from '@/components/icons';
import type { SourceNovelItem } from '@/types';

interface Result {
  sourceId: string;
  sourceName: string;
  novel: SourceNovelItem;
}

export function SearchPage() {
  const { plugins } = useApp();
  const { getSource } = useSources();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [allResults, setAllResults] = useState<Result[] | null>(null);
  const seq = useRef(0);

  const enabledIds = plugins.enabled;
  const sources = enabledIds
    .map((id) => ({ id, plugin: getSource(id) }))
    .filter((s) => s.plugin);

  const activeIds =
    selected === null ? new Set(sources.map((s) => s.id)) : selected;

  const toggleSource = (id: string) => {
    setSelected((prev) => {
      const base = new Set(prev === null ? sources.map((s) => s.id) : prev);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });
  };

  // Displayed results derive from the last full search, filtered by the
  // currently active sources. Toggling a source filters instantly without
  // re-querying the sources.
  const visibleResults = useMemo(() => {
    if (allResults === null) return null;
    return allResults.filter((r) => activeIds.has(r.sourceId));
  }, [allResults, activeIds]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of allResults ?? []) {
      map.set(r.sourceId, (map.get(r.sourceId) ?? 0) + 1);
    }
    return map;
  }, [allResults]);

  const runSearch = async (q: string) => {
    const trim = q.trim();
    if (!trim) {
      setAllResults(null);
      setDone(false);
      setSearching(false);
      setError(null);
      return;
    }
    const srcs = sources.filter((s) => activeIds.has(s.id));
    if (srcs.length === 0) {
      setAllResults([]);
      setDone(true);
      setSearching(false);
      setError(null);
      return;
    }
    const mySeq = ++seq.current;
    setSearching(true);
    setDone(false);
    setError(null);
    try {
      const perSource = await Promise.allSettled(
        srcs.map(async ({ id, plugin }) => {
          const list = await plugin!.searchNovels(trim, 1);
          return (list ?? []).map((novel): Result => ({
            sourceId: id,
            sourceName: plugin!.name,
            novel,
          }));
        })
      );
      if (seq.current !== mySeq) return;
      const merged: Result[] = [];
      for (const r of perSource) {
        if (r.status === 'fulfilled') merged.push(...r.value);
      }
      setAllResults(merged);
      setAllResults(merged);
      setDone(true);
    } catch (err) {
      if (seq.current !== mySeq) return;
      setError(err instanceof Error ? err.message : 'Search failed.');
      setDone(true);
    } finally {
      if (seq.current === mySeq) setSearching(false);
    }
  };

  const handleChange = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setAllResults(null);
      setDone(false);
      setSearching(false);
      setError(null);
    }
  };

  return (
    <div className="library search-page">
      <header className="library-head">
        <h1 className="library-title">Search</h1>
        <span className="library-count">
          {enabledIds.length} sources active
        </span>
      </header>

      {sources.length === 0 ? (
        <div className="empty-library">
          <h1 className="empty-title">No active sources</h1>
          <p className="empty-body">
            Install and enable a source to begin searching shelves for new books
            to add to your library.
          </p>
          <Link to="/sources" className="btn btn-primary">
            <SourcesIcon size={16} />
            Manage sources
          </Link>
        </div>
      ) : (
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
        >
          <input
            type="search"
            className="search-input"
            placeholder={`Search ${sources.length} source${sources.length === 1 ? '' : 's'}…`}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            aria-label="Search novels"
            autoFocus
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={searching}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
      )}

      {sources.length > 0 && (
        <div
          className="search-filterbar"
          role="group"
          aria-label="Filter sources"
        >
          <span className="search-sources-label">Sources</span>
          <div className="filterbar-toggles">
            {sources.map((s) => {
              const on = activeIds.has(s.id);
              const n = counts.get(s.id) ?? 0;
              return (
                <button
                  key={s.id}
                  className={`filter-toggle ${on ? 'is-on' : ''}`}
                  onClick={() => toggleSource(s.id)}
                  aria-pressed={on}
                  title={`${on ? 'Exclude' : 'Include'} ${s.plugin!.name}`}
                >
                  <CheckboxIcon size={14} filled={on} />
                  <span className="filter-toggle-name">{s.plugin!.name}</span>
                  {allResults && (
                    <span className="filter-toggle-count">{n}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {searching && (
        <div className="sources-loading">Searching the shelves…</div>
      )}

      {error && <div className="sources-error">{error}</div>}

      {done && !searching && allResults !== null && (
        <div className="search-meta">
          {visibleResults?.length ?? 0} result
          {(visibleResults?.length ?? 0) === 1 ? '' : 's'}
        </div>
      )}

      {done &&
        !searching &&
        allResults !== null &&
        visibleResults?.length === 0 && (
          <div className="empty-search">
            <p>Nothing found for “{query.trim()}”.</p>
            <p className="hint">Try a shorter query, or enable more sources.</p>
          </div>
        )}

      {visibleResults !== null && (
        <div className="search-results">
          {visibleResults.map((r, i) => (
            <SearchResultRow
              key={`${r.sourceId}-${r.novel.path}-${i}`}
              result={r}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ result }: { result: Result }) {
  const { novel, sourceId, sourceName } = result;
  return (
    <Link to={novelRoute(sourceId, novel.path)} className="search-row">
      <div className="search-cover">
        <CoverImage
          src={novel.cover}
          name={novel.name}
          imgClassName="search-cover-img"
          fallbackClassName="search-cover-fallback"
        />
      </div>
      <div className="search-info">
        <span className="search-title">{novel.name}</span>
        <span className="search-source">{sourceName}</span>
      </div>
    </Link>
  );
}
