import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  Trash2,
  PencilLine,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  Bookmark,
  Check,
  Search,
} from 'lucide-react';
import { useApp } from '@/store/AppProvider';
import { useSources } from '@/plugins/useSources';
import { parseRouteSegment, readerRoute } from '@/util/id';
import CoverImage from '@/components/CoverImage';
import { getCachedNovelMeta, setCachedNovelMeta } from '@/store/db';
import {
  readStateOf,
  isStarted,
  deriveProgress,
  type ReadState,
} from '@/util/reads';
import type { SourceNovelDetail } from '@/types';
import {
  SHELVES,
  shelfLabel,
  shelfOf,
  withShelf,
  type ShelfKey,
} from '@/util/shelves';

export function NovelPage() {
  const { sourceId = '', path = '' } = useParams();
  const navigate = useNavigate();
  const sourceIdDec = parseRouteSegment(sourceId);
  const pathDec = parseRouteSegment(path);
  const novelId = `${sourceIdDec}:${pathDec}`;

  const { getSource } = useSources();
  const {
    library,
    history,
    setLibrary,
    removeFromLibrary,
    bookmarks,
    addHistory,
  } = useApp();

  const source = getSource(sourceIdDec);
  const libNovel = library.find(
    (n) => n.sourceId === sourceIdDec && n.path === pathDec
  );

  const [novel, setNovel] = useState<SourceNovelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Folder picker + per-book menu
  const [addOpen, setAddOpen] = useState(false);
  const [shelfMenuOpen, setShelfMenuOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Chapter list controls
  const [hideRead, setHideRead] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [chapterQuery, setChapterQuery] = useState('');

  useEffect(() => {
    if (!source) {
      setError(
        'This source is not available. It may be disabled or uninstalled.'
      );
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const novelId = `${sourceIdDec}:${pathDec}`;
      // Prefer a cached copy of the novel metadata so returning to this page
      // doesn't re-fetch the chapter list from the source every time.
      const cached = await getCachedNovelMeta(novelId);
      if (cancel) return;
      if (cached) {
        setNovel(cached);
        setLoading(false);
      }
      try {
        const detail = await source!.getNovel(pathDec);
        if (cancel) return;
        setNovel(detail);
        setCachedNovelMeta(novelId, detail);
        setLoading(false);
      } catch (err) {
        if (cancel) return;
        if (!cached) {
          setError(
            err instanceof Error ? err.message : 'Could not load this novel.'
          );
        }
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIdDec, pathDec, source]);

  // Close menus on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node))
        setAddOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setShelfMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const chapters = useMemo(() => novel?.chapters ?? [], [novel]);
  const totalChapters = novel?.chapters?.length ?? libNovel?.totalChapters ?? 0;

  // Reading state (progress, read set) lives in history; the library entry
  // simply mirrors it while the book is on a shelf.
  const readState: ReadState = useMemo(
    () => readStateOf(history, novelId, libNovel),
    [history, novelId, libNovel]
  );
  const readSet = useMemo(
    () => new Set(readState.readChapters),
    [readState.readChapters]
  );
  const chapterProgress = readState.chapterProgress;
  const shelf = libNovel ? shelfOf(libNovel.tags ?? []) : 'plan';
  const isInLibrary = Boolean(libNovel);

  const isRead = (i: number) => readSet.has(i);
  const chapterPct = (i: number): number => chapterProgress[String(i)] ?? 0;

  const upsert = (patch: Record<string, unknown>) => {
    setLibrary([
      {
        id: libNovel?.id ?? `${sourceIdDec}:${pathDec}`,
        sourceId: sourceIdDec,
        path: pathDec,
        name: novel?.name ?? libNovel?.name ?? 'Untitled',
        cover: novel?.cover ?? libNovel?.cover,
        author: novel?.author ?? libNovel?.author,
        artist: novel?.artist ?? libNovel?.artist,
        genres: novel?.genres ?? libNovel?.genres,
        summary: novel?.summary ?? libNovel?.summary,
        status: (novel?.status ??
          libNovel?.status) as SourceNovelDetail['status'],
        rating: novel?.rating ?? libNovel?.rating,
        totalChapters,
        addedAt: libNovel?.addedAt ?? Date.now(),
        progress: libNovel?.progress ?? 0,
        lastChapterIndex: libNovel?.lastChapterIndex,
        lastChapterTitle: libNovel?.lastChapterTitle,
        readChapters: libNovel?.readChapters ?? [],
        tags: libNovel?.tags ?? [],
        refreshedAt: Date.now(),
        ...patch,
      },
    ]);
  };

  const addToLibrary = (key: ShelfKey) => {
    upsert({ tags: withShelf([], key), addedAt: Date.now() });
    setAddOpen(false);
  };

  const changeShelf = (key: ShelfKey) => {
    upsert({ tags: withShelf(libNovel?.tags ?? [], key) });
    setShelfMenuOpen(false);
  };

  const removeBook = () => {
    removeFromLibrary(sourceIdDec, pathDec);
    navigate(-1);
  };

  // --- Chapter multi-select / mark read -----------------------------------
  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // With exactly two chapters selected, "Select between" fills the range.
  const selectBetween = () => {
    setSelected((prev) => {
      if (prev.size !== 2) return prev;
      const [a, b] = Array.from(prev).sort((x, y) => x - y);
      const next = new Set<number>();
      for (let i = a; i <= b; i++) next.add(i);
      return next;
    });
  };

  const markSelected = (read: boolean) => {
    const prior = history.find((e) => e.novelId === novelId);
    const nextReads = new Set([
      ...(prior?.readChapters ?? []),
      ...(libNovel?.readChapters ?? []),
    ]);
    const nextProgress = { ...chapterProgress };
    for (const i of selected) {
      if (read) {
        nextReads.add(i);
        nextProgress[String(i)] = 100;
      } else {
        nextReads.delete(i);
        delete nextProgress[String(i)];
      }
    }
    const readChapters = Array.from(nextReads).sort((a, b) => a - b);
    const chapterIndex =
      readChapters.length > 0 ? readChapters[readChapters.length - 1] : 0;

    // The reading record lives in history (decoupled from the library).
    addHistory({
      novelId,
      sourceId: sourceIdDec,
      novelPath: pathDec,
      novelName: novel?.name ?? libNovel?.name ?? readState.novelName,
      cover: novel?.cover ?? libNovel?.cover,
      chapterTitle: '',
      chapterIndex,
      readChapters,
      chapterProgress: nextProgress,
      totalChapters: totalChapters || undefined,
      progress: deriveProgress(
        {
          readChapters,
          chapterProgress: nextProgress,
          lastChapterIndex: chapterIndex,
        },
        totalChapters
      ),
      at: Date.now(),
    });

    // Mirror into the library entry only if the book is already on a shelf.
    if (libNovel) {
      upsert({
        readChapters,
        chapterProgress: nextProgress,
        progress: deriveProgress(
          {
            readChapters,
            chapterProgress: nextProgress,
            lastChapterIndex: chapterIndex,
          },
          totalChapters
        ),
      });
    }
    setSelected(new Set());
    setSelecting(false);
  };

  // Filtered chapter list (hide-read option + live title search).
  const visibleChapters = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    const base = hideRead
      ? chapters.filter((_, i) => !readSet.has(i))
      : chapters;
    if (!q) return base;
    return base.filter((ch) => ch.name.toLowerCase().includes(q));
  }, [chapters, hideRead, readSet, chapterQuery]);

  // Jump: Enter on the search box opens the first matching chapter.
  const jumpToFirstMatch = () => {
    if (visibleChapters.length === 0 || selecting) return;
    const i = hideRead
      ? chapters.findIndex((c) => c === visibleChapters[0])
      : 0;
    const idx = i >= 0 ? i : 0;
    navigate(readerRoute(sourceIdDec, pathDec, idx));
  };

  const continueIndex = readState.lastChapterIndex;
  const hasRead = isStarted(readState);
  const readCount = readSet.size;

  const chapterBookmarked = (idx: number) =>
    bookmarks.some(
      (b) => b.novelId === `${sourceIdDec}:${pathDec}` && b.chapterIndex === idx
    );

  const genreList = novel?.genres
    ? novel.genres
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
    : [];

  if (loading) {
    return <NovelSkeleton />;
  }

  if (error) {
    return (
      <div className="novel">
        <button className="novel-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={16} /> Back
        </button>
        <div className="empty-library">
          <h1 className="empty-title">Unable to open this novel</h1>
          <p className="empty-body">{error}</p>
        </div>
      </div>
    );
  }

  if (!novel) return null;

  return (
    <div className="novel">
      <button className="novel-back" onClick={() => navigate(-1)}>
        <ChevronLeft size={16} /> Back
      </button>

      <div className="novel-head">
        <div className="novel-detail-cover">
          <CoverImage
            src={novel.cover}
            name={novel.name}
            imgClassName="novel-detail-cover-img"
            fallbackClassName="fallback"
          />
        </div>

        <div className="novel-meta">
          {novel.status && <span className="novel-status">{novel.status}</span>}
          <h1 className="novel-title">{novel.name}</h1>
          {novel.author && (
            <div className="novel-byline">
              by <strong>{novel.author}</strong>
            </div>
          )}

          <div className="novel-genres">
            {genreList.map((g) => (
              <span key={g} className="genre-chip">
                {g}
              </span>
            ))}
          </div>

          <div className="novel-actions">
            <Link
              to={readerRoute(sourceIdDec, pathDec, continueIndex)}
              className="btn btn-primary"
            >
              {hasRead
                ? `Continue · Chapter ${continueIndex + 1}`
                : 'Start Reading'}
            </Link>

            {!isInLibrary && (
              <div className="menu-anchor" ref={addRef}>
                <button
                  className="btn btn-ghost menu-trigger"
                  onClick={() => setAddOpen((v) => !v)}
                >
                  Add to Library <ChevronDown size={15} />
                </button>
                {addOpen && (
                  <div className="pop-menu pop-menu-left">
                    {SHELVES.map((s) => (
                      <button
                        key={s.key}
                        className="pop-item"
                        onClick={() => addToLibrary(s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isInLibrary && (
              <div className="menu-anchor" ref={menuRef}>
                <button
                  className="btn btn-ghost menu-trigger"
                  onClick={() => setShelfMenuOpen((v) => !v)}
                >
                  {shelfLabel(shelf)} <ChevronDown size={15} />
                </button>
                {shelfMenuOpen && (
                  <div className="pop-menu pop-menu-left">
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
                    <button
                      className="pop-item pop-danger"
                      onClick={removeBook}
                    >
                      <Trash2 size={14} /> Remove from library
                    </button>
                  </div>
                )}
              </div>
            )}

            {isInLibrary && (
              <span className="library-hint">
                {readCount > 0
                  ? `${readCount} / ${totalChapters || '—'} chapters read`
                  : 'Added to your library · not started'}
              </span>
            )}
          </div>
        </div>
      </div>

      {novel.summary && (
        <section className="novel-summary">
          <h2>About</h2>
          <ClampedSummary text={novel.summary} />
        </section>
      )}

      <section className="chapter-index">
        <div className="chapter-list-head">
          <h2>Chapters</h2>
          <span className="chapter-count">
            {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
          </span>
          <div className="chapter-search">
            <Search size={14} />
            <input
              type="search"
              value={chapterQuery}
              onChange={(e) => setChapterQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') jumpToFirstMatch();
              }}
              placeholder="Search chapters — Enter jumps…"
              aria-label="Search chapters"
            />
          </div>
          <div className="chapter-tools">
            <button
              className={`tool-btn ${hideRead ? 'is-active' : ''}`}
              onClick={() => setHideRead((v) => !v)}
              title={hideRead ? 'Show read chapters' : 'Hide read chapters'}
            >
              {hideRead ? <EyeOff size={15} /> : <Eye size={15} />}
              <span>{hideRead ? 'Show read' : 'Hide read'}</span>
            </button>
            <button
              className={`tool-btn ${selecting ? 'is-active' : ''}`}
              onClick={() => {
                setSelecting((v) => !v);
                setSelected(new Set());
              }}
              title="Select chapters to mark read"
            >
              <PencilLine size={15} />
              <span>{selecting ? 'Done' : 'Select'}</span>
            </button>
          </div>
        </div>

        {selecting && selected.size > 0 && (
          <div className="multi-bar">
            <span className="multi-count">{selected.size} selected</span>
            {selected.size === 2 && (
              <button className="btn btn-ghost" onClick={selectBetween}>
                <CheckSquare size={15} /> Select between
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={() => markSelected(true)}
            >
              <CheckSquare size={15} /> Mark read
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => markSelected(false)}
            >
              <Square size={15} /> Mark unread
            </button>
          </div>
        )}

        <div className="chapter-list">
          {visibleChapters.length === 0 ? (
            <p className="shelf-empty">No chapters match.</p>
          ) : (
            visibleChapters.map((ch) => {
              const i = chapters.findIndex((c) => c === ch);
              const read = isRead(i);
              return (
                <div
                  key={`${ch.path}-${i}`}
                  className={`chapter-row ${selecting ? 'is-selectable' : ''} ${
                    read ? 'is-read' : ''
                  } ${selected.has(i) ? 'is-selected' : ''} ${
                    i === continueIndex && hasRead ? 'is-current' : ''
                  }`}
                  onClick={() => (selecting ? toggleSelect(i) : undefined)}
                >
                  {selecting && (
                    <span className="chapter-check">
                      {selected.has(i) ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} />
                      )}
                    </span>
                  )}
                  <Link
                    to={readerRoute(sourceIdDec, pathDec, i)}
                    className="chapter-main"
                    onClick={(e) => {
                      if (selecting) e.preventDefault();
                    }}
                  >
                    <div className="chapter-left">
                      <span className="chapter-num">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="chapter-name">
                        {ch.name}
                        {!read && chapterPct(i) > 0 && (
                          <span className="chapter-reading">
                            {chapterPct(i)}% read
                          </span>
                        )}
                      </span>
                      {i === continueIndex && hasRead && !read && (
                        <span className="chapter-current">Unread · next</span>
                      )}
                    </div>
                    <div className="chapter-right">
                      {read && (
                        <Check size={14} className="chapter-read-mark" />
                      )}
                      {chapterBookmarked(i) && (
                        <Bookmark size={14} className="chapter-bookmark" />
                      )}
                      {ch.releaseTime && (
                        <span className="chapter-date">
                          {formatDate(ch.releaseTime)}
                        </span>
                      )}
                    </div>
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Novel blurb clamped to four lines; shows a "See more" toggle only when the
 * text actually overflows.
 */
function ClampedSummary({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div className="novel-summary-body">
      <p ref={ref} className={`novel-summary-text ${open ? 'is-open' : ''}`}>
        {text}
      </p>
      {overflowing && (
        <button
          className="novel-summary-more"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Show less' : 'See more'}
        </button>
      )}
    </div>
  );
}

function NovelSkeleton() {
  return (
    <div className="novel" aria-busy="true">
      <div className="novel-head">
        <div className="novel-detail-cover placeholder" />
        <div className="novel-meta">
          <div className="placeholder sk-line sk-line-sm" />
          <div className="placeholder sk-line sk-line-lg" />
          <div className="placeholder sk-line sk-line-md" />
          <div className="placeholder sk-line sk-line-sm" />
        </div>
      </div>
    </div>
  );
}
