import type { LibraryNovel } from '@/types';
import { shelfOf } from './shelves';

export interface ReaderTotals {
  total: number;
  /** Books on the "Reading" shelf (started, not finished). */
  inProgress: number;
  /** Books on the "Completed" shelf (or fully read). */
  finished: number;
  /** All started books (Reading + Completed). */
  started: number;
  /** Chapters actually read, summed across every book. */
  chaptersRead: number;
  /** Chapters remaining, summed across every book. */
  unreadChapters: number;
}

/**
 * Whether a book has been started at all (any progress recorded), independent
 * of which shelf it sits on. Mirrors the "Continue reading" / card logic so
 * the stats agree with what the library list shows.
 */
export function isStartedBook(novel: LibraryNovel): boolean {
  return (
    typeof novel.lastChapterIndex === 'number' ||
    Boolean(novel.lastReadAt) ||
    (novel.progress ?? 0) > 0 ||
    (novel.readChapters?.length ?? 0) > 0
  );
}

/**
 * Derive aggregate reading totals from the library. Pure and unit-testable;
 * the stats view only formats the result. "Finished" follows the on-card
 * Completed shelf (the same source the filters use), and "started" matches
 * `isStartedBook`, so every number lines up with what the library shows.
 */
export function computeTotals(library: LibraryNovel[]): ReaderTotals {
  let finished = 0;
  let started = 0;
  let chaptersRead = 0;
  let unreadChapters = 0;

  for (const novel of library) {
    const total = novel.totalChapters ?? 0;
    const idx = novel.lastChapterIndex ?? -1;
    // Prefer explicitly-tracked read chapters when present; otherwise fall
    // back to inferring from the last chapter index for older records.
    const read =
      novel.readChapters && novel.readChapters.length > 0
        ? novel.readChapters.length
        : total > 0
          ? idx + 1
          : 0;
    chaptersRead += read;
    unreadChapters += Math.max(0, total - read);

    const onCompletedShelf = shelfOf(novel.tags ?? []) === 'completed';
    const fullyRead = total > 0 && idx + 1 >= total;
    if (onCompletedShelf || fullyRead) {
      finished++;
    }
    if (isStartedBook(novel) || onCompletedShelf) {
      started++;
    }
  }

  return {
    total: library.length,
    inProgress: Math.max(0, started - finished),
    finished,
    started,
    chaptersRead,
    unreadChapters,
  };
}

/** Nicely format a read duration (ms) as "Xh Ym" or "Ym". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
