/**
 * Core domain types for Litheum.
 *
 * These mirror the LMReader plugin contract while adding the
 * application-level concerns (progress, bookmarks, library metadata)
 * that the reader tracks locally.
 */

export type NovelStatus =
  | 'Ongoing'
  | 'Completed'
  | 'Licensed'
  | 'OnHiatus'
  | 'Cancelled'
  | 'Inactive'
  | 'PublishingFinished'
  | 'Unknown';

/** A chapter as returned by a source. */
export interface SourceChapter {
  name: string;
  path: string;
  releaseTime?: string | null;
  chapterNumber?: number;
  page?: string;
  scanlator?: string | string[];
}

/** A novel as returned by a source (list item from search/popular). */
export interface SourceNovelItem {
  name: string;
  path: string;
  cover?: string;
}

/** Full novel detail returned by `parseNovel`. */
export interface SourceNovelDetail extends SourceNovelItem {
  genres?: string;
  summary?: string;
  author?: string;
  artist?: string;
  status?: NovelStatus;
  rating?: number;
  chapters?: SourceChapter[];
  totalPages?: number;
}

/** A single source / plugin. */
export interface SourceMeta {
  id: string;
  name: string;
  site: string;
  lang: string;
  version: string;
  url: string;
  iconUrl?: string;
  enabled?: boolean;
}

/** A novel's entry in the local library, augmented by reading progress. */
export interface LibraryNovel {
  id: string;
  sourceId: string;
  /** Source-site path identifying the novel on that source. */
  path: string;
  name: string;
  cover?: string;
  author?: string;
  artist?: string;
  genres?: string;
  summary?: string;
  status?: NovelStatus;
  rating?: number;
  /** Total known chapters on the source. */
  totalChapters?: number;
  addedAt: number;
  lastReadAt?: number;
  /** 0-100 progress of the whole novel. */
  progress: number;
  /** Index into the source chapter list of the last chapter read. */
  lastChapterIndex?: number;
  lastChapterTitle?: string;
  /** Chapter indices (into the source chapter list) marked as read. */
  readChapters?: number[];
  /** Within-chapter scroll progress (0-100) keyed by chapter index. */
  chapterProgress?: Record<string, number>;
  /** Custom user tags (e.g. reading / plan-to-read / completed). */
  tags: string[];
  /** ISO date of last source refresh. */
  refreshedAt?: number;
}

export interface ChapterContent {
  /** Sanitized HTML of the chapter body. */
  html: string;
  source: string;
}

export interface ChapterRef {
  sourceId: string;
  novelPath: string;
  chapterPath: string;
  index: number;
  name: string;
}

export interface Bookmark {
  id: string;
  novelId: string;
  chapterPath: string;
  chapterIndex: number;
  chapterTitle: string;
  /** A stable reference within the chapter, e.g. element index or text hash. */
  anchor?: string;
  note?: string;
  createdAt: number;
}

export interface HistoryEntry {
  novelId: string;
  /** Source plugin id (decoded). */
  sourceId: string;
  /** Source-site novel path (decoded). */
  novelPath: string;
  novelName: string;
  cover?: string;
  chapterTitle: string;
  chapterIndex: number;
  /** Within-chapter scroll progress (0-100) keyed by chapter index. */
  chapterProgress?: Record<string, number>;
  /** Chapter indices marked as read. */
  readChapters?: number[];
  totalChapters?: number;
  /** Whole-novel progress 0-100 (derived, capped below 100 until the end). */
  progress?: number;
  /** When the novel was last read. */
  at: number;
}
