// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readStateOf, deriveProgress, isStarted } from './reads';
import type { HistoryEntry, LibraryNovel } from '@/types';

function historyEntry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    novelId: 'src:a-book',
    sourceId: 'src',
    novelPath: 'a-book',
    novelName: 'A Book',
    chapterTitle: 'Chapter 2',
    chapterIndex: 1,
    at: 1000,
    ...over,
  };
}

function libEntry(over: Partial<LibraryNovel> = {}): LibraryNovel {
  return {
    id: 'src:a-book',
    sourceId: 'src',
    path: 'a-book',
    name: 'A Book',
    addedAt: 0,
    progress: 0,
    tags: ['reading'],
    ...over,
  };
}

describe('deriveProgress', () => {
  it('counts chapters read plus the partial current chapter', () => {
    const progress = deriveProgress(
      {
        readChapters: [0, 1],
        chapterProgress: { '2': 50 },
        lastChapterIndex: 2,
      },
      10
    );
    expect(progress).toBe(25); // (2 + 0.5) / 10
  });

  it('caps below 100 until the final chapter completes', () => {
    expect(
      deriveProgress(
        {
          readChapters: [0, 1, 2],
          chapterProgress: { '3': 100 },
          lastChapterIndex: 3,
        },
        4
      )
    ).toBe(99);
  });
});

describe('readStateOf', () => {
  it('merges history and library reading state', () => {
    const h = historyEntry({
      chapterProgress: { '1': 40 },
      readChapters: [1],
      totalChapters: 5,
    });
    const lib = libEntry({ readChapters: [0], lastReadAt: 500 });
    const state = readStateOf([h], 'src:a-book', lib);
    expect(state.readChapters).toEqual([0, 1]);
    expect(state.chapterProgress).toEqual({ '1': 40 });
    expect(state.lastChapterIndex).toBe(1);
    expect(state.totalChapters).toBe(5);
    expect(state.novelName).toBe('A Book');
  });

  it('prefers the more recent history record for last position', () => {
    const h = historyEntry({ chapterIndex: 4, chapterTitle: 'Chapter 5' });
    const lib = libEntry({
      lastChapterIndex: 2,
      lastChapterTitle: 'Chapter 3',
    });
    const state = readStateOf([h], 'src:a-book', lib);
    expect(state.lastChapterIndex).toBe(4);
    expect(state.lastChapterTitle).toBe('Chapter 5');
  });
});

describe('isStarted', () => {
  it('is false for a never-read novel', () => {
    expect(isStarted(readStateOf([], 'src:a-book'))).toBe(false);
  });

  it('is true once any chapter has partial progress', () => {
    const h = historyEntry({ chapterProgress: { '0': 12 } });
    expect(isStarted(readStateOf([h], 'src:a-book'))).toBe(true);
  });
});
