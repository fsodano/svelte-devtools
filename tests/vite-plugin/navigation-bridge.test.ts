import { describe, it, expect } from 'vitest';
import { svelteDevTools } from '../../packages/vite-plugin/src/index.js';

const BRIDGE_URL = '/@svelte-devtools-navigation-bridge';
const BRIDGE_ID = '\0virtual:svelte-devtools-navigation-bridge';

type BridgePlugin = {
  resolveId: (id: string) => string | null | undefined;
  load: (id: string) => string | null | undefined;
  transformIndexHtml: (html: string) => string;
  configResolved: (config: {
    root: string;
    plugins: Array<{ name?: string }>;
    resolve: { alias: unknown[] };
  }) => void;
};

function bridgePlugin(): BridgePlugin {
  return svelteDevTools() as unknown as BridgePlugin;
}

function fakeConfig(pluginName: string): Parameters<BridgePlugin['configResolved']>[0] {
  return {
    root: process.cwd(),
    plugins: [{ name: pluginName }],
    resolve: { alias: [] },
  };
}

describe('navigation bridge (ADR-0012 Phase 2)', () => {
  it('no longer intercepts $app/navigation', () => {
    const plugin = bridgePlugin();
    expect(plugin.resolveId('$app/navigation')).toBeNull();
    expect(plugin.resolveId('\0$app/navigation')).toBeNull();
  });

  it('maps the injected bridge URL to the virtual module id', () => {
    const plugin = bridgePlugin();
    expect(plugin.resolveId(BRIDGE_URL)).toBe(BRIDGE_ID);
  });

  it('loads the bridge from the real $app/navigation module and assigns the global', () => {
    const plugin = bridgePlugin();
    const source = plugin.load(BRIDGE_ID) as string;
    expect(source).toContain(`import { goto } from '$app/navigation'`);
    expect(source).toContain('window.__SVELTE_DEVTOOLS_REAL_GOTO__ = goto');
    // The bridge must never re-export or stub SvelteKit navigation.
    expect(source).not.toContain('export {');
    expect(source).not.toContain('invalidate');
  });

  it('injects the bridge script into HTML only when SvelteKit is present', () => {
    const plugin = bridgePlugin();
    plugin.configResolved(fakeConfig('vite-plugin-sveltekit'));

    const html = plugin.transformIndexHtml('<html><head></head></html>');
    expect(html).toContain(`<script type="module" src="${BRIDGE_URL}"></script>`);
    expect(html).toContain('/__svelte-devtools/svelte-runtime.js');
  });

  it('keeps the bridge out of plain Vite HTML', () => {
    const plugin = bridgePlugin();
    plugin.configResolved(fakeConfig('vite-plugin-svelte'));

    const html = plugin.transformIndexHtml('<html><head></head></html>');
    expect(html).not.toContain(BRIDGE_URL);
    expect(html).toContain('/__svelte-devtools/svelte-runtime.js');
  });
});
