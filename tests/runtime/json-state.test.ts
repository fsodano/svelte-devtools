import { afterEach, describe, expect, it, vi } from 'vitest';
import { isJsonEditable, type SvelteDevToolsAPI } from '@fsodano/svelte-devtools-types';
import { runtime } from '../../packages/runtime/src/index.js';

const api = (window as unknown as { __SVELTE_DEVTOOLS__: SvelteDevToolsAPI }).__SVELTE_DEVTOOLS__;
afterEach(() => { runtime.getState().components.clear(); runtime._registerStateStore.clear(); });

describe('JSON state edit safety', () => {
  it.each([null, true, 0, 'value', [], {}, { nested: [1, false, null] }])('allows JSON value %j', value => {
    expect(isJsonEditable(value)).toBe(true);
  });
  it.each([undefined, () => 1, NaN, Infinity, -0, BigInt(1), Symbol('id'), new Map(), new Set(), new Date(), { callback: () => 1 }, [undefined], [, 1]])('rejects lossy value %#', value => {
    expect(isJsonEditable(value)).toBe(false);
  });
  it('rejects cycles, accessors, custom array properties, and class instances', () => {
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    const array = Array(1); Object.assign(array, { extra: 1 });
    class Model { value = 1; }
    const getter = vi.fn(() => 1); const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: getter });
    for (const value of [cycle, array, new Model(), accessor]) expect(isJsonEditable(value)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  it('does not expose function state as writable or overwrite it through editing or restore', () => {
    runtime.registerComponent('json:one', 'Counter', 'Counter.svelte');
    const callback = () => 1;
    runtime.handleState('json:one', 'callback', 'update', callback);
    const setter = vi.fn(); runtime._registerState('json:one', 'callback', setter);
    expect(api.getWritableStateKeys?.('json:one')).not.toContain('callback');
    expect(() => api.editComponentState?.('json:one', 'callback', null)).toThrow(/JSON/);
    runtime.setComponentState('json:one', 'callback', '[Function]');
    expect(setter).not.toHaveBeenCalled();
    expect(runtime.getState().components.get('json:one')?.state.get('callback')).toBe(callback);
  });
  it('checks requested values even for writable state', () => {
    runtime.registerComponent('json:one', 'Counter', 'Counter.svelte');
    runtime.handleState('json:one', 'count', 'update', 0);
    const setter = vi.fn(); runtime._registerState('json:one', 'count', setter);
    expect(api.getWritableStateKeys?.('json:one')).toContain('count');
    expect(() => api.editComponentState?.('json:one', 'count', NaN)).toThrow(/JSON/);
    api.editComponentState?.('json:one', 'count', 2);
    expect(setter).toHaveBeenCalledWith(2);
  });
});
