import { describe, it, expect } from 'vitest';
import { svelteDevTools } from '../../packages/vite-plugin/src/index.js';

describe('plugin composition', () => {
  it('returns a plugin object', () => {
    const plugin = svelteDevTools();
    expect(plugin).toBeDefined();
    expect(typeof plugin).toBe('object');
  });

  it('has name svelte-devtools', () => {
    const plugin = svelteDevTools();
    expect(plugin.name).toBe('svelte-devtools');
  });

  it('has the required Vite plugin properties', () => {
    const plugin = svelteDevTools();
    expect(plugin).toHaveProperty('name');
    expect(typeof plugin.name).toBe('string');
    expect(plugin).toHaveProperty('apply', 'serve');
    expect(plugin).toHaveProperty('enforce', 'pre');
  });

  it('has hook methods', () => {
    const plugin = svelteDevTools();
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.configureServer).toBe('function');
    expect(plugin).toHaveProperty('transform');
  });

  it('has devtools setup property', () => {
    const plugin = svelteDevTools();
    expect(plugin).toHaveProperty('devtools');
    expect(plugin.devtools).toBeDefined();
    expect(plugin.devtools!.setup).toBeDefined();
    expect(typeof plugin.devtools!.setup).toBe('function');
  });

  it('works with options', () => {
    const plugin = svelteDevTools({ enableStateInspection: false });
    expect(plugin.name).toBe('svelte-devtools');
    expect(plugin).toHaveProperty('transform');
  });

  it('returns a Plugin-compatible object', () => {
    const plugin = svelteDevTools();
    expect(plugin).toHaveProperty('name');
    expect(plugin).toHaveProperty('apply');
    expect(plugin).toHaveProperty('enforce');
    expect(plugin).toHaveProperty('configResolved');
    expect(plugin).toHaveProperty('configureServer');
  });
});
