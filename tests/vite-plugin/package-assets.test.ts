import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePackageAssets } from '../../packages/vite-plugin/src/package-assets.js';

describe('published package asset resolution', () => {
  it('uses ESM runtime export and client package metadata with no workspace fallback', () => {
    const root = mkdtempSync(join(tmpdir(), 'devtools-assets-'));
    try {
      const runtime = join(root, 'node_modules/@fsodano/svelte-devtools-runtime/dist');
      const client = join(root, 'node_modules/@fsodano/svelte-devtools-client');
      mkdirSync(runtime, { recursive: true }); mkdirSync(join(client, 'dist'), { recursive: true });
      writeFileSync(join(runtime, 'index.js'), 'export {};');
      writeFileSync(join(client, 'dist/index.html'), '<html></html>');
      const queried: string[] = [];
      const resolve = (specifier: string) => {
        queried.push(specifier);
        return pathToFileURL(specifier.endsWith('/package.json') ? join(client, 'package.json') : join(runtime, 'index.js')).href;
      };
      expect(resolvePackageAssets(resolve)).toEqual({ runtimePath: runtime, clientPath: join(client, 'dist') });
      expect(queried).toEqual(['@fsodano/svelte-devtools-runtime', '@fsodano/svelte-devtools-client/package.json']);
      rmSync(join(runtime, 'index.js'));
      expect(() => resolvePackageAssets(resolve)).toThrow('package asset missing');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
