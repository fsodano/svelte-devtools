import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, type SvelteDevToolsAPI } from '@fsodano/svelte-devtools-types';
import { runtime } from '../../packages/runtime/src/index.js';

const api = (window as unknown as { __SVELTE_DEVTOOLS__: SvelteDevToolsAPI }).__SVELTE_DEVTOOLS__;

function pagehide(persisted: boolean) {
  const event = new Event('pagehide');
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

afterEach(() => {
  pagehide(false);
  runtime.getState().components.clear();
  vi.restoreAllMocks();
});

describe('production public event API', () => {
  it('records real component lifecycle and state events', async () => {
    runtime.registerComponent('api:counter', 'Counter', 'Counter.svelte');
    await new Promise(resolve => setTimeout(resolve, 5));
    runtime.handleState('api:counter', 'count', 'update', 2);
    runtime.unregisterComponent('api:counter');
    expect(api.getTimeline()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'component:mount', data: expect.objectContaining({ componentId: 'api:counter' }) }),
      expect.objectContaining({ type: 'state:change', data: expect.objectContaining({ key: 'count', value: 2 }) }),
      expect.objectContaining({ type: 'component:unmount', data: expect.objectContaining({ componentId: 'api:counter' }) }),
    ]));
  });

  it('publishes manual traces and supports independent, idempotent unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = api.subscribe(listener);
    const second = api.subscribe(listener);
    api.trace('request started', ['query']);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0]).toMatchObject({ type: 'trace:trigger', value: { name: 'request started', dependencies: ['query'] } });
    unsubscribe(); unsubscribe();
    api.trace('request finished', []);
    expect(listener).toHaveBeenCalledTimes(3);
    second();
    api.trace('unobserved', []);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('isolates listeners and returned history from application state and each other', () => {
    api.subscribe((event) => { (event as { value: { count: number } }).value.count = 99; throw new Error('listener failed'); });
    const listener = vi.fn(); api.subscribe(listener);
    const value = { count: 1 };
    expect(() => runtime.emit({ type: 'state', timestamp: 1, value })).not.toThrow();
    value.count = 4;
    expect(listener.mock.calls[0][0].value.count).toBe(1);
    const history = api.getTimeline();
    (history.at(-1)!.data as { value: { count: number } }).value.count = 5;
    expect((api.getTimeline().at(-1)!.data as { value: { count: number } }).value.count).toBe(1);
  });

  it('bounds retention and assigns unique event IDs', () => {
    for (let i = 0; i < LIMITS.MAX_TIMELINE_EVENTS + 2; i++) api.trace(`trace-${i}`, []);
    const history = api.getTimeline();
    expect(history).toHaveLength(LIMITS.MAX_TIMELINE_EVENTS);
    expect(new Set(history.map(event => event.id)).size).toBe(history.length);
    expect(history[0].data).toMatchObject({ key: 'trace-2' });
  });

  it('cleans up observers on final page departure but preserves them in the back-forward cache', () => {
    const listener = vi.fn(); api.subscribe(listener);
    pagehide(true);
    api.trace('cached', []); expect(listener).toHaveBeenCalledTimes(1);
    pagehide(false);
    expect(api.getTimeline()).toEqual([]);
    api.trace('departed', []); expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sanitizes cyclic state without crashing application event delivery', () => {
    const value: { self?: unknown } = {}; value.self = value;
    expect(() => runtime.emit({ type: 'state', timestamp: 1, value })).not.toThrow();
    expect(api.getTimeline().at(-1)?.data).toMatchObject({ value: { self: '[Circular]' } });
  });
});
