import type { SourceMeta } from '@/types';

/**
 * The LLMReader-compatible source registry.
 *
 * A repository is a list of source descriptors; each source points at a
 * compiled plugin bundle served as a static `.js` file. We store the
 * registry plus installed bundles in IndexedDB so the library works
 * offline once installed.
 */

export interface Repository {
  id: string;
  name: string;
  /** Where the plugin index JSON lives. */
  url: string;
}

export interface InstalledPlugin {
  meta: SourceMeta;
  /** The raw plugin module (CommonJS) source. */
  code: string;
  installedAt: number;
}

/** Source-side adapts entries from any plugin registry into SourceMeta. */
export function normalizeEntry(
  raw: Record<string, unknown>
): SourceMeta | null {
  const id = String(raw.id ?? '');
  const name = String(raw.name ?? '');
  if (!id || !name) return null;
  return {
    id,
    name,
    site: String(raw.site ?? ''),
    lang: String(raw.lang ?? 'Unknown'),
    version: String(raw.version ?? '0'),
    url: String(raw.url ?? ''),
    iconUrl: String(raw.iconUrl ?? raw.icon ?? ''),
  };
}

/**
 * Fetch a repository index and return its plugin descriptors.
 * Supports the plain JSON array format of the LMReader registry.
 */
export async function fetchRepository(
  url: string
): Promise<{ repo: Repository; sources: SourceMeta[] }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Repository request failed (${res.status})`);
  }
  const json = await res.json();
  const rawList: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.plugins)
      ? json.plugins
      : [];
  const sources: SourceMeta[] = rawList
    .map((entry): SourceMeta | null =>
      normalizeEntry((entry ?? {}) as Record<string, unknown>)
    )
    .filter((s): s is SourceMeta => s !== null);
  return {
    repo: { id: nameToId(url), name: url.split('/').slice(-2)[0] ?? url, url },
    sources,
  };
}

export function nameToId(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `repo:${(h >>> 0).toString(36)}`;
}

/** Download and install a single plugin (the compiled module source). */
export async function installPlugin(
  meta: SourceMeta
): Promise<InstalledPlugin> {
  const res = await fetch(meta.url);
  if (!res.ok)
    throw new Error(`Failed to download ${meta.name} (${res.status})`);
  const code = await res.text();
  return { meta, code, installedAt: Date.now() };
}
