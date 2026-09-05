import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/store/AppProvider';
import { useSources } from '@/plugins/useSources';
import { parseRouteSegment, novelRoute, readerRoute } from '@/util/id';
import { sanitizeChapterHtml } from '@/util/sanitize';
import { bionicifyHtml } from '@/util/bionic';
import {
  getCachedChapter,
  setCachedChapter,
  getCachedNovelMeta,
  setCachedNovelMeta,
} from '@/store/db';
import {
  ReaderSettingsPanel,
  COLUMN_DEFAULTS,
  CUSTOM_THEME_DEFAULTS,
} from '@/components/reader/ReaderSettings';
import { ChapterSelector } from '@/components/reader/ChapterSelector';
import { ReaderTTS } from '@/components/reader/ReaderTTS';
import { ReaderScrollbar } from '@/components/reader/ReaderScrollbar';
import { useParagraphs } from '@/components/reader/useParagraphs';
import {
  ChevronLeft,
  ChevronRight,
  BookmarkIcon,
  ReaderSettingsIcon,
} from '@/components/icons';
import { Volume2 } from 'lucide-react';

const AUTO_HIDE_DELAY = 2600;
const PERCENT_SAVE_THRESHOLD = 0.02;
// A chapter counts as read once ~90% of it has been scrolled.
const CHAPTER_READ_AT = 0.9;

