import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Trash2, Check, Search } from 'lucide-react';
import { useApp } from '@/store/AppProvider';
import { novelRoute, readerRoute } from '@/util/id';
import { ReaderStats } from '@/components/reader/ReaderStats';
import CoverImage from '@/components/CoverImage';
import type { LibraryNovel } from '@/types';
import {
  SHELVES,
  shelfOf,
  shelfLabel,
  withShelf,
  type ShelfKey,
} from '@/util/shelves';

const FILTERS: {
  key: string;
  label: string;
  match: (n: LibraryNovel) => boolean;
}[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'reading',
    label: 'Reading',
    match: (n) => shelfOf(n.tags) === 'reading',
  },
  {
    key: 'plan',
    label: 'Plan To Read',
    match: (n) => shelfOf(n.tags) === 'plan',
  },
  {
    key: 'completed',
    label: 'Completed',
    match: (n) => shelfOf(n.tags) === 'completed',
  },
  {
    key: 'onhold',
    label: 'On Hold',
    match: (n) => shelfOf(n.tags) === 'onhold',
  },
];

export function LibraryPage() {
  const { library } = useApp();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const filtered = library.filter(active.match).filter(matchesQuery(query));
  // Only books that have actually been started belong under "Continue reading":
  // a Reading-shelf book counts as started once it has a last chapter read or
  // a last-read timestamp, even if its saved in-chapter progress is still 0.
  const readingNow = library
    .filter((n) => shelfOf(n.tags) === 'reading' && isStarted(n))
    .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));

  if (library.length === 0) {
    return (
      <div className="library">
        <div className="empty-library">
          <h1 className="empty-title">Your library is empty</h1>
          <p className="empty-body">
            Add novels to begin building your private collection. Search across
            your sources and bring a book into the reading room.
          </p>
          <div className="empty-actions">
            <Link to="/search" className="btn btn-primary">
              Search for novels
            </Link>
            <Link to="/sources" className="btn btn-ghost">
              Manage sources
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="library">
      <header className="library-head">
        <h1 className="library-title">Library</h1>
        <span className="library-count">
          {library.length} {library.length === 1 ? 'book' : 'books'}
        </span>
      </header>

      <ReaderStats library={library} />

      {readingNow.length > 0 && (
        <section className="now-reading" aria-label="Continue reading">
          <h2 className="eyebrow section-label">Continue reading</h2>
          <div className="continue-row">
            {readingNow.slice(0, 3).map((n) => (
              <ContinueCard key={n.id} novel={n} />
            ))}
          </div>
        </section>
      )}

      <div className="shelf-tools">
        <div className="tag-row" role="tablist" aria-label="Filter library">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              className={`tag ${filter === f.key ? 'is-active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="page-search">
          <Search size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your books…"
            aria-label="Search library"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="shelf-empty">No books match your search.</p>
      ) : (
        <div className="catalogue">
          {filtered.map((novel) => (
            <LibraryBook key={novel.id} novel={novel} />
          ))}
        </div>
      )}
    </div>
  );
}

function matchesQuery(query: string): (n: LibraryNovel) => boolean {
  const q = query.trim().toLowerCase();
  if (!q) return () => true;
  return (n) =>
    n.name.toLowerCase().includes(q) ||
    (n.author ?? '').toLowerCase().includes(q) ||
    (n.genres ?? '').toLowerCase().includes(q);
}

function ContinueCard({ novel }: { novel: LibraryNovel }) {
  const { lastChapterTitle, lastReadAt } = novel;
  const link =
    typeof novel.lastChapterIndex === 'number'
      ? readerRoute(novel.sourceId, novel.path, novel.lastChapterIndex)
      : novelRoute(novel.sourceId, novel.path);
  const when = lastReadAt ? relativeDay(new Date(lastReadAt)) : '';
  return (
    <article className="continue-card">
      <Link to={link} className="continue-card-main">
        <span className="cover-mini">
          <CoverImage
            src={novel.cover}
            name={novel.name}
            fallbackClassName="mini-fallback"
          />
        </span>
        <span className="continue-card-meta">
          <span className="continue-novel">{novel.name}</span>
          <span className="continue-chapter">
            {lastChapterTitle ?? 'Chapter'}
          </span>
        </span>
      </Link>
      <Link to={link} className="continue-cta">
        <span>Resume</span>
        {when && <span className="continue-when">{when}</span>}
      </Link>
    </article>
  );
}

function LibraryBook({ novel }: { novel: LibraryNovel }) {
  const href = novelRoute(novel.sourceId, novel.path);
  return (
    <article className="book">
      <Link to={href} aria-label={novel.name}>
        <div className="book-cover-wrap">
          <CoverImage
            src={novel.cover}
            name={novel.name}
            imgClassName="book-cover"
            fallbackClassName="book-cover-fallback"
          />
          {novel.progress > 0 && (
            <div className="book-progress">
              <span
                style={{
                  width:
                    novel.progress >= 100
                      ? '100%'
                      : `${Math.max(2, novel.progress)}%`,
                }}
              />
            </div>
          )}
        </div>
      </Link>
      <div className="book-info">
        <Link to={href} className="book-title">
          {novel.name}
        </Link>
        {novel.author && <div className="book-author">{novel.author}</div>}
        <div className="book-meta">
          {hasUnread(novel) && <span className="unanread-dot" />}
          <span>{progressLabel(novel)}</span>
        </div>
        <span className="book-shelf-label">
          {shelfLabel(shelfOf(novel.tags))}
        </span>
      </div>
      <BookMenu novel={novel} />
    </article>
  );
}

function BookMenu({ novel }: { novel: LibraryNovel }) {
  const { setLibrary, removeFromLibrary } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shelf = shelfOf(novel.tags);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const changeShelf = (key: ShelfKey) => {
    setLibrary([{ ...novel, tags: withShelf(novel.tags, key) }]);
    setOpen(false);
  };

  const remove = () => {
    removeFromLibrary(novel.sourceId, novel.path);
    setOpen(false);
  };

  return (
    <div className="book-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        className="book-menu-btn"
        aria-label={`Options for ${novel.name}`}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="pop-menu">
          <div className="pop-title">Move to shelf</div>
          {SHELVES.map((s) => (
            <button
              key={s.key}
              className={`pop-item ${s.key === shelf ? 'is-selected' : ''}`}
              onClick={() => changeShelf(s.key)}
            >
              {s.key === shelf && <Check size={14} />}
              <span>{s.label}</span>
            </button>
          ))}
          <div className="pop-divider" />
          <button className="pop-item pop-danger" onClick={remove}>
            <Trash2 size={14} /> Remove from library
          </button>
        </div>
      )}
    </div>
  );
}

export function hasUnread(novel: LibraryNovel, readIndex?: number): boolean {
  if (typeof novel.totalChapters !== 'number' || novel.totalChapters === 0)
    return false;
  if (novel.readChapters && novel.readChapters.length > 0) {
    return novel.readChapters.length < novel.totalChapters;
  }
  const read = readIndex ?? novel.lastChapterIndex ?? 0;
  return read < novel.totalChapters - 1;
}

/** A book counts as started if it has a last-read chapter or timestamp. */
export function isStarted(novel: LibraryNovel): boolean {
  return (
    typeof novel.lastChapterIndex === 'number' ||
    Boolean(novel.lastReadAt) ||
    (novel.progress ?? 0) > 0 ||
    (novel.readChapters?.length ?? 0) > 0
  );
}

function progressLabel(novel: LibraryNovel): string {
  if (typeof novel.totalChapters === 'number' && novel.totalChapters > 0) {
    const read =
      novel.readChapters?.length ?? (novel.lastChapterIndex ?? 0) + 1;
    const pct = novel.chapterProgress?.[String(novel.lastChapterIndex ?? 0)];
    if (typeof pct === 'number' && pct > 0 && pct < 100) {
      return `${Math.min(read, novel.totalChapters)} / ${novel.totalChapters} read · ${pct}%`;
    }
    return `${Math.min(read, novel.totalChapters)} / ${novel.totalChapters} read`;
  }
  return novel.progress > 0 ? `${Math.round(novel.progress)}%` : 'Not started';
}

function relativeDay(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
