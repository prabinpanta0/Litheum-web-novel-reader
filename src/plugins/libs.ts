/**
 * Browser-safe LMReader (`@libs/...`) shims used when executing a
 * remote plugin bundle inside a sandboxed CommonJS module.
 *
 * A compiled plugin is a CJS file that `require()`s the aliased
 * libraries below. We provide each of them; the one object every
 * loader must honour is `fetchApi`, whose network behaviour we can
 * route through a dev proxy for sites that refuse CORS.
 */

import * as cheerio from 'cheerio';

export const defaultCover =
  'https://github.com/LNReader/lnreader-plugins/blob/main/icons/src/coverNotAvailable.jpg?raw=true';

export const NovelStatus = {
  Unknown: 'Unknown',
  Ongoing: 'Ongoing',
  Completed: 'Completed',
  Licensed: 'Licensed',
  PublishingFinished: 'Publishing Finished',
  Cancelled: 'Cancelled',
  OnHiatus: 'On Hiatus',
  STUB: 'STUB',
  Inactive: 'Inactive',
} as const;

export type FetchInit = RequestInit & {
  headers?:
    Record<string, string | undefined> | Headers | string[][] | undefined;
};

/** Return a Response-shaped object whose URLs are routed via `fetcher`. */
export type Fetcher = (url: string, init?: FetchInit) => Promise<Response>;

export interface FetchApiOptions {
  /** Route remote requests through a proxy (e.g. `/https:<url>`). */
  proxy?: (url: string) => string;
}

const defaultHeaders: Record<string, string> = {
  Connection: 'keep-alive',
  Accept: '*/*',
  'Accept-Language': '*',
  'Sec-Fetch-Mode': 'cors',
  'Accept-Encoding': 'gzip, deflate',
};

function mergeInit(init?: FetchInit): RequestInit {
  const merged: RequestInit = { ...init };
  const existing = init?.headers;
  if (existing instanceof Headers) {
    const h = new Headers(existing);
    for (const [name, value] of Object.entries(defaultHeaders)) {
      if (!h.get(name)) h.set(name, value);
    }
    merged.headers = h;
  } else if (existing) {
    merged.headers = {
      ...defaultHeaders,
      ...(existing as Record<string, string>),
    };
  } else {
    merged.headers = { ...defaultHeaders };
  }
  return merged;
}

/**
 * Build a `@libs/fetch` module object. The `fetcher` decides whether
 * a request is sent straight to the origin or through the proxy.
 */
export function buildFetchLib(fetcher: Fetcher): Record<string, unknown> {
  const fetchApi = async (url: string, init?: FetchInit) =>
    fetcher(url, mergeInit(init));

  const fetchText = async (
    url: string,
    init?: FetchInit,
    encoding?: string
  ) => {
    try {
      const res = await fetcher(url, mergeInit(init));
      if (!res.ok) return '';
      const buf = await res.arrayBuffer();
      return new TextDecoder(encoding).decode(buf);
    } catch {
      return '';
    }
  };

  const fetchFile = async (url: string, init?: FetchInit) => {
    try {
      const res = await fetcher(url, mergeInit(init));
      if (!res.ok) return '';
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++)
        bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    } catch {
      return '';
    }
  };

  // fetchProto is rarely used; provide a stub that raises a clear error.
  const fetchProto = async () => {
    throw new Error(
      'fetchProto requires protobuf encoding and is not supported by Litheum yet.'
    );
  };

  return { fetchApi, fetchText, fetchFile, fetchProto };
}

/** Build the full set of module exports a plugin may `require()`. */
export function buildPluginLibs(fetcher: Fetcher): Record<string, unknown> {
  const fetchLib = buildFetchLib(fetcher);

  const storage = (() => {
    const db = new Map<
      string,
      { created: Date; value: unknown; expires?: number }
    >();
    return {
      set: (key: string, value: unknown, expires?: Date | number) => {
        db.set(key, {
          created: new Date(),
          value,
          expires: expires instanceof Date ? expires.getTime() : expires,
        });
      },
      get: <T = unknown>(key: string, raw?: boolean): T | undefined => {
        const item = db.get(key) as
          { created: Date; value: T; expires?: number } | undefined;
        if (item?.expires && Date.now() > item.expires) {
          db.delete(key);
          return undefined;
        }
        return raw ? (item as unknown as T) : item?.value;
      },
      getAllKeys: () => Array.from(db.keys()),
      delete: (key: string) => void db.delete(key),
      clearAll: () => db.clear(),
    };
  })();

  const localStorageShim = {
    get: () => undefined,
  };

  return {
    // Some compiled bundles reference LNReader's repo-internal aliases
    // (e.g. `@/types/constants`) instead of the older `@libs/*` paths.
    // Provide the shared values those plugins import at runtime.
    '@/types/constants': {
      NovelStatus,
      defaultCover,
    },
    '@libs/fetch': fetchLib,
    '@libs/storage': {
      storage,
      localStorage: localStorageShim,
      sessionStorage: localStorageShim,
    },
    '@libs/novelStatus': { NovelStatus },
    '@libs/defaultCover': { defaultCover },
    '@libs/isAbsoluteUrl': {
      isUrlAbsolute: (url: string) => /^https?:\/\//i.test(url),
    },
    '@libs/utils': {
      isUrlAbsolute: (url: string) => /^https?:\/\//i.test(url),
    },
    '@libs/filterInputs': {
      FilterTypes: {
        TextInput: 'TextInput',
        Picker: 'Picker',
        CheckboxGroup: 'CheckboxGroup',
        Switch: 'Switch',
        ExcludableCheckboxGroup: 'ExcludableCheckboxGroup',
      },
    },
    cheerio,
    dayjs: makeDayjs(),
  };
}

/** Minimal dayjs shim covering the operations sources actually use. */
function makeDayjs() {
  class D {
    private ms: number;
    constructor(input?: Date | string | number) {
      if (input instanceof Date) this.ms = input.getTime();
      else if (typeof input === 'string') {
        const t = Date.parse(input);
        this.ms = isNaN(t) ? Date.now() : t;
      } else if (typeof input === 'number') this.ms = input;
      else this.ms = Date.now();
    }
    private d() {
      return new Date(this.ms);
    }
    subtract(num: number, unit: string) {
      const date = this.d();
      switch (unit) {
        case 'second':
        case 'seconds':
          date.setSeconds(date.getSeconds() - num);
          break;
        case 'minute':
        case 'minutes':
          date.setMinutes(date.getMinutes() - num);
          break;
        case 'hour':
        case 'hours':
          date.setHours(date.getHours() - num);
          break;
        case 'day':
        case 'days':
          date.setDate(date.getDate() - num);
          break;
        case 'week':
        case 'weeks':
          date.setDate(date.getDate() - num * 7);
          break;
        case 'month':
        case 'months':
          date.setMonth(date.getMonth() - num);
          break;
        case 'year':
        case 'years':
          date.setFullYear(date.getFullYear() - num);
          break;
      }
      return new D(date);
    }
    format(fmt?: string) {
      if (fmt === 'LL') {
        return this.d().toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      return this.d().toString();
    }
    toDate() {
      return this.d();
    }
  }
  const dayjs = (input?: Date | string | number) => new D(input);
  dayjs.extend = () => dayjs;
  return dayjs;
}
