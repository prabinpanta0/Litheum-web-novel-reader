// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { splitSentences, chunkText, htmlToParagraphs } from './tts';

describe('splitSentences', () => {
  it('splits on sentence-ending punctuation', () => {
    expect(splitSentences('Hello world. This is two.')).toEqual([
      'Hello world.',
      'This is two.',
    ]);
  });

  it('handles question and exclamation marks and ellipses', () => {
    expect(splitSentences('Really? Yes! Hmm…')).toEqual([
      'Really?',
      'Yes!',
      'Hmm…',
    ]);
  });

  it('collapses whitespace and drops empties', () => {
    expect(splitSentences('  A   B.   ')).toEqual(['A B.']);
  });
});

describe('chunkText', () => {
  it('passes short sentences through untouched', () => {
    expect(chunkText('A short bit.')).toEqual(['A short bit.']);
  });

  it('splits long paragraphs at word boundaries up to the limit', () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = chunkText(text, 25);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
    expect(chunks.join(' ').replace(/ +/g, ' ')).toBe(text);
  });
});

describe('htmlToParagraphs', () => {
  it('extracts paragraphs and headings with levels', () => {
    const out = htmlToParagraphs(
      '<h2>Chapter</h2><p>First bit. Second bit.</p><p>Two.</p>'
    );
    expect(out).toEqual([
      { text: 'Chapter', level: 2 },
      { text: 'First bit. Second bit.', level: 0 },
      { text: 'Two.', level: 0 },
    ]);
  });
});
