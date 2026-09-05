import DOMPurify from 'dompurify';

/**
 * Sanitize raw chapter HTML returned by a source for safe rendering.
 * We keep the semantic structure (headings, paragraphs, lists, images,
 * text) but strip scripts, event handlers, and styles so the source's
 * presentation can never leak into the reading chrome.
 */
export function sanitizeChapterHtml(raw: string): string {
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'style',
      'script',
      'iframe',
      'form',
      'input',
      'button',
      'svg',
      'video',
      'audio',
    ],
    FORBID_ATTR: [
      'style',
      'onerror',
      'onclick',
      'onload',
      'onmouseover',
      'href',
      'srcset',
      'class',
      'id',
    ],
    ALLOWED_ATTR: ['src', 'alt', 'title'],
  });
}
