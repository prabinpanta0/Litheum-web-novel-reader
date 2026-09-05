import type { LibraryNovel } from '@/types';
import { computeTotals, formatDuration } from '@/util/stats';

export interface ReaderStatsProps {
  library: LibraryNovel[];
  /** Cumulative reading time in ms (optional; shown as "time read"). */
  minutesRead?: number;
  /** Optional time-limit cap, e.g. to hide the time stat. */
  showTime?: boolean;
}

/**
 * Reusable reading room statistics.
 *
 * Presentational: takes the library (and optionally cumulative reading
 * time) and renders aggregate numbers. Pure — the math lives in
 * `util/stats.ts` and is unit-tested independently.
 */
export function ReaderStats({
  library,
  minutesRead,
  showTime = true,
}: ReaderStatsProps) {
  const t = computeTotals(library);

  const captionOf: Record<string, string> = {
    'In library': 'Total books in your library.',
    Reading: "Books you've started but not finished.",
    Finished: 'Books on the Completed shelf (or fully read).',
    'Chapters read': 'Chapters read across every book, out of all chapters.',
    'Unread chapters': 'Chapters left across every book.',
    'Time read': 'Cumulative reading time.',
  };

  const stats: { label: string; value: string }[] = [
    { label: 'In library', value: String(t.total) },
    { label: 'Reading', value: String(t.inProgress) },
    { label: 'Finished', value: String(t.finished) },
    {
      label: 'Chapters read',
      value: `${t.chaptersRead} / ${t.unreadChapters + t.chaptersRead}`,
    },
    { label: 'Unread chapters', value: String(t.unreadChapters) },
  ];
  if (showTime && minutesRead !== undefined) {
    stats.push({ label: 'Time read', value: formatDuration(minutesRead) });
  }

  return (
    <dl className="reader-stats" aria-label="Reading statistics">
      {stats.map((s) => (
        <div key={s.label} className="reader-stat" title={captionOf[s.label]}>
          <dt>{s.label}</dt>
          <dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
