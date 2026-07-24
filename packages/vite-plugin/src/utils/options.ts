import path from 'path';
import type { SvelteDevToolsPluginOptions } from '@svelte-devtools/types';

export const DEVTOOLS_PREFIX = '/__svelte-devtools';

export function getStableId(id: string, root: string): string {
  const relPath = path.relative(root, id);
  let hash = 0;
  for (let i = 0; i < relPath.length; i++) {
    hash = ((hash << 5) - hash) + relPath.charCodeAt(i);
    hash |= 0;
  }
  return `svt-${Math.abs(hash).toString(36)}`;
}

export function resolveOptions(root: string, options: SvelteDevToolsPluginOptions = {}) {
  const {
    exclude = [/node_modules/],
    include = [/\.svelte$/],
    enableStateInspection = true,
  } = options;

  return {
    root,
    include,
    exclude,
    enableStateInspection,
    isDebug: process.env.SVELTE_DEVTOOLS_DEBUG === 'true',
  };
}
