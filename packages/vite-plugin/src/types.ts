import type { ResolvedConfig, ViteDevServer } from 'vite';
import type { ComponentMeta, SvelteDevToolsPluginOptions } from '@svelte-devtools/types';

export interface ResolvedOptions {
  root: string;
  include: RegExp[];
  exclude: RegExp[];
  enableStateInspection: boolean;
  isDebug: boolean;
}

export interface PluginAPI {
  options: ResolvedOptions | null;
  filter: ((id: string) => boolean) | null;
  root: string;
  config: ResolvedConfig | null;
  server: ViteDevServer | null;
  componentRegistry: Map<string, ComponentMeta>;
  logsApi: Record<string, (arg: unknown) => unknown> | null;
  markSeenTimestamps: Map<string, number>;
  batchTimer: ReturnType<typeof setTimeout> | null;
  hasSvelteKit: boolean;
  isDebug: boolean;
}

export function createPluginAPI(): PluginAPI {
  return {
    options: null,
    filter: null,
    root: process.cwd(),
    config: null,
    server: null,
    componentRegistry: new Map(),
    logsApi: null,
    markSeenTimestamps: new Map(),
    batchTimer: null,
    hasSvelteKit: false,
    isDebug: process.env.SVELTE_DEVTOOLS_DEBUG === 'true',
  };
}
