import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtime } from '../../packages/runtime/src/index.js';

afterEach(() => {
  runtime.getState().components.clear();
  runtime._registerStateStore.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('runtime instance lifecycle', () => {
  it('preserves component ancestry when a layout has no DOM wrapper', async () => {
    vi.stubGlobal('__SVELTE_DEVTOOLS_REGISTRY__', new Map([
      ['layout:1', { id: 'layout:1', name: '+layout', filename: '+layout.svelte' }],
      ['page:1', { id: 'page:1', name: '+page', filename: '+page.svelte', parentId: 'layout:1' }],
    ]));
    runtime.registerComponent('layout:1', '+layout', '+layout.svelte');
    runtime.registerComponent('page:1', '+page', '+page.svelte');
    await vi.waitFor(() => expect(runtime.getState().components.get('page:1')?.parentId).toBe('layout:1'));
  });
  it('marks prop echoes from instance metadata so the panel refreshes props', () => {
    vi.stubGlobal('__SVELTE_DEVTOOLS_REGISTRY__', new Map([['prop:one', { id: 'prop:one', name: 'Child', filename: 'Child.svelte', propKeys: ['generation'] }]]));
    const post = vi.spyOn(window, 'postMessage');
    runtime.registerComponent('prop:one', 'Child', 'Child.svelte');
    runtime.handleState('prop:one', 'generation', 'update', 1);
    expect(runtime.getState().components.get('prop:one')?.props).toEqual({ generation: 1 });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'state', payload: expect.objectContaining({ key: 'generation', value: 1, inspectType: 'props' }) }), '*');
  });

  it('targets setters for only the selected instance and removes them on destroy', () => {
    runtime.registerComponent('file:a', 'Counter', 'Counter.svelte');
    runtime.registerComponent('file:b', 'Counter', 'Counter.svelte');
    const a = vi.fn(); const b = vi.fn();
    runtime._registerState('file:a', 'count', a);
    runtime._registerState('file:b', 'count', b);
    runtime.setComponentState('file:a', 'count', 4);
    expect(a).toHaveBeenCalledWith(4);
    expect(b).not.toHaveBeenCalled();
    runtime.unregisterComponent('file:a');
    expect(runtime.getAllComponents().map(c => c.id)).toEqual(['file:b']);
    expect(runtime._registerStateStore.has('file:a')).toBe(false);
    runtime.setComponentState('file:a', 'count', 5);
    expect(a).toHaveBeenCalledTimes(1);
  });
});
