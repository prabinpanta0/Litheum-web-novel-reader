// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeChapterHtml } from './sanitize';

describe('sanitizeChapterHtml', () => {
  it('strips scripts and event handlers', () => {
    const out = sanitizeChapterHtml(
      '<p onclick="steal()">Hello <script>alert(1)</script></p>'
    );
    expect(out).not.toContain('script');
    expect(out).not.toContain('onclick');
    expect(out).toContain('Hello');
  });

  it('strips style tags and style attributes', () => {
    const out = sanitizeChapterHtml(
      '<style>body{display:none}</style><p style="color:red">Keep</p>'
    );
    expect(out).not.toContain('display:none');
    expect(out).not.toContain('color:red');
    expect(out).toContain('Keep');
  });

  it('keeps semantic content and safe image sources', () => {
    const out = sanitizeChapterHtml(
      '<h2>Title</h2><p><img src="https://x/i.png" alt="i"></p>'
    );
    expect(out).toContain('<h2>Title</h2>');
    expect(out).toContain('src="https://x/i.png"');
  });
});
