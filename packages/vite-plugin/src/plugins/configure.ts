import type { Plugin, ResolvedConfig, EnvironmentOptions, ConfigEnv } from 'vite';
import type { PluginAPI, ResolvedOptions } from '../types.js';
import { resolveOptions, DEVTOOLS_PREFIX } from '../utils/options.js';
import { buildIdFilter } from '../utils/id.js';
import type { SvelteDevToolsPluginOptions } from '@svelte-devtools/types';
import fs from 'fs';
import path from 'path';

export function configure(api: PluginAPI, inlineOptions: SvelteDevToolsPluginOptions = {}): Plugin {
  return {
    name: 'svelte-devtools:configure',
    enforce: 'pre',
    apply: 'serve',

    configResolved(config: ResolvedConfig) {
      api.config = config;
      api.root = config.root;

      const options = resolveOptions(config.root, inlineOptions);
      api.options = options;
      api.filter = buildIdFilter(options.include, options.exclude);

      // Detect rolldown (Vite 8)
      const isRolldown = config.plugins.some(
        (p: { name?: string }) => p?.name?.includes('rolldown') || p?.name?.includes('vite:rolldown')
      );
      if (isRolldown) {
        console.log('\x1b[33m[Svelte DevTools] Detected rolldown (Vite 8). Using rolldown-compatible transform.\x1b[0m');
      }

      // Resolve tsconfig paths for SvelteKit alias support
      const tsconfigPath = path.resolve(api.root, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        try {
          const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
          const parsed = JSON.parse(tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''));
          if (parsed?.compilerOptions?.paths) {
            const aliases = parsed.compilerOptions.paths;
            for (const [alias, paths] of Object.entries(aliases)) {
              if (Array.isArray(paths) && paths.length > 0) {
                const aliasPath = path.resolve(api.root, paths[0].replace(/\/\*$/, ''));
                if (!config.resolve.alias) {
                  config.resolve.alias = [];
                }
                (config.resolve.alias as Array<{ find: string | RegExp; replacement: string }>).push({
                  find: alias,
                  replacement: aliasPath,
                });
              }
            }
          }
        } catch {
          // Ignore tsconfig parse errors
        }
      }

      // Detect SvelteKit
      const hasSvelteKit = config.plugins.some(
        (p: { name?: string }) => p?.name === 'vite-plugin-sveltekit'
      );
      api.hasSvelteKit = hasSvelteKit;

      if (hasSvelteKit && api.isDebug) {
        console.info(
          '[Svelte DevTools] SvelteKit detected — add to src/hooks.server.ts:\n' +
          '  import { dev } from \'$app/environment\';\n' +
          '  import { svelteDevToolsHandle, noopHandle } from \'@svelte-devtools/vite-plugin/sveltekit\';\n' +
          '  export const handle = dev ? svelteDevToolsHandle() : noopHandle();'
        );
      }
    },

    configEnvironment(name: string, config: EnvironmentOptions, _env: ConfigEnv) {
      // Add svelte condition for resolve (following vite-plugin-svelte pattern)
      const resolve = config.resolve as Record<string, unknown> | undefined;
      if (resolve) {
        const conditions = resolve.conditions as string[] | undefined;
        if (conditions) {
          if (!conditions.includes('svelte')) {
            conditions.push('svelte');
          }
        }
      }
    },
  };
}
