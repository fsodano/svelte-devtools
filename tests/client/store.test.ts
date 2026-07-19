import { describe, it, expect, vi } from 'vitest';

// Simulate devtools store logic without Svelte $state runes
// Tests the core state management and event handling
function createMockStore() {
  let components: Array<{
    id: string;
    name: string;
    props: Record<string, unknown>;
    state: Record<string, unknown>;
    children: string[];
    parentId?: string;
    filename?: string;
    renderDuration?: number;
  }> = [];
  let timeline: Array<{
    id: string;
    type: string;
    timestamp: number;
    data: unknown;
    duration?: number;
  }> = [];
  let isConnected = false;
  let selectedComponentId: string | null = null;

  function generateId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  function addToTimeline(entry: { id?: string; type: string; timestamp: number; data: unknown; duration?: number }) {
    timeline = [...timeline, { ...entry, id: entry.id ?? generateId() }].slice(-1000);
    return timeline;
  }

  return {
    get components() { return components; },
    get timeline() { return timeline; },
    get isConnected() { return isConnected; },
    get selectedComponentId() { return selectedComponentId; },

    init() { isConnected = true; },

    handleComponentMount(payload: {
      id: string; name: string; props?: Record<string, unknown>;
      state?: Record<string, unknown>; children?: string[];
      parentId?: string; filename?: string; renderDuration?: number;
    }) {
      const node = {
        id: payload.id,
        name: payload.name,
        props: payload.props ?? {},
        state: payload.state ?? {},
        children: payload.children ?? [],
        parentId: payload.parentId,
        filename: payload.filename,
        renderDuration: payload.renderDuration,
      };

      const idx = components.findIndex(c => c.id === node.id);
      if (idx !== -1) {
        components[idx] = node;
      } else {
        components = [...components, node];
      }

      addToTimeline({
        id: generateId(),
        type: 'component:mount',
        timestamp: Date.now(),
        data: node,
      });
    },

    handleComponentUnmount(payload: { id: string }) {
      components = components.filter(c => c.id !== payload.id);
      addToTimeline({
        id: generateId(),
        type: 'component:unmount',
        timestamp: Date.now(),
        data: { id: payload.id },
      });
    },

    handleStateChange(payload: { componentId: string; key: string; value: unknown }) {
      const existing = components.find(c => c.id === payload.componentId);
      if (!existing) return;

      components = components.map(c => {
        if (c.id === payload.componentId) {
          return { ...c, state: { ...c.state, [payload.key]: payload.value } };
        }
        return c;
      });

      addToTimeline({
        id: generateId(),
        type: 'state:change',
        timestamp: Date.now(),
        data: payload,
      });
    },

    selectComponent(id: string) { selectedComponentId = id; },

    clearTimeline() { timeline = []; },
  };
}

describe('client devtools store', () => {
  it('starts disconnected', () => {
    const store = createMockStore();
    expect(store.isConnected).toBe(false);
  });

  it('connects on init', () => {
    const store = createMockStore();
    store.init();
    expect(store.isConnected).toBe(true);
  });

  describe('component mounting', () => {
    it('adds a new component', () => {
      const store = createMockStore();
      store.handleComponentMount({
        id: 'svt-001', name: 'Counter',
        state: { count: 0 },
      });
      expect(store.components).toHaveLength(1);
      expect(store.components[0].name).toBe('Counter');
      expect(store.components[0].state.count).toBe(0);
    });

    it('updates an existing component on re-mount', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'Counter', state: { count: 0 } });
      store.handleComponentMount({ id: 'svt-001', name: 'Counter', state: { count: 10 } });
      expect(store.components).toHaveLength(1);
      expect(store.components[0].state.count).toBe(10);
    });

    it('adds multiple components', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'App' });
      store.handleComponentMount({ id: 'svt-002', name: 'Header' });
      store.handleComponentMount({ id: 'svt-003', name: 'Footer' });
      expect(store.components).toHaveLength(3);
    });

    it('records mount in timeline', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'Counter' });
      const mountEvents = store.timeline.filter(e => e.type === 'component:mount');
      expect(mountEvents).toHaveLength(1);
    });
  });

  describe('component unmounting', () => {
    it('removes component by id', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'A' });
      store.handleComponentMount({ id: 'svt-002', name: 'B' });
      store.handleComponentUnmount({ id: 'svt-001' });
      expect(store.components).toHaveLength(1);
      expect(store.components[0].id).toBe('svt-002');
    });

    it('does nothing when unmounting unknown component', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'A' });
      store.handleComponentUnmount({ id: 'svt-999' });
      expect(store.components).toHaveLength(1);
    });
  });

  describe('state changes', () => {
    it('updates component state for existing component', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'Counter', state: { count: 0 } });
      store.handleStateChange({ componentId: 'svt-001', key: 'count', value: 5 });
      expect(store.components[0].state.count).toBe(5);
    });

    it('does nothing for unknown component', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'A' });
      store.handleStateChange({ componentId: 'svt-999', key: 'x', value: 1 });
      expect(store.components).toHaveLength(1);
    });

    it('adds new state keys', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'Form', state: {} });
      store.handleStateChange({ componentId: 'svt-001', key: 'username', value: 'alice' });
      store.handleStateChange({ componentId: 'svt-001', key: 'password', value: 'secret' });

      const comp = store.components[0];
      expect(Object.keys(comp.state)).toHaveLength(2);
      expect(comp.state.username).toBe('alice');
    });

    it('overwrites existing state keys', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'Counter', state: { count: 0 } });
      store.handleStateChange({ componentId: 'svt-001', key: 'count', value: 1 });
      store.handleStateChange({ componentId: 'svt-001', key: 'count', value: 2 });
      store.handleStateChange({ componentId: 'svt-001', key: 'count', value: 3 });
      expect(store.components[0].state.count).toBe(3);
    });

    it('records state changes in timeline', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'Counter', state: { count: 0 } });
      store.handleStateChange({ componentId: 'svt-001', key: 'count', value: 1 });
      store.handleStateChange({ componentId: 'svt-001', key: 'count', value: 2 });

      const stateEvents = store.timeline.filter(e => e.type === 'state:change');
      expect(stateEvents).toHaveLength(2);
    });
  });

  describe('select component', () => {
    it('sets selected component id', () => {
      const store = createMockStore();
      store.selectComponent('svt-001');
      expect(store.selectedComponentId).toBe('svt-001');
    });

    it('changes selected component', () => {
      const store = createMockStore();
      store.selectComponent('svt-001');
      store.selectComponent('svt-002');
      expect(store.selectedComponentId).toBe('svt-002');
    });
  });

  describe('timeline', () => {
    it('starts empty', () => {
      const store = createMockStore();
      expect(store.timeline).toHaveLength(0);
    });

    it('collects events', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'App' });
      store.handleStateChange({ componentId: 'svt-001', key: 'count', value: 1 });
      expect(store.timeline.length).toBeGreaterThan(0);
    });

    it('clears timeline', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'App' });
      store.clearTimeline();
      expect(store.timeline).toHaveLength(0);
    });

    it('caps at 1000 events', () => {
      const store = createMockStore();
      store.handleComponentMount({ id: 'svt-001', name: 'A' });
      for (let i = 0; i < 1200; i++) {
        store.handleStateChange({ componentId: 'svt-001', key: 'count', value: i });
      }
      expect(store.timeline.length).toBeLessThanOrEqual(1000);
    });
  });
});
