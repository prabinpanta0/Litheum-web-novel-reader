import { buildPluginLibs, type Fetcher } from './libs';

/**
 * A compiled LMReader plugin is a CommonJS module that `require()`s the
 * `@libs/...` aliases and `cheerio`/`dayjs`. Executing it requires a
 * small CommonJS harness with those modules injected. We run it inside
 * a `Function` closure (the standard approach used by source readers
 * for third-party plugins) rather than `eval`, so each plugin gets an
 * isolated scope.
 */

export interface SandboxModule {
  exports: unknown;
  id: string;
  filename: string;
  loaded: boolean;
}

export function executePluginBundle(
  code: string,
  id: string,
  fetcher: Fetcher
): unknown {
  const libs = buildPluginLibs(fetcher);
  const module: SandboxModule = {
    exports: {},
    id,
    filename: id,
    loaded: false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exportsObj: Record<string, unknown> = module.exports as any;

  const customRequire = (name: string): unknown => {
    if (name in libs) return libs[name];
    // Some bundles import cheerio / dayjs with a default interop wrapper.
    if (name === 'cheerio') return libs['cheerio'];
    if (name === 'dayjs') return libs['dayjs'];
    throw new Error(`[plugin:${id}] unknown require: ${name}`);
  };

  // The bundle is an anonymous function; wrap it and invoke it with the
  // CommonJS globals it expects, passing `process`/`Buffer` through to the
  // closure so plugin top-level code can reference them.
  const body = `(function (module, exports, require, process, Buffer) {
    ${code}
  })(module, exports, require, process, Buffer)`;

  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'module',
    'exports',
    'require',
    'process',
    'Buffer',
    body
  ) as (
    module: SandboxModule,
    exports: Record<string, unknown>,
    require: (n: string) => unknown,
    process: unknown,
    Buffer: unknown
  ) => void;

  const processShim = {
    env: {},
    browser: true,
    platform: 'browser',
    version: '',
  };
  const bufferShim = {
    from: (data: Uint8Array | string, _encoding?: string) => {
      const bytes =
        typeof data === 'string' ? new TextEncoder().encode(data) : data;
      let bin = '';
      for (let i = 0; i < bytes.length; i++)
        bin += String.fromCharCode(bytes[i]);
      return { toString: () => btoa(bin) };
    },
    isBuffer: () => false,
  };

  fn(module, exportsObj, customRequire, processShim, bufferShim);
  module.loaded = true;

  return module.exports;
}
