import { useCallback, useRef } from 'react';
import { PluginRuntimeImpl, type SourcePlugin } from './provider';
import { proxyFetcher, setNetwork, type NetworkConfig } from './network';
import { useApp } from '@/store/AppProvider';

const runtime = new PluginRuntimeImpl();

/**
 * Layered caches for mounted plugin instances keyed by source id.
 * Mounting is cheap relative to network calls; we cache the resulting
 * `SourcePlugin` handles for the session.
 */
const instanceCache = new Map<string, SourcePlugin>();

/**
 * Ensure the network fetcher reflects the latest user selection, then
 * return a mounted source for the given installed plugin.
 */
export function mountSource(
  installedCode: string,
  config?: NetworkConfig
): SourcePlugin {
  if (config) setNetwork(config);
  return runtime.mount(installedCode, { proxy: proxyFetcher });
}

export function getMountedPlugin(id: string): SourcePlugin | undefined {
  return instanceCache.get(id);
}

export function cachePlugin(id: string, plugin: SourcePlugin) {
  instanceCache.set(id, plugin);
}

export function clearPluginCache() {
  instanceCache.clear();
}

/** React hook: build a map of mounted, enabled sources. */
export function useSources() {
  const { plugins } = useApp();
  const mounted = useRef<Map<string, SourcePlugin>>(new Map());

  const getSource = useCallback(
    (id: string): SourcePlugin | undefined => {
      const installed = plugins.installed[id];
      if (!installed) return undefined;
      const cached = mounted.current.get(id) ?? instanceCache.get(id);
      if (cached) return cached;
      try {
        const plugin = mountSource(installed.code);
        mounted.current.set(id, plugin);
        instanceCache.set(id, plugin);
        return plugin;
      } catch (err) {
        console.warn(`Failed to mount source ${id}`, err);
        return undefined;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plugins.installed]
  );

  return { getSource };
}
