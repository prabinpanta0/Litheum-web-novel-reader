import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowUpDown } from 'lucide-react';
import { useApp } from '@/store/AppProvider';
import { novelRoute, readerRoute } from '@/util/id';
import CoverImage from '@/components/CoverImage';
import { HistoryIcon } from '@/components/icons';
import type { HistoryEntry } from '@/types';

/**
 * History — the running log of reading activity, independent of the library.
 * Reading never adds a book to the library, and removing a book from the
 * library never erases this history. It keeps the latest entry per chapter,
 * newest first.
 */
export function HistoryPage() {
  const { history } = useApp();
  const [query, setQuery] = useState('');
  const [time, setTime] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [status, setStatus] = useState<'all' | 'progress' | 'finished'>(
    'progress'
  );
  const [sort, setSort] = useState<'newest' | 'az' | 'novel'>('newest');

  const cutoff = cutoffs[time];
  const filtered = history.filter((e) => {
    if (cutoff != null && e.at < cutoff) return false;
    if (status === 'finished' && !isFinished(e)) return false;
    if (status === 'progress' && isFinished(e)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      e.novelName.toLowerCase().includes(q) ||
      (e.chapterTitle ?? '').toLowerCase().includes(q)
    );
  });

  // Newest → an explicit narrative order. A–Z → alphabetical. Novel → one
  // card per book (latest activity), sorted by name.
  const grouped = sort === 'novel' ? groupByNovel(filtered) : null;
  const ordered =
    sort === 'az'
      ? [...filtered].sort((a, b) => a.novelName.localeCompare(b.novelName))
      : filtered;

  if (history.length === 0) {
    return (
      <div className="library">
        <div className="empty-library">
          <h1 className="empty-title">No reading history yet</h1>
          <p className="empty-body">
            Open any novel and start reading — every chapter you read is kept
            here so you can always jump back in, even if the book isn't on a
            shelf.
          </p>
          <div className="empty-actions">
            <Link to="/search" className="btn btn-primary">
              Search for novels
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="library">
      <header className="library-head">
        <h1 className="library-title">
          <HistoryIcon size={20} /> History
        </h1>
        <span className="library-count">
          {ordered.length}{' '}
          {ordered.length === 1 ? 'read entry' : 'read entries'}
        </span>
        <div className="head-sort-search">
          <div className="page-search">
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your history…"
              aria-label="Search history"
            />
          </div>
        </div>
      </header>

      <div className="history-filters">
        <div
          className="tag-row history-time-row"
          role="tablist"
          aria-label="Filter by date"
        >
          {timeOptions.map((o) => (
            <button
              key={o.key}
              role="tab"
              aria-selected={time === o.key}
              className={`tag ${time === o.key ? 'is-active' : ''}`}
              onClick={() => setTime(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div
          className="tag-row history-status-row"
          role="tablist"
          aria-label="Filter by progress"
        >
          {statusOptions.map((o) => (
            <button
              key={o.key}
              role="tab"
              aria-selected={status === o.key}
              className={`tag ${status === o.key ? 'is-active' : ''}`}
              onClick={() => setStatus(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="sort-row" aria-label="Sort history">
          <ArrowUpDown size={14} className="sort-icon" />
          <div className="tag-row" role="tablist" aria-label="Sort order">
            {sortOptions.map((o) => (
              <button
                key={o.key}
                role="tab"
                aria-selected={sort === o.key}
                className={`tag ${sort === o.key ? 'is-active' : ''}`}
                onClick={() => setSort(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {ordered.length === 0 ? (
        <p className="shelf-empty">Nothing in history matches.</p>
      ) : sort === 'novel' ? (
        <NovelGrouped entries={grouped!} />
      ) : (
        <DayGrouped entries={ordered} />
      )}
    </div>
  );
}

const cutoffs: Record<'today' | '7d' | '30d' | 'all', number | null> = {
  today: startOfToday(),
  '7d': Date.now() - 7 * 86_400_000,
  '30d': Date.now() - 30 * 86_400_000,
  all: null,
};

const timeOptions: { key: 'today' | '7d' | '30d' | 'all'; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
];

const statusOptions: { key: 'all' | 'progress' | 'finished'; label: string }[] =
  [
    { key: 'all', label: 'All' },
    { key: 'progress', label: 'In progress' },
    { key: 'finished', label: 'Finished' },
  ];

const sortOptions: { key: 'newest' | 'az' | 'novel'; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'az', label: 'A–Z' },
  { key: 'novel', label: 'By novel' },
];

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Collapse history into one latest-entry card per novel, alphabetized. */
function groupByNovel(entries: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  // Input is newest-first, so the first entry seen per novel is its latest.
  for (const e of entries) {
    if (seen.has(e.novelId)) continue;
    seen.add(e.novelId);
    out.push(e);
  }
  return out.sort((a, b) => a.novelName.localeCompare(b.novelName));
}

function NovelGrouped({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="history-days">
      <ul className="history-grid">
        {entries.map((entry) => (
          <HistoryCard key={`${entry.novelId}`} entry={entry} showChapter />
        ))}
      </ul>
    </div>
  );
}

function isFinished(entry: HistoryEntry): boolean {
  if (entry.totalChapters == null || entry.totalChapters <= 0) return false;
  return (entry.readChapters ?? []).includes(entry.totalChapters - 1);
}

function DayGrouped({ entries }: { entries: HistoryEntry[] }) {
  const groups: { label: string; entries: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const label = dayLabel(e.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(e);
    else groups.push({ label, entries: [e] });
  }
  return (
    <div className="history-days">
      {groups.map((g) => (
        <section key={g.label} className="history-day">
          <h2 className="eyebrow history-day-label">{g.label}</h2>
          <ul className="history-grid">
            {g.entries.map((entry, i) => (
              <HistoryCard
                key={`${entry.novelId}:${entry.chapterIndex}:${i}`}
                entry={entry}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function dayLabel(at: number): string {
  const d = new Date(at);
  const startOf = () => {
    const x = new Date();
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const dayMs = 86_400_000;
  const diff =
    startOf() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (diff <= 0) return 'Today';
  if (diff === dayMs) return 'Yesterday';
  const days = Math.round(diff / dayMs);
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function HistoryCard({
  entry,
  showChapter = false,
}: {
  entry: HistoryEntry;
  showChapter?: boolean;
}) {
  const chapterLabel =
    entry.chapterTitle?.trim() || `Chapter ${entry.chapterIndex + 1}`;
  const linkable = Boolean(entry.sourceId && entry.novelPath);
  const readerHref = linkable
    ? readerRoute(entry.sourceId, entry.novelPath, entry.chapterIndex)
    : undefined;
  const novelHref = linkable
    ? novelRoute(entry.sourceId, entry.novelPath)
    : undefined;

  const main = (
    <>
      <span className="cover-mini">
        <CoverImage
          src={entry.cover}
          name={entry.novelName}
          fallbackClassName="mini-fallback"
        />
      </span>
      <span className="history-meta">
        <span className="history-novel" title={entry.novelName}>
          {entry.novelName}
        </span>
        {showChapter && (
          <span className="history-chapter" title={chapterLabel}>
            {chapterLabel}
          </span>
        )}
        <span className="history-when">
          {entry.at ? timeAgo(entry.at) : ''}
        </span>
      </span>
    </>
  );

  return (
    <li className="history-card">
      {readerHref ? (
        <Link to={readerHref} className="history-card-main">
          {main}
        </Link>
      ) : (
        <span className="history-card-main">{main}</span>
      )}
      <div className="history-card-foot">
        {typeof entry.progress === 'number' && entry.progress > 0 ? (
          <span
            className="history-progress"
            aria-label={`${entry.progress}% read`}
          >
            <span
              className="history-progress-fill"
              style={{ width: `${Math.min(100, entry.progress)}%` }}
            />
          </span>
        ) : (
          <span className="history-progress history-progress-empty" />
        )}
        {readerHref ? (
          <Link
            to={readerHref}
            className="history-resume"
            aria-label={`Continue ${entry.novelName}`}
          >
            Continue
          </Link>
        ) : null}
        {novelHref ? (
          <Link
            to={novelHref}
            className="history-resume history-resume-quiet"
            aria-label={`Open ${entry.novelName}`}
          >
            Details
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function timeAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return abbrevDate(at);
}

function abbrevDate(at: number): string {
  const d = new Date(at);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
