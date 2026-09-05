import type { Connect, Plugin } from 'vite';
import * as zlib from 'node:zlib';
import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';

/**
 * Same-origin content proxy for the Vite dev server.
 *
 * LNReader sources do not send CORS headers, so the browser cannot read
 * their HTML. We expose a proxy route, `/https:<url>`, that performs the
 * request server-side and streams the (decompressed) response back to the
 * browser. This mirrors the proxy the LNReader web app ships and keeps the
 * reader dependency-free: no separate backend is required during `dev`.
 */

type ConnectHandler = NonNullable<Connect.NextHandleFunction> & {
  (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: Connect.NextFunction
  ): void;
};

const disallowedResponseHeaders = [
  'link',
  'set-cookie',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'upgrade',
];

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decodePayload(chunk: Buffer, encoding?: string): Buffer {
  switch ((encoding ?? '').toLowerCase()) {
    case 'gzip':
      return zlib.gunzipSync(chunk);
    case 'deflate':
      try {
        return zlib.inflateSync(chunk);
      } catch {
        return zlib.inflateRawSync(chunk);
      }
    case 'br':
      return zlib.brotliDecompressSync(chunk);
    default:
      return chunk;
  }
}

type HeaderValue = string | string[] | undefined;

function fetchOnce(
  targetUrl: string,
  method: string,
  headers: Record<string, HeaderValue>
): Promise<http.IncomingMessage> {
  const url = new URL(targetUrl);
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;

  const headersObj: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: '*/*',
    'accept-language': '*',
    connection: 'keep-alive',
    'sec-fetch-mode': 'cors',
    // Ask only for gzip so we can always decode. NovelBuddy (and others)
    // otherwise negotiate `zstd`/`br`, which the browser fetch on the
    // receiving side can't decode because we've already removed the
    // content-encoding header.
    'accept-encoding': 'gzip',
  };
  Object.entries(headers).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    if (
      headersObj[lower] === undefined &&
      !['host', 'origin', 'referer'].includes(lower) &&
      value !== undefined
    ) {
      headersObj[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  });
  headersObj['user-agent'] = USER_AGENT;

  return new Promise((resolve, reject) => {
    const req = mod.request(url, { method, headers: headersObj }, (res) =>
      resolve(res)
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch a URL, following server-side redirects (301/302/303/307/308) up to
 * a bounded number of hops. Sources frequently redirect old domains or
 * slugs (e.g. NovelBuddy `novelbuddy.com` -> `novelbuddy.me`); returning a
 * bare 3xx to the browser would leave plugin fetchers with an empty body.
 */
function fetchRemote(
  targetUrl: string,
  method: string,
  headers: Record<string, HeaderValue>
): Promise<http.IncomingMessage> {
  const MAX_REDIRECTS = 5;

  const follow = (url: string, hops: number): Promise<http.IncomingMessage> =>
    fetchOnce(url, method, headers).then((res) => {
      const status = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && hops > 0) {
        const location = res.headers['location'];
        if (location) {
          // Drain the redirect response body so the socket can be reused.
          res.resume();
          const next = new URL(location, url).toString();
          return follow(next, hops - 1);
        }
      }
      return res;
    });

  return follow(targetUrl, MAX_REDIRECTS);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterSeconds(upRes: http.IncomingMessage): number | undefined {
  const value = upRes.headers['retry-after'];
  if (Array.isArray(value)) return parseFloat(value[0]);
  if (value === undefined) return undefined;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function makeProxyHandler(): ConnectHandler {
  return (req, res, next) => {
    const rawPath = req.url ?? '';
    if (!rawPath.startsWith('/https:')) {
      next();
      return;
    }

    const encoded = rawPath.slice('/https:'.length);
    let targetUrl: string;
    try {
      targetUrl = decodeURIComponent(encoded);
    } catch {
      targetUrl = encoded;
    }

    void (async () => {
      try {
        const method = (req.method ?? 'GET').toUpperCase();

        // Upstreams occasionally shed load with a retryable 503/429 and
        // a `retry-after` hint (NovelBuddy's API does). Retry once so a
        // transient spike doesn't surface as a broken fetch. GETs are
        // idempotent; POSTs are never replayed.
        const retryableStatus = (code?: number) => code === 503 || code === 429;
        let upRes = await fetchRemote(targetUrl, method, req.headers);
        if (method === 'GET' && retryableStatus(upRes.statusCode)) {
          const waitSec = Math.min(retryAfterSeconds(upRes) ?? 2, 5);
          upRes.resume();
          await wait(waitSec * 1000);
          upRes = await fetchRemote(targetUrl, method, req.headers);
        }

        res.statusCode = upRes.statusCode ?? 200;
        for (const [name, value] of Object.entries(upRes.headers)) {
          if (value === undefined || disallowedResponseHeaders.includes(name))
            continue;
          res.setHeader(name as never, value as never);
        }
        res.setHeader('access-control-allow-origin', '*');

        const encoding = upRes.headers['content-encoding'];
        const chunks: Buffer[] = [];
        upRes.on('data', (c: Buffer) => chunks.push(c));
        upRes.on('end', () => {
          const body = decodePayload(Buffer.concat(chunks), encoding);
          res.removeHeader('content-encoding');
          res.setHeader('content-length', Buffer.byteLength(body));
          res.end(body);
        });
        upRes.on('error', (err) => {
          res.statusCode = 502;
          res.end(String(err));
        });
      } catch (err) {
        res.statusCode = 502;
        res.end(String(err instanceof Error ? err.message : err));
      }
    })();
  };
}

export function litheumProxy(): Plugin {
  return {
    name: 'litheum-proxy',
    configureServer(server) {
      // Register on the root path rather than with a `/https:` mount prefix.
      // Connect only mounts a string path at `/` boundaries, so `/https:https%3A…`
      // (no slash right after the colon) would fall through without a match.
      // The handler itself gates on the `/https:` prefix and 404s the rest.
      server.middlewares.use(makeProxyHandler() as never);
    },
  };
}
