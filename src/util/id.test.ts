import { describe, it, expect } from 'vitest';
import type { LibraryNovel } from '@/types';
import { novelRoute, readerRoute, parseRouteSegment, initials } from './id';
import { computeTotals, formatDuration } from './stats';

describe('id helpers', () => {
  it('builds a novel route with encoded segments', () => {
    expect(novelRoute('madara-1stkiss', 'novel/hello world')).toBe(
      '/novel/madara-1stkiss/novel%2Fhello%20world'
    );
  });

  it('builds a reader route with source, path and chapter index', () => {
    expect(readerRoute('src', 'a/b', 3)).toBe('/read/src/a%2Fb/3');
  });

  it('decodes a route segment', () => {
    expect(parseRouteSegment('a%2Fb')).toBe('a/b');
    expect(parseRouteSegment(undefined)).toBe('');
    expect(parseRouteSegment('%')).toBe('%');
  });

  it('derives initials from a name', () => {
    expect(initials('The Perfect Run')).toBe('TR');
    expect(initials('LitRPG')).toBe('LI');
    expect(initials('')).toBe('?');
  });
});

describe('stats helpers', () => {
  it('counts finished, in progress and unread', () => {
    const totals = computeTotals([
      // Completed shelf, partially read → finished (and started).
      {
        name: 'a',
        totalChapters: 10,
        lastChapterIndex: 2,
        readChapters: [0, 1, 2],
        tags: ['shelf:completed'],
      },
      // Reading shelf, started but not finished → in progress.
      {
        name: 'b',
        totalChapters: 10,
        lastChapterIndex: 2,
        readChapters: [0, 1, 2],
        tags: ['shelf:reading'],
      },
      // Fully read but never shelved → finished by completion.
      {
        name: 'c',
        totalChapters: 5,
        lastChapterIndex: 4,
        readChapters: [0, 1, 2, 3, 4],
      },
      // Untouched plan-to-read → not started at all.
      { name: 'd', tags: ['shelf:plan'] },
    ] as Partial<LibraryNovel>[] as LibraryNovel[]);
    expect(totals).toMatchObject({
      total: 4,
      finished: 2,
      inProgress: 1,
      started: 3,
      chaptersRead: 11,
      unreadChapters: 14,
    });
  });

  it('formats durations readably', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45 * 60000)).toBe('45m');
    expect(formatDuration(90 * 60000)).toBe('1h 30m');
    expect(formatDuration(3600 * 60000)).toBe('60h 0m');
  });
});