export function ReaderPage() {
  const { sourceId = '', novelPath = '', chapterIndex = '0' } = useParams();
  const navigate = useNavigate();

  const sourceIdDec = parseRouteSegment(sourceId);
  const novelPathDec = parseRouteSegment(novelPath);
  const rawIndex = Math.max(0, parseInt(chapterIndex, 10) || 0);

  const { getSource } = useSources();
  const {
    setLibrary,
    bookmarks,
    setBookmarks,
    addHistory,
    settings,
    library,
    history,
    updateSettings,
  } = useApp();
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const historyRef = useRef(history);
  historyRef.current = history;

  const novelId = `${sourceIdDec}:${novelPathDec}`;
  const source = getSource(sourceIdDec);

  // Novel metadata (chapters list, name) loaded from the source.
  const [chapters, setChapters] = useState<{ name: string; path: string }[]>(
    []
  );
  const [novelName, setNovelName] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(rawIndex);

  // Chrome state
  const [chromeVisible, setChromeVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const lastScrollY = useRef(0);

  // Progress / scroll
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    contentRef.current = el;
    setScrollerEl(el);
  }, []);
  const scrollRef = useRef(0);
  const savedPercent = useRef(0);
  const [progress, setProgress] = useState(0); // 0..1 within chapter
  // Set when the user explicitly navigates (next/prev/select): the fresh
  // chapter must open at the top, not at a saved spot from an earlier visit.
  const suppressRestore = useRef(false);
  // Index of the chapter whose content is currently rendered, written after a
  // chapter finishes loading. Lets the restore effect tell "still the old
  // chapter on screen" apart from "new chapter is live".
  const loadedIdxRef = useRef<number | null>(null);

  // Move the scroll instantly. `scroll-behavior: smooth` is on the column for
  // keyboard scrolling — if we let it apply here, a position reset or restore
  // would animate across the old content while the new chapter swaps in,
  // landing at a random mid-chapter percent (the "opened at 56%/91%" bug).
  const jumpScroll = (top: number) => {
    const el = contentRef.current;
    if (!el) return;
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = top;
    el.style.scrollBehavior = prev;
  };

  // ---- Progress committing -------------------------------------------------
  // Persist a reading record (history entry + library mirror). Both scroll
  // saves and plain chapter opens funnel through here so a book merely opened
  // still shows up in history / "Continue reading".
  const commitRecord = useCallback(
    (idx: number, percent: number) => {
      const title = chapters[idx]?.name ?? `Chapter ${idx + 1}`;
      const current = libraryRef.current.find((n) => n.id === novelId);
      const prior = historyRef.current.find((e) => e.novelId === novelId);
      const total =
        chapters.length || prior?.totalChapters || current?.totalChapters || 0;

      const chapterProgress = {
        ...(prior?.chapterProgress ?? {}),
        ...(current?.chapterProgress ?? {}),
      };
      chapterProgress[String(idx)] = Math.round(percent * 100);
      const readSet = new Set([
        ...(prior?.readChapters ?? []),
        ...(current?.readChapters ?? []),
      ]);
      if (percent >= CHAPTER_READ_AT) readSet.add(idx);
      const readChapters = Array.from(readSet).sort((a, b) => a - b);

      const completedCount = readChapters.filter((i) => i < idx).length;
      const overall =
        total > 0
          ? Math.round(((completedCount + percent) / total) * 100)
          : Math.round(percent * 100);
      // Keep it from looking "done" before the last chapter is actually read.
      const bounded = total > 0 ? Math.min(overall, 99) : overall;

      addHistory({
        novelId,
        sourceId: sourceIdDec,
        novelPath: novelPathDec,
        novelName: novelName || prior?.novelName || current?.name || 'Untitled',
        cover: current?.cover ?? prior?.cover,
        chapterTitle: title,
        chapterIndex: idx,
        chapterProgress,
        readChapters,
        totalChapters: total || undefined,
        progress: bounded,
        at: Date.now(),
      });

      // Mirror progress into the library entry only when the book is already
      // on a shelf — reading alone must not create a library entry.
      if (current) {
        setLibrary([
          {
            ...current,
            progress: Math.max(current.progress ?? 0, bounded),
            lastChapterIndex: idx,
            lastChapterTitle: title,
            lastReadAt: Date.now(),
            readChapters,
            chapterProgress,
            totalChapters: total || current.totalChapters,
          },
        ]);
      }
    },
    [
      chapters,
      novelId,
      sourceIdDec,
      novelPathDec,
      novelName,
      setLibrary,
      addHistory,
    ]
  );

  // ---- Load chapters for this novel --------------------------------------
  const loadedChapters = useRef(false);

  useEffect(() => {
    if (!source || loadedChapters.current) return;
    loadedChapters.current = true;
    source
      .getNovel(novelPathDec)
      .then(async (detail) => {
        await setCachedNovelMeta(novelId, detail);
        setChapters(detail.chapters ?? []);
        setNovelName(detail.name);
      })
      .catch(async () => {
        const cached = await getCachedNovelMeta(novelId);
        if (cached) {
          setChapters(cached.chapters ?? []);
          setNovelName(cached.name);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIdDec, novelPathDec, source]);

  // ---- Fetch/load the active chapter --------------------------------------
  // Keep currentIdx in lockstep with the route so URL navigation (chapters,
  // back/forward) always re-locates the active chapter.
  useEffect(() => {
    setCurrentIdx(rawIndex);
  }, [rawIndex]);

  useEffect(() => {
    if (!source) {
      setError('This source is not available.');
      setLoading(false);
      return;
    }
    const chapter = chapters[currentIdx];
    if (!chapter) {
      setLoading(true);
      setError(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    scrollRef.current = 0;
    savedPercent.current = 0;
    setProgress(0);
    const resetScrollTop = () => {
      scrollRef.current = 0;
      jumpScroll(0);
      window.scrollTo(0, 0);
    };
    resetScrollTop();

    const doLoad = async () => {
      try {
        const cached = await getCachedChapter(novelId, currentIdx);
        if (cancel) return;
        if (cached) {
          setContent(cached);
          setLoading(false);
          loadedIdxRef.current = currentIdx;
          resetScrollTop();
          recordOpen();
          return;
        }
        const html = await source.getChapter(chapter.path);
        if (cancel) return;
        const safe = sanitizeChapterHtml(html);
        setContent(safe);
        setCachedChapter(novelId, currentIdx, safe);
        setLoading(false);
        loadedIdxRef.current = currentIdx;
        resetScrollTop();
        recordOpen();
      } catch (err) {
        if (cancel) return;
        setError(
          err instanceof Error ? err.message : 'Could not load this chapter.'
        );
        setLoading(false);
      }
    };
    // Log the chapter opening so merely opening a book records it in history
    // (and nudges "Continue reading"), preserving any in-chapter percent that
    // was already saved for this chapter from an earlier visit.
    const recordOpen = () => {
      const prior = historyRef.current.find((e) => e.novelId === novelId);
      const cur = libraryRef.current.find((n) => n.id === novelId);
      const storedPct =
        prior?.chapterProgress?.[String(currentIdx)] ??
        cur?.chapterProgress?.[String(currentIdx)] ??
        0;
      commitRecord(currentIdx, storedPct);
    };
    void doLoad();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIdDec, novelPathDec, source, currentIdx, chapters]);

  // Speech-friendly paragraphs of the current chapter.
  const paragraphs = useParagraphs(content);

  // Restore the reader's position inside the chapter (in-chapter scroll %)
  // once the current chapter's content is rendered, so returning to the
  // reader picks up where you left off rather than restarting the chapter.
  useEffect(() => {
    if (!content || loading) return;
    const el = contentRef.current;
    if (!el) return;
    // Content on screen must belong to the requested chapter first. Without
    // this, the suppression flag could be consumed while the *old* chapter is
    // still rendered, letting a saved in-chapter percent of the target chapter
    // restore again ("opened at 58%"), even though the user asked to start at
    // the top.
    if (loadedIdxRef.current !== currentIdx) return;
    // An explicit chapter navigation starts at the top; only direct revisits
    // (page loads, back/forward) restore the saved in-chapter position.
    if (suppressRestore.current) {
      suppressRestore.current = false;
      scrollRef.current = 0;
      savedPercent.current = 0;
      jumpScroll(0);
      return;
    }
    const record = historyRef.current.find((e) => e.novelId === novelId);
    const entry = libraryRef.current.find((n) => n.id === novelId);
    const savedPct =
      record?.chapterProgress?.[String(currentIdx)] ??
      entry?.chapterProgress?.[String(currentIdx)];
    const seen = el.scrollHeight - el.clientHeight;
    const scrollTo = seen > 0 ? (seen * (savedPct ?? 0)) / 100 : 0;
    // Only restore when there was a meaningful position to return to.
    if (savedPct != null && savedPct > 0) {
      jumpScroll(scrollTo);
      scrollRef.current = scrollTo;
      savedPercent.current = savedPct / 100;
      setProgress(
        seen > 0
          ? Math.min(1, (scrollTo + el.clientHeight) / el.scrollHeight)
          : 1
      );
    }
  }, [content, currentIdx, loading, novelId]);

  // The reader is a full-viewport route; mirror its theme onto <body> so
  // overscroll, scrollbars and the area behind the fixed chrome match.
  useEffect(() => {
    const prevClass = document.body.className;
    document.body.classList.add('reading');
    document.body.setAttribute('data-reader-theme', settings?.theme ?? 'sepia');
    if (settings?.theme === 'custom') {
      document.body.style.setProperty(
        '--reader-bg-custom',
        settings.customBg ?? CUSTOM_THEME_DEFAULTS.bg
      );
      document.body.style.setProperty(
        '--reader-text-custom',
        settings.customText ?? CUSTOM_THEME_DEFAULTS.text
      );
    }
    return () => {
      document.body.className = prevClass;
      document.body.removeAttribute('data-reader-theme');
      document.body.style.removeProperty('--reader-bg-custom');
      document.body.style.removeProperty('--reader-text-custom');
    };
  }, [settings?.theme, settings?.customBg, settings?.customText]);

  // Highlight the paragraph being read aloud, matching by text against the
  // rendered `.prose` descendants (not just direct children, in case block
  // elements are wrapped in an extra container).
  useEffect(() => {
    const container = contentRef.current?.querySelector('.prose');
    if (!container) return;
    // Clear previous highlight from every element that has it.
    container
      .querySelectorAll<HTMLElement>('.tts-active')
      .forEach((el) => el.classList.remove('tts-active'));
    if (activeParagraph === null) return;
    const target = paragraphs[activeParagraph];
    if (!target) return;
    // Walk every element in the prose tree; the first whose own text matches
    // exactly gets the highlight. We check every element (not just direct
    // children) so that paragraphs inside wrapper <div>s are found.
    const all = container.querySelectorAll<HTMLElement>('*');
    for (const el of Array.from(all)) {
      if ((el.textContent ?? '').trim() !== target.text) continue;
      // If this element is inline (e.g. <b> inside a <p>), highlight its
      // block parent instead so the background covers the full line.
      const block = el.closest(
        'p, h1, h2, h3, h4, h5, h6, li, blockquote, div'
      );
      (block ?? el).classList.add('tts-active');
      break;
    }
  }, [activeParagraph, paragraphs, content]);

  // ---- Progress saving ----------------------------------------------------
  const saveProgress = useCallback(
    (idx: number, scrollTop: number, scrollHeight: number) => {
      const seenHeight = scrollHeight - (contentRef.current?.clientHeight ?? 0);
      const percent =
        seenHeight > 0
          ? Math.min(1, Math.max(0, scrollTop / seenHeight))
          : scrollTop > 0
            ? 1
            : 0;
      if (
        Math.abs(percent - savedPercent.current) < PERCENT_SAVE_THRESHOLD &&
        percent < 0.995
      ) {
        return;
      }
      savedPercent.current = percent;
      commitRecord(idx, percent);
    },
    [commitRecord]
  );

  // ---- Auto-hide chrome ---------------------------------------------------
  const setChrome = useCallback((visible: boolean) => {
    setChromeVisible(visible);
  }, []);
  const hideChrome = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setChrome(false);
  }, [setChrome]);
  const pokeChrome = useCallback(() => {
    setChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(
      () => setChrome(false),
      AUTO_HIDE_DELAY
    );
  }, [setChrome]);
  const showChrome = useCallback(() => {
    setChrome(true);
  }, [setChrome]);

  useEffect(() => {
    pokeChrome();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [currentIdx, pokeChrome]);

  // Hook the scroll listener.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      scrollRef.current = el.scrollTop;
      setProgress(
        el.scrollHeight > el.clientHeight
          ? Math.min(1, (el.scrollTop + el.clientHeight) / el.scrollHeight)
          : 1
      );
      saveProgress(currentIdx, el.scrollTop, el.scrollHeight);
      const delta = el.scrollTop - lastScrollY.current;
      lastScrollY.current = el.scrollTop;
      if (panelOpen || selectorOpen) return;
      if (delta > 2) {
        // Scrolling down: dismiss the chrome.
        hideChrome();
      } else if (delta < -2) {
        // Scrolling up: bring it back.
        showChrome();
      } else {
        pokeChrome();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [
    currentIdx,
    saveProgress,
    content,
    panelOpen,
    selectorOpen,
    hideChrome,
    showChrome,
    pokeChrome,
  ]);

  // ---- Keyboard navigation ------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input / panel.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (panelOpen || selectorOpen) {
        if (e.key === 'Escape') {
          setPanelOpen(false);
          setSelectorOpen(false);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          contentRef.current?.scrollBy({ top: 48, behavior: 'smooth' });
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          contentRef.current?.scrollBy({ top: -48, behavior: 'smooth' });
          break;
        case 'PageDown':
        case ' ':
          e.preventDefault();
          contentRef.current?.scrollBy({
            top: window.innerHeight * 0.85,
            behavior: 'smooth',
          });
          break;
        case 'PageUp':
          e.preventDefault();
          contentRef.current?.scrollBy({
            top: -window.innerHeight * 0.85,
            behavior: 'smooth',
          });
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          nextChapter();
          break;
        case 'ArrowLeft':
        case 'h':
          e.preventDefault();
          prevChapter();
          break;
        case 'Home':
        case 'g':
          e.preventDefault();
          goToChapter(0);
          break;
        case 'End':
        case 'G':
          e.preventDefault();
          goToChapter(chapters.length - 1);
          break;
        case '?':
          e.preventDefault();
          setPanelOpen((o) => !o);
          break;
        case 'm':
          e.preventDefault();
          toggleBookmark();
          break;
        case 't':
          e.preventDefault();
          setSelectorOpen(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, selectorOpen, chapters.length, currentIdx]);

  // ---- Chapter navigation -------------------------------------------------
  const goToChapter = (idx: number) => {
    const i = Math.max(0, Math.min(idx, chapters.length - 1));
    if (i === currentIdx) return;
    suppressRestore.current = true;
    navigate(readerRoute(sourceIdDec, novelPathDec, i));
  };
  const nextChapter = () => {
    if (currentIdx < chapters.length - 1) goToChapter(currentIdx + 1);
  };
  const prevChapter = () => {
    if (currentIdx > 0) goToChapter(currentIdx - 1);
  };

  // ---- Bookmarks ----------------------------------------------------------
  const bookmarked = bookmarks.some(
    (b) => b.novelId === novelId && b.chapterIndex === currentIdx
  );
  const toggleBookmark = () => {
    const existing = bookmarks.filter(
      (b) => b.novelId === novelId && b.chapterIndex === currentIdx
    );
    if (existing.length > 0) {
      setBookmarks(bookmarks.filter((b) => b !== existing[0]));
      return;
    }
    const title = chapters[currentIdx]?.name ?? `Chapter ${currentIdx + 1}`;
    setBookmarks([
      ...bookmarks,
      {
        id: `${novelId}:${currentIdx}:${Date.now()}`,
        novelId,
        chapterPath: chapters[currentIdx]?.path ?? '',
        chapterIndex: currentIdx,
        chapterTitle: title,
        createdAt: Date.now(),
      },
    ]);
  };

  const chapterName = chapters[currentIdx]?.name ?? `Chapter ${currentIdx + 1}`;
  const widthPx = useMemo(() => {
    if (!settings) return 640;
    const base = COLUMN_DEFAULTS[settings.width] ?? 40;
    return base * 16;
  }, [settings]);

  const bionic = settings?.bionicReading ?? false;
  const displayHtml = useMemo(
    () => (bionic ? bionicifyHtml(content) : content),
    [content, bionic]
  );

  // Keep copy locked out of the reader when the user disables it.
  useEffect(() => {
    if (settings?.copyText !== false) return;
    const block = (e: ClipboardEvent) => e.preventDefault();
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
    };
  }, [settings?.copyText]);

  const topMute = chromeVisible ? '' : 'is-quiet';

  return (
    <div
      className="reader"
      data-reader-theme={settings?.theme ?? 'sepia'}
      data-reader-font={settings?.font ?? 'serif'}
      data-text-align={settings?.textAlign ?? 'left'}
      data-copy={settings?.copyText === false ? 'off' : 'on'}
      onMouseMove={showChrome}
      onTouchStart={showChrome}
      style={
        settings
          ? ({
              '--reader-font-size': settings.fontSize,
              '--reader-line-height': settings.lineHeight,
              '--reader-paragraph-gap': settings.paragraphGap,
              '--reader-bg-custom':
                settings.theme === 'custom'
                  ? (settings.customBg ?? CUSTOM_THEME_DEFAULTS.bg)
                  : undefined,
              '--reader-text-custom':
                settings.theme === 'custom'
                  ? (settings.customText ?? CUSTOM_THEME_DEFAULTS.text)
                  : undefined,
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* Top chrome */}
      <header className={`reader-top ${topMute}`}>
        <Link
          to={novelRoute(sourceIdDec, novelPathDec)}
          className="reader-back"
          aria-label="Back to novel"
        >
          <ChevronLeft size={18} />
        </Link>
        <div className="reader-title">
          <span className="reader-novel">{novelName}</span>
          <span className="reader-chapter-name">{chapterName}</span>
        </div>
        <div className="reader-top-actions">
          {bookmarked && (
            <button
              className="icon-btn active"
              onClick={toggleBookmark}
              aria-label="Remove bookmark"
            >
              <BookmarkIcon size={18} />
            </button>
          )}
          <button
            className="icon-btn"
            onClick={toggleBookmark}
            aria-label="Bookmark this chapter"
            style={bookmarked ? { display: 'none' } : undefined}
          >
            <BookmarkIcon size={18} />
          </button>
          <button
            className={`icon-btn ${ttsOpen ? 'active' : ''}`}
            onClick={() => setTtsOpen((v) => !v)}
            aria-label="Read aloud"
            aria-pressed={ttsOpen}
          >
            <Volume2 size={18} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setPanelOpen(true)}
            aria-label="Reading settings"
          >
            <ReaderSettingsIcon size={18} />
          </button>
        </div>
      </header>

      {/* Reading column */}
      <div className="reader-canvas">
        <div
          className="reader-col"
          style={{ maxWidth: `${widthPx}px` }}
          ref={attachScroller}
          tabIndex={0}
        >
          {loading && (
            <div
              className="reader-loading-bar"
              role="progressbar"
              aria-busy="true"
              aria-label="Loading chapter"
            />
          )}
          {!loading && error && (
            <div className="reader-error">
              <p>{error}</p>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setContent('');
                  setError(null);
                  setCurrentIdx((i) => i);
                }}
                style={{ alignSelf: 'center' }}
              >
                Retry
              </button>
            </div>
          )}
          {content && !error && (
            <article className="reading-body">
              <header className="chapter-title-block">
                <h1 className="reader-chapter-title">{chapterName}</h1>
                <div className="chapter-title-rule" />
              </header>
              <div
                className="prose"
                dangerouslySetInnerHTML={{ __html: displayHtml }}
              />
              <div className="chapter-end">
                <span className="end-mark">✦</span>
                <div className="end-nav">
                  {currentIdx < chapters.length - 1 ? (
                    <button className="nav-btn next-big" onClick={nextChapter}>
                      Next chapter <ChevronRight size={16} />
                    </button>
                  ) : (
                    <div className="book-complete">
                      <span>You have reached the end.</span>
                    </div>
                  )}
                </div>
              </div>
            </article>
          )}
        </div>
        <ReaderScrollbar scroller={scrollerEl} />
      </div>

      {ttsOpen && (
        <div className="reader-tts-wrapper">
          <ReaderTTS
            paragraphs={paragraphs}
            variant="bubble"
            onActive={setActiveParagraph}
            settings={settings}
            onSettings={(patch) => updateSettings(patch)}
          />
        </div>
      )}

      {/* Bottom chrome */}
      <footer className={`reader-bottom ${topMute}`}>
        <div className="reader-progress">
          <span className="reader-progress-label">
            {Math.round(progress * 100)}%
          </span>
          <div className="reader-progress-track">
            <div
              className="reader-progress-fill"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="reader-position">
            Chapter {currentIdx + 1} of{' '}
            {Math.max(chapters.length, currentIdx + 1)}
          </span>
        </div>
        <div className="reader-nav">
          <button
            className="nav-btn"
            onClick={prevChapter}
            disabled={currentIdx === 0}
          >
            <ChevronLeft size={16} />
            <span>Previous</span>
          </button>
          <button
            className="nav-btn nav-select"
            onClick={() => setSelectorOpen(true)}
          >
            <span>Chapters</span>
          </button>
          <button
            className="nav-btn"
            onClick={nextChapter}
            disabled={currentIdx >= chapters.length - 1}
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>

      <ReaderSettingsPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onJumpChapter={() => {
          setPanelOpen(false);
          setSelectorOpen(true);
        }}
      />

      <ChapterSelector
        open={selectorOpen}
        current={currentIdx}
        chapters={chapters}
        onClose={() => setSelectorOpen(false)}
        onSelect={(i) => {
          setSelectorOpen(false);
          goToChapter(i);
        }}
      />

      <div
        className={`kbd-hint ${chromeVisible ? '' : 'is-quiet'}`}
        aria-hidden="true"
      >
        <Kbd k="j / k" hint="scroll" /> <Kbd k="← →" hint="chapter" />
        <Kbd k="m" hint="bookmark" /> <Kbd k="t" hint="chapters" />
        <Kbd k="?" hint="settings" />
      </div>
    </div>
  );
}

function Kbd({ k, hint }: { k: string; hint: string }) {
  return (
    <span className="kbd">
      <b>{k}</b>
      <i>{hint}</i>
    </span>
  );
}
