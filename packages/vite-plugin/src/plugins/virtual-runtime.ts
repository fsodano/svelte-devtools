import type { Plugin } from 'vite';
import type { PluginAPI } from '../types.js';
import { DEVTOOLS_PREFIX } from '../utils/options.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { getInitScript } from '@svelte-devtools/runtime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const VIRTUAL_RUNTIME_ID = 'virtual:svelte-devtools-runtime';
const RESOLVED_VIRTUAL_RUNTIME_ID = '\0' + VIRTUAL_RUNTIME_ID;

export function virtualRuntime(api: PluginAPI): Plugin {
  return {
    name: 'svelte-devtools:virtual-runtime',
    apply: 'serve',
    enforce: 'post',

    resolveId(id: string) {
      if (id === VIRTUAL_RUNTIME_ID) {
        return RESOLVED_VIRTUAL_RUNTIME_ID;
      }
      return null;
    },

    load(id: string) {
      if (id !== RESOLVED_VIRTUAL_RUNTIME_ID) return null;

      // Resolve runtime dist path
      let runtimeDistPath: string;
      try {
        runtimeDistPath = path.resolve(
          path.dirname(require.resolve('@svelte-devtools/runtime/package.json')),
          'dist'
        );
      } catch {
        // dirname is packages/vite-plugin/dist/plugins/ (built) or src/plugins/ (source)
        // ../../../ from there reaches the packages/ directory
        runtimeDistPath = path.resolve(__dirname, '../../../runtime/dist');
      }

      const runtimeFile = path.join(runtimeDistPath, 'index.js');
      if (fs.existsSync(runtimeFile)) {
        const code = fs.readFileSync(runtimeFile, 'utf-8');
        return { code, map: null };
      }

      // Fallback: dynamically import via URL
      return {
        code: `import('${DEVTOOLS_PREFIX}/svelte-runtime.js')`,
        map: null,
      };
    },

    transformIndexHtml(html: string) {
      // Phase 1 init script — must be first, before any component code.
      // The queue buffers all $inspect calls until the full runtime activates.
      const initTag = getInitScript();

      // Phase 3 script — loads the full runtime (activates queue, drains buffered calls).
      const runtimeTag = `<script type="module" src="${DEVTOOLS_PREFIX}/svelte-runtime.js"></script>`;

      return html.replace('<head>', `<head>${initTag}\n`).replace('</head>', `${runtimeTag}</head>`);
    },
  };
}
