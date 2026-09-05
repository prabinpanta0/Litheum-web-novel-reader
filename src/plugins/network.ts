import type { FetchInit, Fetcher } from './libs';

/**
 * Fetcher used by the plugin sandbox.
 *
 * Remote novel sources do not send CORS headers, so a browser cannot
 * read their HTML directly. When running through the Vite dev server we
 * route requests through a same-origin proxy (`/https:<url>`) that
 * fetches server-side. The `proxy` flag selects this behaviour; when
 * `false` (or when direct access is acceptable) we hit the origin.
 */

export interface NetworkConfig {
  mode: 'proxy' | 'direct';
  proxyRoot?: string;
}

let network: NetworkConfig = { mode: 'direct' };

export function setNetwork(config: NetworkConfig) {
  network = config;
}

export function getNetwork() {
  return network;
}

export function proxify(url: string): string {
  const root = network.proxyRoot ?? '/https:';
  return `${root}${encodeURIComponent(url)}`;
}

/** The browser-side fetcher handed to plugins. */
export const proxyFetcher: Fetcher = (url, init) => {
  const mode = network.mode;
  const target =
    mode === 'proxy' && /^https?:\/\//i.test(url) ? proxify(url) : url;
  return (
    fetch as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  )(target, normalizeInit(init));
};

function normalizeInit(init?: FetchInit): RequestInit {
  if (!init) return {};
  const headers: HeadersInit =
    init.headers instanceof Headers
      ? init.headers
      : ((init.headers as Record<string, string> | undefined) ?? {});
  return {
    method: init.method,
    body: init.body as BodyInit | undefined,
    headers,
  };
}

/** Probe whether a URL is reachable directly (used to pick fetch mode). */
export async function probeDirect(
  url: string,
  timeoutMs = 4000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
