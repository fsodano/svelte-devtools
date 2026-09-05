import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('retains only the most recent 1000 events', () => {
    for (let i = 0; i < 1002; i++) mount(`counter:${i}`);
    expect(store.timeline).toHaveLength(1000);
    expect(store.timeline[0].data).toMatchObject({ id: 'counter:2' });
    store.clearTimeline(); expect(store.timeline).toEqual([]);
  });
});
