import type { HistoryEntry, LibraryNovel } from '@/types';

/**
 * Reading-state helpers.
 *
 * Progress is deliberately tracked independently of the library: reading a
 * chapter must not add a novel to the library, and removing a novel from the
 * library must not wipe your read history. The per-novel reading record lives
 * in history (`HistoryEntry`), which is deduplicated by `novelId`; the library
 * entry simply mirrors it while the book is on a shelf.
 */

export interface ChapterStats {
  readChapters: number[];
  chapterProgress: Record<string, number>;
  lastChapterIndex: number;
}

/** Whole-novel progress 0-100 from chapters-read plus the partial current. */
export function deriveProgress(stats: ChapterStats, total: number): number {
  const percent = stats.chapterProgress[String(stats.lastChapterIndex)] ?? 0;
  if (total <= 0) return Math.round(percent);
  const completed = stats.readChapters.filter(
    (i) => i < stats.lastChapterIndex
  ).length;
  const overall = Math.round(((completed + percent / 100) / total) * 100);
  // Don't look "done" until the last chapter is actually read.
  return Math.min(overall, 99);
}

export interface ReadState extends ChapterStats {
  sourceId: string;
  novelPath: string;
  novelName: string;
  cover?: string;
  lastChapterTitle?: string;
  lastReadAt?: number;
  totalChapters?: number;
  progress: number;
}

/**
 * Merge a novel's reading state from the history record and (optionally) the
 * library entry, preferring the more recent history record for progress.
 */
export function readStateOf(
  history: HistoryEntry[],
  novelId: string,
  lib?: LibraryNovel | undefined
): ReadState {
  const h = history.find((e) => e.novelId === novelId);
  const readChapters = Array.from(
    new Set([...(lib?.readChapters ?? []), ...(h?.readChapters ?? [])])
  ).sort((a, b) => a - b);
  const chapterProgress = {
    ...(lib?.chapterProgress ?? {}),
    ...(h?.chapterProgress ?? {}),
  };
  const lastChapterIndex = h?.chapterIndex ?? lib?.lastChapterIndex ?? 0;
  const totalChapters = h?.totalChapters ?? lib?.totalChapters;
  const stats: ChapterStats = {
    readChapters,
    chapterProgress,
    lastChapterIndex,
  };
  return {
    ...stats,
    sourceId: h?.sourceId ?? lib?.sourceId ?? '',
    novelPath: h?.novelPath ?? lib?.path ?? '',
    novelName: h?.novelName ?? lib?.name ?? 'Untitled',
    cover: h?.cover ?? lib?.cover,
    lastChapterTitle: h?.chapterTitle ?? lib?.lastChapterTitle,
    lastReadAt: h?.at ?? lib?.lastReadAt,
    totalChapters,
    progress: deriveProgress(stats, totalChapters ?? 0),
  };
}

/** True once the user has actually started reading (progress exists). */
export function isStarted(state: ReadState): boolean {
  return (
    state.readChapters.length > 0 ||
    Object.keys(state.chapterProgress).length > 0 ||
    state.lastChapterIndex > 0 ||
    state.progress > 0
  );
}

/** Build a fresh history record with merged read state. */
export function withReadPatch(
  history: HistoryEntry[],
  novelId: string,
  patch: {
    readChapters?: number[];
    chapterProgress?: Record<string, number>;
    chapterIndex?: number;
    chapterTitle?: string;
    at?: number;
  }
): HistoryEntry {
  const existing = history.find((e) => e.novelId === novelId);
  const at = patch.at ?? existing?.at ?? Date.now();
  return {
    novelId: existing?.novelId ?? novelId,
    sourceId: existing?.sourceId ?? '',
    novelPath: existing?.novelPath ?? '',
    novelName: existing?.novelName ?? 'Untitled',
    chapterTitle: patch.chapterTitle ?? existing?.chapterTitle ?? '',
    chapterIndex: patch.chapterIndex ?? existing?.chapterIndex ?? 0,
    readChapters: patch.readChapters ?? existing?.readChapters,
    chapterProgress: patch.chapterProgress ?? existing?.chapterProgress,
    at,
  };
}
