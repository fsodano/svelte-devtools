import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../packages/client/src/lib/api.js';
import { devtoolsStore as store } from '../../packages/client/src/lib/stores/devtools-store.svelte.js';

vi.mock('../../packages/client/src/lib/api.js', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
  beaconUrl: vi.fn(() => '/test-sync'),
}));

vi.mock('../../packages/client/src/lib/command-client.js', () => ({ startCommandClient: vi.fn(() => () => {}) }));

function emit(type: string, payload: Record<string, unknown>, origin = 'http://localhost:3000') {
  window.dispatchEvent(new MessageEvent('message', {
    origin, source: window,
    data: { source: 'svelte-devtools', type, payload },
  }));
}
function mount(id: string, name = 'Counter') {
  emit('component-register', { id, name, filename: 'Counter.svelte' });
}

beforeAll(() => {
  vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);
  store.init(); store.stopServerEventsPoll();
});
beforeEach(() => {
  vi.useFakeTimers();
  store.restoreSnapshot([], []); store.timeTravel.clear(); store.isRecording = false;
  store.setSearchQuery('', []);
});
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

describe('production devtools store and window bridge', () => {
  it('keeps repeated instances separate and removes only the unmounted instance', () => {
    mount('counter:a'); mount('counter:b');
    expect(store.components.map(c => c.id)).toEqual(['counter:a', 'counter:b']);
    emit('component:unmount', { componentId: 'counter:a', componentName: 'Counter' });
    expect(store.components.map(c => c.id)).toEqual(['counter:b']);
    expect(store.timeline.map(e => e.type)).toEqual(['component:mount', 'component:mount', 'component:unmount']);
  });

  it('batches state echoes into the matching live instance', () => {
    mount('counter:a'); mount('counter:b');
    emit('state', { componentId: 'counter:b', key: 'count', value: 1, inspectType: 'update' });
    emit('state', { componentId: 'counter:b', key: 'count', value: 2, inspectType: 'update' });
    vi.runOnlyPendingTimers();
    expect(store.components.find(c => c.id === 'counter:b')?.state?.count).toBe(2);
    expect(store.components.find(c => c.id === 'counter:a')?.state?.count).toBeUndefined();
  });

  it('updates both state and props on a prop echo', () => {
    mount('prop:one');
    emit('state', { componentId: 'prop:one', key: 'generation', value: 1, inspectType: 'props' });
    vi.runOnlyPendingTimers();
    expect(store.components[0]).toMatchObject({ state: { generation: 1 }, props: { generation: 1 } });
  });

  it('continues recording when an animated component unmounts before settling', () => {
    mount('animated:a'); mount('counter:live');
    store.isRecording = true;
    store.timeTravel.capture('baseline');
    emit('state', { componentId: 'animated:a', key: 'spring', value: { current: 0, target: 1 } });
    emit('state', { componentId: 'animated:a', key: 'pending', value: 1 });
    emit('component:unmount', { componentId: 'animated:a' });
    emit('state', { componentId: 'counter:live', key: 'count', value: 2 });
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(store.timeTravel.snapshots).toHaveLength(2);
    expect(store.timeTravel.snapshots[1].components[0]).toMatchObject({ id: 'counter:live', state: { count: 2 } });
    expect(store.timeline.some(event => event.type === 'state:change' && (event.data as { componentId?: string }).componentId === 'animated:a')).toBe(false);
  });

  it('rejects messages from an untrusted origin', () => {
    emit('component-register', { id: 'foreign', name: 'Foreign' }, 'https://untrusted.example');
    expect(store.components).toEqual([]); expect(store.timeline).toEqual([]);
  });

  it('searches production component state and clears the filter', () => {
    mount('counter:a'); mount('counter:b', 'Other');
    store.setSearchQuery('other', store.components);
    expect(store.getFilteredComponents(store.components).map(c => c.id)).toEqual(['counter:b']);
    store.setSearchQuery('', store.components);
    expect(store.getFilteredComponents(store.components)).toHaveLength(2);
  });

  it('mounts live snippet, BigInt, and cyclic state as JSON-safe inspection data', () => {
    const snippet = () => {};
    snippet.toString = () => { throw new Error('Do not stringify snippets'); };
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    const host = window as unknown as { __SVELTE_DEVTOOLS__?: unknown };
    host.__SVELTE_DEVTOOLS__ = { getAllComponents: () => [{ id: 'complex:one', name: 'Complex', props: { children: snippet }, state: new Map([['large', 1n], ['cycle', cycle], ['callback', snippet]]), children: [] }] };
    try {
      expect(() => store.refresh()).not.toThrow();
      expect(() => JSON.stringify(store.components)).not.toThrow();
      expect(store.components[0]).toMatchObject({ props: { children: '[Function]' }, state: { large: '1n', cycle: { self: '[Circular]' }, callback: '[Function]' } });
      expect(() => store.timeTravel.capture()).not.toThrow();
    } finally { delete host.__SVELTE_DEVTOOLS__; }
  });

  it('syncs large snapshots through fetch instead of the browser beacon quota', async () => {
    for (let index = 0; index < 1000; index++) mount(`large:${index}`);
    await Promise.resolve();
    vi.mocked(apiFetch).mockClear();
    vi.mocked(navigator.sendBeacon).mockClear();
    store.init();
    try {
      const call = vi.mocked(apiFetch).mock.calls.find(([url]) => url === '/__svelte-devtools/api/sync');
      expect(call).toBeDefined();
      const body = call![1]!.body as string;
      expect(body.length).toBeGreaterThan(65536);
      expect(JSON.parse(body).components).toHaveLength(1000);
      expect(navigator.sendBeacon).not.toHaveBeenCalled();
    } finally { store.stopServerEventsPoll(); }
  });

  it('retains only the most recent 1000 events', () => {
    for (let i = 0; i < 1002; i++) mount(`counter:${i}`);
    expect(store.timeline).toHaveLength(1000);
    expect(store.timeline[0].data).toMatchObject({ id: 'counter:2' });
    store.clearTimeline(); expect(store.timeline).toEqual([]);
  });
});
