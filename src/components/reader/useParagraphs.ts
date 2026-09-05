import { useMemo } from 'react';
import { htmlToParagraphs, type Paragraph } from './tts';

/**
 * Reusable hook: convert sanitized chapter HTML into a flat, speech- and
 * highlight-friendly paragraph list, memoized on the HTML string.
 */
export function useParagraphs(html: string): Paragraph[] {
  return useMemo(() => (html ? htmlToParagraphs(html) : []), [html]);
}
