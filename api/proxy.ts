/**
 * Same-origin content proxy for the Vercel deployment.
 *
 * The dev server proxies remote sources through `/https:<url>` (see
 * `vite/proxy.ts`). Vercel serves the app as a static site, so that route
 * would 404; instead the production client routes requests to this
 * function (`/api/proxy?url=<encoded>`), which performs the request
 * server-side and streams the (decompressed) response back to the browser.
 *
 * LNReader sources do not send CORS headers, so the browser cannot read
 * their HTML directly; fetching through our own origin sidesteps that.
 */

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Headers that must not travel between hops (hop-by-hop) or that we
// override ourselves on the upstream request.
const skipHeaders = new Set([
  'host',
  'origin',
  'referer',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailers',
  'proxy-connection',
  'accept-encoding',
]);

function buildHeaders(source: Headers): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
  };
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (skipHeaders.has(lower) || lower === 'user-agent') return;
    headers[key] = value;
  });
  return headers;
}

const retryableStatus = (code: number) => code === 503 || code === 429;

async function fetchWithRetry(
  target: string,
  init: RequestInit,
  method: string
): Promise<Response> {
  // Upstreams occasionally shed load with a retryable 503/429 and a
  // `retry-after` hint (NovelBuddy's API does). Retry once so a transient
  // spike doesn't surface as a broken fetch. GETs are idempotent; POSTs
  // are never replayed. The wait is capped to stay within function limits.
  let res = await fetch(target, init);
  if (method === 'GET' && retryableStatus(res.status)) {
    const retryAfter = parseFloat(res.headers.get('retry-after') ?? '');
    await res.body?.cancel();
    const waitSec = Number.isFinite(retryAfter) ? Math.min(retryAfter, 2) : 2;
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    res = await fetch(target, init);
  }
  return res;
}

function corsHeaders(): HeadersInit {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response(
        'Missing or invalid `url` query parameter.',
        { status: 400, headers: corsHeaders() }
      );
    }

    const method = request.method.toUpperCase();

    try {
      const init: RequestInit = {
        method,
        headers: buildHeaders(request.headers),
        redirect: 'follow',
      };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = await request.arrayBuffer();
      }

      const res = await fetchWithRetry(target, init, method);

      // `fetch` decodes compressed payloads transparently, so drop the
      // original encoding/content-length before streaming the body out.
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === 'content-encoding' || lower === 'content-length') return;
        headers[key] = value;
      });

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: { ...headers, ...corsHeaders() },
      });
    } catch (err) {
      return new Response(String(err instanceof Error ? err.message : err), {
        status: 502,
        headers: corsHeaders(),
      });
    }
  },
};