/**
 * Build a filter function for .svelte files with include/exclude patterns.
 */
import { createFilter } from 'vite';

export function buildIdFilter(include: RegExp[], exclude: RegExp[]): (id: string) => boolean {
  return createFilter(include, exclude);
}

/**
 * Check if an ID should be processed for svelte-devtools injection.
 * This mirrors the pattern from @sveltejs/vite-plugin-svelte's id parser.
 */
export function shouldProcessSvelte(id: string, filter: (id: string) => boolean): boolean {
  if (/\.svelte-kit\/generated/.test(id)) return false;
  return filter(id);
}
