import { useEffect, useMemo, useState } from 'react';

interface ChapterSelectorProps {
  open: boolean;
  current: number;
  chapters: { name: string; path: string }[];
  onClose(): void;
  onSelect(index: number): void;
}

export function ChapterSelector({
  open,
  current,
  chapters,
  onClose,
  onSelect,
}: ChapterSelectorProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setQuery('');
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return chapters;
    const q = query.toLowerCase();
    return chapters
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.name.toLowerCase().includes(q))
      .map(({ c }) => c);
  }, [chapters, query]);

  if (!open) return null;

  return (
    <div
      className="chapter-selector-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Jump to chapter"
    >
      <div className="chapter-selector">
        <div className="selector-head">
          <span className="selector-title">Chapters</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <span className="x-glyph">×</span>
          </button>
        </div>
        <input
          autoFocus
          type="search"
          placeholder="Filter chapters…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="selector-search"
          aria-label="Filter chapters"
        />
        <div className="selector-list">
          {filtered.length === 0 && (
            <div className="selector-empty">No chapters match.</div>
          )}
          {filtered.map((ch, i) => {
            const realIdx = chapters.indexOf(ch);
            const isCurrent = realIdx === current;
            return (
              <button
                key={`${ch.path}-${i}`}
                className={`selector-row ${isCurrent ? 'is-current' : ''}`}
                onClick={() => onSelect(realIdx)}
              >
                <span className="selector-num">
                  {String(realIdx + 1).padStart(3, '0')}
                </span>
                <span className="selector-name">{ch.name}</span>
                {isCurrent && (
                  <span className="selector-current-badge">Reading</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
