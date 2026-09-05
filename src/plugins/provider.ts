import { executePluginBundle } from './sandbox';
import type { Fetcher } from './libs';
import type {
  SourceChapter,
  SourceNovelDetail,
  SourceNovelItem,
} from '@/types';

/**
 * Normalized access to an installed source plugin.
 *
 * A compiled plugin exports a singleton instance of a class whose
 * surface matches the LMReader `Plugin.PluginBase` contract. We reach
 * it through the module's `default`/named exports regardless of how the
 * author structured the file, and adapt its results onto our domain
 * types so the rest of the app never depends on plugin internals.
 */

export interface SourcePlugin {
  readonly id: string;
  readonly name: string;
  readonly site: string;
  readonly icon: string;
  readonly version: string;
  /** Fetch driver used by this source (browser fetch, optional proxy). */
  popularNovels(pageNo?: number): Promise<SourceNovelItem[]>;
  searchNovels(query: string, pageNo?: number): Promise<SourceNovelItem[]>;
  getNovel(path: string): Promise<SourceNovelDetail>;
  getChapter(path: string): Promise<string>;
}

export interface PluginRuntime {
  /** Build a normalized source from an installed bundle. */
  mount(installedCode: string, options: { proxy?: Fetcher }): SourcePlugin;
}

function resolveDefault(exportsObj: unknown): unknown {
  if (!exportsObj || typeof exportsObj !== 'object') return exportsObj;
  const obj = exportsObj as Record<string, unknown>;
  if (obj.default) return obj.default;
  // Some single-file plugins export their instance directly.
  const keys = Object.keys(obj);
  if (keys.length === 1) return obj[keys[0]];
  return obj;
}

export class PluginRuntimeImpl implements PluginRuntime {
  mount(installedCode: string, options: { proxy?: Fetcher }): SourcePlugin {
    const moduleExports = executePluginBundle(
      installedCode,
      'source',
      options.proxy ?? ((url, init) => fetch(url, init))
    );
    const instance = resolveDefault(moduleExports) as
      Record<string, unknown> | undefined;

    const id = String(instance?.id ?? '');
    const name = String(instance?.name ?? 'Source');
    const site = String(instance?.site ?? '');
    const icon = String(instance?.icon ?? '');
    const version = String(instance?.version ?? '');

    if (typeof instance === 'object' && instance === null) {
      throw new Error(
        `Plugin ${id || 'unknown'} did not export a usable instance.`
      );
    }
    if (
      typeof (instance as Record<string, unknown> | undefined)?.parseChapter !==
      'function'
    ) {
      throw new Error(
        `Plugin ${id || 'unknown'} is missing parseChapter; it may be incompatible with this reader.`
      );
    }

    const call = <T>(method: string, ...args: unknown[]): Promise<T> => {
      const fn = (instance as Record<string, unknown>)[method];
      if (typeof fn !== 'function') {
        return Promise.reject(
          new Error(`Source "${name}" does not support ${method}.`)
        );
      }
      return fn.apply(instance, args);
    };

    return {
      id,
      name,
      site,
      icon,
      version,
      async popularNovels(pageNo = 1) {
        const list = await call<unknown>('popularNovels', pageNo, {
          filters: undefined,
        });
        return ((list ?? []) as Record<string, unknown>[]).map(mapNovelItem);
      },
      async searchNovels(query, pageNo = 1) {
        const list = await call<unknown>('searchNovels', query, pageNo);
        return ((list ?? []) as Record<string, unknown>[]).map(mapNovelItem);
      },
      async getNovel(path) {
        const raw = await call<unknown>('parseNovel', path);
        return mapNovelDetail((raw ?? {}) as Record<string, unknown>);
      },
      async getChapter(path) {
        const html = await call<string>('parseChapter', path);
        return String(html ?? '');
      },
    };
  }
}

function mapNovelItem(raw: Record<string, unknown>): SourceNovelItem {
  return {
    name: String(raw.name ?? 'Untitled'),
    path: String(raw.path ?? ''),
    cover: raw.cover != null ? String(raw.cover) : undefined,
  };
}

function mapNovelDetail(raw: Record<string, unknown>): SourceNovelDetail {
  const item = mapNovelItem(raw);
  return {
    ...item,
    genres: raw.genres != null ? String(raw.genres) : undefined,
    summary: raw.summary != null ? String(raw.summary) : undefined,
    author: raw.author != null ? String(raw.author) : undefined,
    artist: raw.artist != null ? String(raw.artist) : undefined,
    status:
      raw.status != null
        ? (String(raw.status) as SourceNovelDetail['status'])
        : undefined,
    rating: raw.rating != null ? Number(raw.rating) : undefined,
    totalPages: raw.totalPages != null ? Number(raw.totalPages) : undefined,
    chapters: Array.isArray(raw.chapters)
      ? (raw.chapters as Record<string, unknown>[]).map(mapChapter)
      : undefined,
  };
}

function mapChapter(raw: Record<string, unknown>): SourceChapter {
  return {
    name: String(raw.name ?? 'Chapter'),
    path: String(raw.path ?? ''),
    releaseTime: raw.releaseTime != null ? String(raw.releaseTime) : undefined,
    chapterNumber:
      raw.chapterNumber != null ? Number(raw.chapterNumber) : undefined,
    page: raw.page != null ? String(raw.page) : undefined,
  };
}
