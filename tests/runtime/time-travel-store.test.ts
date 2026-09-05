import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentNode, TimelineEntry } from '@fsodano/svelte-devtools-types';
import { createTimeTravelStore } from '../../packages/client/src/lib/stores/time-travel-store.svelte.js';

const counter = (count = 0, id = 'counter:one'): ComponentNode => ({ id, name: 'Counter', filename: 'Counter.svelte', children: [], props: {}, state: { count } });
let components: ComponentNode[];
let timeline: TimelineEntry[];
let store: ReturnType<typeof createTimeTravelStore>;
let api: { setComponentState: ReturnType<typeof vi.fn>; startInspectBatch: ReturnType<typeof vi.fn>; endInspectBatch: ReturnType<typeof vi.fn>; flushAllEffects: ReturnType<typeof vi.fn>; getWritableStateKeys: ReturnType<typeof vi.fn>; editComponentState: ReturnType<typeof vi.fn>; isTimeTraveling: boolean };
const host = window as unknown as { __SVELTE_DEVTOOLS__?: unknown };

beforeEach(() => {
  components = [counter()]; timeline = [];
  api = { setComponentState: vi.fn(), startInspectBatch: vi.fn(), endInspectBatch: vi.fn(), flushAllEffects: vi.fn(), getWritableStateKeys: vi.fn(() => ['count']), editComponentState: vi.fn(), isTimeTraveling: false };
  host.__SVELTE_DEVTOOLS__ = api;
  store = createTimeTravelStore(() => components, () => timeline, value => { components = value; }, value => { timeline = value; });
  store.clear();
});
afterEach(() => { store.clear(); delete host.__SVELTE_DEVTOOLS__; vi.restoreAllMocks(); });

function capture(count: number) { components = [counter(count)]; store.doCapture(); }

describe('production time travel store', () => {
  it('records immutable snapshots and deduplicates unchanged captures', () => {
    store.capture('initial'); store.capture('duplicate');
    expect(store.snapshots).toHaveLength(1);
    capture(1);
    expect(store.snapshots.map(s => s.components[0].state?.count)).toEqual([0, 1]);
    expect(store.canUndo).toBe(true);
  });

  it('undoes and redoes live state without recording restore echoes', () => {
    capture(0); capture(1);
    store.undo();
    expect(api.setComponentState).toHaveBeenLastCalledWith('counter:one', 'count', 0);
    expect(store.currentIndex).toBe(0);
    store.clearTimeTravelMode(); store.doCapture('undo echo');
    store.redo();
    expect(api.setComponentState).toHaveBeenLastCalledWith('counter:one', 'count', 1);
    store.clearTimeTravelMode(); store.doCapture('redo echo');
    expect(store.currentIndex).toBe(1); expect(store.snapshots).toHaveLength(2);
    expect(store.canRedo).toBe(false);
  });

  it('captures a baseline before an edit and relies on the live echo for its result', () => {
    api.editComponentState.mockImplementation((_id, _key, value) => { components = [counter(value)]; });
    store.setStateEdit('counter:one', 'count', 3);
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0].components[0].state?.count).toBe(0);
    store.doCapture('runtime echo');
    expect(store.snapshots[1].components[0].state?.count).toBe(3);
    store.undo(); expect(api.setComponentState).toHaveBeenLastCalledWith('counter:one', 'count', 0);
  });

  it('rejects read-only edits before changing history', () => {
    api.getWritableStateKeys.mockReturnValue([]);
    expect(() => store.setStateEdit('counter:one', 'count', 3)).toThrow(/read-only/);
    expect(store.snapshots).toHaveLength(0); expect(api.editComponentState).not.toHaveBeenCalled();
  });

  it('discards the future only when the user makes a different state change', () => {
    capture(0); capture(1); capture(2); store.undo(); store.clearTimeTravelMode();
    capture(9);
    expect(store.snapshots.map(s => s.components[0].state?.count)).toEqual([0, 1, 9]);
    expect(store.canRedo).toBe(false);
  });

  it('recovers flags and inspect batching after a setter throws', async () => {
    capture(0); capture(1);
    api.setComponentState.mockImplementation(() => { throw new Error('setter failed'); });
    await store.restore(0);
    expect(store.error).toBe('setter failed'); expect(store.isTimeTravelMode).toBe(false);
    expect(api.isTimeTraveling).toBe(false); expect(api.endInspectBatch).toHaveBeenCalled();
    api.setComponentState.mockReset(); await store.restore(1);
    expect(store.error).toBeNull(); expect(api.setComponentState).toHaveBeenLastCalledWith('counter:one', 'count', 1);
  });

  it('refuses ambiguous instance remapping without writing to the app', async () => {
    capture(0); components = [counter(1, 'counter:two'), counter(2, 'counter:three')];
    await store.restore(0);
    expect(store.error).toMatch(/unique instance/); expect(api.setComponentState).not.toHaveBeenCalled();
    expect(store.isTimeTravelMode).toBe(false);
  });
});
