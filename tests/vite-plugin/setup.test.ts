// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
// @ts-expect-error The executable is plain ESM JavaScript shipped directly in npm.
import { planSetup, main } from '../../packages/vite-plugin/bin/setup.mjs';

const roots: string[] = [];
function fixture(source = `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({plugins: [sveltekit({adapter: adapter(), compilerOptions: {runes: true}})]});`) {
  const root = mkdtempSync(join(tmpdir(), 'svelte-setup-')); roots.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({devDependencies: {'@fsodano/vite-plugin-svelte-devtools': '^0.2.1', '@vitejs/devtools': '0.4.8'}}));
  writeFileSync(join(root, 'vite.config.ts'), source);
  return root;
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, {recursive: true, force: true})));

describe('consumer setup command', () => {
  it('preserves generated inline compiler/adapter options and creates a guarded hook', () => {
    const root = fixture(); main(['init'], root);
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    expect(config).toContain('adapter: adapter(), compilerOptions: {runes: true}');
    expect(config).toContain('plugins: [DevTools(), sveltekit(');
    expect(config).toContain('}), svelteDevTools()]');
    expect(readFileSync(join(root, 'src/hooks.server.ts'), 'utf8')).toContain('dev ? svelteDevToolsHandle() : noopHandle()');
    expect(planSetup(root)).toEqual([]);
  });
  it('supports plain Vite with aliased imports and trailing commas', () => {
    const root = fixture(`import { svelte as compiler } from '@sveltejs/vite-plugin-svelte';
import { defineConfig as config } from 'vite';
export default config({plugins: [compiler(), /* keep comment */], server: {port: 4000}});`);
    const changes = planSetup(root);
    expect(changes).toHaveLength(1);
    expect(changes[0].content).toContain('compiler(), svelteDevTools(), /* keep comment */');
    expect(changes[0].content).toContain('server: {port: 4000}');
  });
  it('does not edit anything when an existing hook needs composition', () => {
    const root = fixture(); const before = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    writeFileSync(join(root, 'src/hooks.server.js'), 'export const handle = auth;');
    expect(() => main(['init'], root)).toThrow('existing server hook');
    expect(readFileSync(join(root, 'vite.config.ts'), 'utf8')).toBe(before);
    expect(readFileSync(join(root, 'src/hooks.server.js'), 'utf8')).toBe('export const handle = auth;');
  });
  it.each([
    `import { sveltekit } from '@sveltejs/kit/vite'; export default () => ({plugins: [sveltekit()]});`,
    `import { sveltekit } from '@sveltejs/kit/vite'; export default { ...base, plugins: [sveltekit()] };`,
    `import { sveltekit } from '@sveltejs/kit/vite'; export default { plugins: getPlugins() };`,
    `import { sveltekit } from '@sveltejs/kit/vite'; export default { plugins: [sveltekit({files: {hooks: {server: 'custom'}}})] };`
  ])('rejects unsupported configuration without modifying it', source => {
    const root = fixture(source);
    expect(() => main(['init'], root)).toThrow('No files changed');
    expect(readFileSync(join(root, 'vite.config.ts'), 'utf8')).toBe(source);
  });
  it('previews edits without writing files', () => {
    const root = fixture(); const before = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    main(['init', '--dry-run'], root);
    expect(readFileSync(join(root, 'vite.config.ts'), 'utf8')).toBe(before);
  });
  it('avoids colliding with local names', () => {
    const root = fixture(`import { sveltekit } from '@sveltejs/kit/vite'; const DevTools = 1; const svelteDevTools = 2; export default {plugins: [sveltekit()]};`);
    expect(planSetup(root)[0].content).toContain('DevTools as DevTools_');
    expect(planSetup(root)[0].content).toContain('svelteDevTools as svelteDevTools_');
  });
  it('runs as an executable and returns actionable errors', () => {
    const root = fixture();
    const executable = join(process.cwd(), 'packages/vite-plugin/bin/setup.mjs');
    expect(execFileSync(process.execPath, [executable, 'init'], {cwd: root, encoding: 'utf8'})).toContain('Setup complete');
    expect(execFileSync(process.execPath, [executable, 'init'], {cwd: root, encoding: 'utf8'})).toContain('already configured');
  });
});
