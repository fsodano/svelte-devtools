import type { Plugin, EnvironmentOptions, ConfigEnv } from 'vite';
import type { PluginAPI } from '../types.js';

/**
 * Creates an optimizer sub-plugin that registers the devtools transform
 * for pre-bundled Svelte libraries. This ensures $inspect injection
 * works on Svelte component libraries during Vite's dependency pre-bundling.
 *
 * Follows the pattern from @sveltejs/vite-plugin-svelte's setup-optimizer.
 */
export function optimizer(api: PluginAPI): Plugin {
  return {
    name: 'svelte-devtools:optimizer',
    apply: 'serve',

    configEnvironment(name: string, config: EnvironmentOptions, _env: ConfigEnv) {
      if (name !== 'client') return;

      const optimizeDeps = (config as Record<string, unknown>).optimizeDeps as Record<string, unknown> ?? {};
      const rolldownOptions = (optimizeDeps.rolldownOptions as Record<string, unknown>) ?? {};

      let plugins = (rolldownOptions.plugins as Plugin[]) ?? [];
      plugins = plugins.concat({
        name: 'svelte-devtools:optimize-deps',
        enforce: 'pre',
        transform: {
          filter: { id: /\.svelte$/ },
          handler() { return null; },
        },
      });

      (rolldownOptions as Record<string, unknown>).plugins = plugins;
      (optimizeDeps as Record<string, unknown>).rolldownOptions = rolldownOptions;
      (config as Record<string, unknown>).optimizeDeps = optimizeDeps;
    },

    buildStart() {
      api.componentRegistry.clear();
    },
  };
}
