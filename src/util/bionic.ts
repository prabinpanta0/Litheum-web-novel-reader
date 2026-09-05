/**
 * Bionic reading transform.
 *
 * Bolds the leading letters of every word so the eye can scan faster. Runs on
 * already-sanitized chapter HTML; only wraps letters in `<b>` (no markup that
 * could change structure is introduced). Falls back to the input unchanged
 * when no DOM is available.
 */

export function bionicifyHtml(html: string, lead = 2): string {
  if (!html || typeof document === 'undefined') return html;
  const host = document.createElement('div');
  host.innerHTML = html;

  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        // Skip pure-whitespace and punctuation-only nodes entirely.
        if (!/[^\s]/.test(text) || !/[A-Za-z0-9]/.test(text)) continue;
        const tokens = text.split(/(\s+)/);
        if (tokens.every((t) => /^\s*$/.test(t))) continue;
        const frag = document.createDocumentFragment();
        for (const token of tokens) {
          if (/^\s+$/.test(token)) {
            frag.appendChild(document.createTextNode(token));
            continue;
          }
          const match = /^([^A-Za-z0-9]*)([\s\S]*)$/.exec(token);
          const prefix = match?.[1] ?? '';
          const body = match?.[2] ?? token;
          if (!body) {
            frag.appendChild(document.createTextNode(token));
            continue;
          }
          const n = Math.min(lead, body.length);
          const b = document.createElement('b');
          b.className = 'bionic-lead';
          b.textContent = body.slice(0, n);
          if (prefix) frag.appendChild(document.createTextNode(prefix));
          frag.appendChild(b);
          frag.appendChild(document.createTextNode(body.slice(n)));
        }
        if (child.parentNode) child.parentNode.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };

  walk(host);
  return host.innerHTML;
}
