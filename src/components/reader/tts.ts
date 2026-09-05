/**
 * Pure text helpers for the read-aloud (TTS) engine. Kept dependency-free
 * and unit-tested; the speech side lives in `ReaderTTS.tsx`.
 */

/** Split a block of text into sentences, keeping punctuation. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Split a block of text into speech-sized chunks (sentences, further split at
 * word boundaries beyond `max` chars). Some speech engines stall or truncate
 * very long utterances, so keeping each utterance short is more reliable.
 */
export function chunkText(text: string, max = 160): string[] {
  const out: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (sentence.length <= max) {
      out.push(sentence);
      continue;
    }
    let cur = '';
    for (const word of sentence.split(' ')) {
      if ((cur + ' ' + word).trim().length > max) {
        if (cur) out.push(cur.trim());
        cur = word;
      } else {
        cur = cur ? `${cur} ${word}` : word;
      }
    }
    if (cur) out.push(cur.trim());
  }
  return out;
}

export interface Paragraph {
  /** Plain text of the paragraph (for speech). */
  text: string;
  /** Semantic heading level (0 = body paragraph, 1–3 = heading level). */
  level: number;
}

const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
]);
const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/**
 * Flatten sanitized chapter HTML into a speech-friendly paragraph list.
 * Requires a DOM (runs in the browser); the sanitized HTML has no scripts
 * so this is safe.
 */
export function htmlToParagraphs(html: string): Paragraph[] {
  const host = document.createElement('div');
  host.innerHTML = html;
  const paragraphs: Paragraph[] = [];
  walk(host, 0);
  return paragraphs;

  function walk(node: Node, inheritedLevel: number): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? '').trim();
        if (text) paragraphs.push({ text, level: inheritedLevel });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as HTMLElement;
      const tag = el.tagName;
      if (BLOCK_TAGS.has(tag)) {
        const text = (el.textContent ?? '').trim();
        if (text)
          paragraphs.push({
            text,
            level: HEADING_TAGS.has(tag) ? Number(tag[1]) : inheritedLevel,
          });
        continue;
      }
      // Inline/spans/links: recurse to collect their text at the current level.
      if (el.textContent) walk(child, inheritedLevel);
    }
  }
}

/** True when the platform exposes a working speech synthesis API. */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
