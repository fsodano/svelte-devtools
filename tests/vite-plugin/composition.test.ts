import { describe, it, expect } from 'vitest';
import { svelteDevTools } from '../../packages/vite-plugin/src/index.js';

describe('plugin composition', () => {
  it('returns an array of plugins', () => {
    const plugins = svelteDevTools();
    expect(Array.isArray(plugins)).toBe(true);
  });

  it('includes marker plugin as first element', () => {
    const plugins = svelteDevTools();
    expect(plugins[0].name).toBe('svelte-devtools');
  });

  it('includes named sub-plugins', () => {
    const plugins = svelteDevTools();
    const names = plugins.map(p => p.name);
    expect(names).toContain('svelte-devtools:configure');
    expect(names).toContain('svelte-devtools:transform');
    expect(names).toContain('svelte-devtools:devtools-setup');
    expect(names).toContain('svelte-devtools:static-serve');
  });

  it('returns all 7 plugins by default', () => {
    const plugins = svelteDevTools();
    expect(plugins.length).toBe(7);
  });

  it('works with options', () => {
    const plugins = svelteDevTools({ enableStateInspection: false });
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(7);
  });

  it('all sub-plugins have required Vite plugin properties', () => {
    const plugins = svelteDevTools();
    for (const plugin of plugins) {
      expect(plugin).toHaveProperty('name');
      expect(typeof plugin.name).toBe('string');
    }
  });

  it('transform plugin has enforce: pre and apply: serve', () => {
    const plugins = svelteDevTools();
    const transformPlugin = plugins.find(p => p.name === 'svelte-devtools:transform');
    expect(transformPlugin).toBeDefined();
    expect((transformPlugin as Record<string, unknown>).enforce).toBe('pre');
    expect((transformPlugin as Record<string, unknown>).apply).toBe('serve');
  });

  it('configure plugin has enforce: pre', () => {
    const plugins = svelteDevTools();
    const configurePlugin = plugins.find(p => p.name === 'svelte-devtools:configure');
    expect(configurePlugin).toBeDefined();
    expect((configurePlugin as Record<string, unknown>).enforce).toBe('pre');
  });
});
