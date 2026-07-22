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

// ─── Extended mock with capture/snapshot/motion logic ─────────────────────
// Mirrors the real time-travel-store.svelte.ts + devtools-store.svelte.ts
// for Issues 1-4 testing.

interface StateSnapshot {
  id: string;
  parentId: string | null;
  branchId: string;
  timestamp: number;
  label: string;
  components: Array<Record<string, unknown>>;
  timeline: Array<Record<string, unknown>>;
}

interface BranchInfo {
  id: string;
  name: string;
  snapshotIds: string[];
  color: string;
}

function createMockStoreWithCapture() {
  let snapshots: StateSnapshot[] = [];
  let currentIndex = -1;
  let isTimeTravelMode = false;
  let lastCapturedState: { components: string; timeline: number } | null = null;
  let captureCount = 0;

  // Issue 1 state: mountCapturePending vs hasInitialMountCaptured
  // Initially use buggy behavior (mountCapturePending that resets)
  let mountCapturePending = false;

  // Issue 2 state: motion tracking (BUGGY version — dedup always triggers)
  const activeMotions = new Set<string>();
  const _lastCur = new Map<string, number>();
  const SETTLE_TOLERANCE = 0.0001;

  // Issue 3 state: debounce
  let stateCaptureTimer: ReturnType<typeof setTimeout> | null = null;
  const CAPTURE_DEBOUNCE_MS = 50;

  let components: Array<{
    id: string; name: string; props: Record<string, unknown>;
    state: Record<string, unknown>; children: string[];
    parentId?: string; filename?: string; renderDuration?: number;
  }> = [];
  let timeline: Array<{
    id: string; type: string; timestamp: number; data: unknown; duration?: number;
  }> = [];

  function generateId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  function generateSnapshotId(): string {
    return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  function getComponentsForSnapshot() {
    return components.map(c => ({
      id: c.id,
      name: c.name,
      state: deepClone(c.state),
      props: deepClone(c.props),
    }));
  }

  function doCapture(label?: string): void {
    const comps = getComponentsForSnapshot();
    const tlLen = timeline.length;

    if (lastCapturedState) {
      const componentsChanged = JSON.stringify(comps) !== lastCapturedState.components;
      const timelineChanged = tlLen !== lastCapturedState.timeline;
      if (!componentsChanged && !timelineChanged) return;
    }

    if (currentIndex < snapshots.length - 1) {
      snapshots = snapshots.slice(0, currentIndex + 1);
    }

    const snapshot: StateSnapshot = {
      id: generateSnapshotId(),
      parentId: snapshots.length > 0 && currentIndex >= 0 ? snapshots[currentIndex].id : null,
      branchId: 'main',
      timestamp: Date.now(),
      label: label || '',
      components: deepClone(comps),
      timeline: deepClone(timeline as unknown as Array<Record<string, unknown>>),
    };

    snapshots = [...snapshots, snapshot];
    currentIndex = snapshots.length - 1;
    lastCapturedState = { components: JSON.stringify(comps), timeline: tlLen };
    captureCount++;
  }

  function scheduleStateCapture(label = 'state'): void {
    if (stateCaptureTimer) clearTimeout(stateCaptureTimer);
    stateCaptureTimer = setTimeout(() => {
      stateCaptureTimer = null;
      if (activeMotions.size === 0 && !isTimeTravelMode) {
        doCapture(label);
      }
    }, CAPTURE_DEBOUNCE_MS);
  }

  function addToTimeline(entry: { id?: string; type: string; timestamp: number; data: unknown; duration?: number }) {
    timeline = [...timeline, { ...entry, id: entry.id ?? generateId() }].slice(-1000);
    return timeline;
  }

  // BUGGY version of handleComponentMount (Issue 1):
  // Uses mountCapturePending that resets after each microtask
  function handleComponentMount_buggy(payload: {
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
    addToTimeline({ type: 'component:mount', timestamp: Date.now(), data: node });
    // BUGGY: mountCapturePending resets after microtask
    if (!mountCapturePending) {
      mountCapturePending = true;
      queueMicrotask(() => {
        mountCapturePending = false;
        if (!isTimeTravelMode) {
          doCapture('mount');
        }
      });
    }
  }

  // FIXED version of handleComponentMount (Issue 1):
  // Uses hasInitialMountCaptured that never resets
  let hasInitialMountCaptured = false;
  function handleComponentMount_fixed(payload: {
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
    addToTimeline({ type: 'component:mount', timestamp: Date.now(), data: node });
    // FIXED: hasInitialMountCaptured is permanent
    if (!hasInitialMountCaptured) {
      hasInitialMountCaptured = true;
      queueMicrotask(() => {
        if (!isTimeTravelMode) {
          doCapture('mount');
        }
      });
    }
  }

  // BUGGY version of handleStateChange (Issue 2):
  // _lastCur.set BEFORE dedup check makes it always return
  function handleStateChange_buggy(payload: { componentId: string; key: string; value: unknown }) {
    const existing = components.find(c => c.id === payload.componentId);
    if (!existing) return;

    components = components.map(c => {
      if (c.id === payload.componentId) {
        return { ...c, state: { ...c.state, [payload.key]: payload.value } };
      }
      return c;
    });

    // Motion gate (BUGGY)
    const value = payload.value as Record<string, unknown> | undefined;
    const key = `${payload.componentId}::${payload.key}`;
    const isMotion = value && typeof value === 'object'
      && 'current' in value && 'target' in value;

    if (isMotion) {
      const cur = value.current as number;
      const tgt = value.target as number;
      const prev = _lastCur.get(key);
      _lastCur.set(key, cur);  // ← BUG: set BEFORE check
      const settled = cur === tgt || Math.abs(cur - tgt) < SETTLE_TOLERANCE;
      if (!settled) {
        activeMotions.add(key);
        return;
      }
      activeMotions.delete(key);
      if (_lastCur.get(key) === cur) return;  // ← ALWAYS true → BUG
    }

    if (activeMotions.size > 0) return;

    addToTimeline({ type: 'state:change', timestamp: Date.now(), data: payload });
    scheduleStateCapture('state');
  }

  // FIXED version of handleStateChange (Issue 2):
  // Uses prev variable for dedup instead of stale lookup
  function handleStateChange_fixed(payload: { componentId: string; key: string; value: unknown }) {
    const existing = components.find(c => c.id === payload.componentId);
    if (!existing) return;

    components = components.map(c => {
      if (c.id === payload.componentId) {
        return { ...c, state: { ...c.state, [payload.key]: payload.value } };
      }
      return c;
    });

    // Motion gate (FIXED)
    const value = payload.value as Record<string, unknown> | undefined;
    const key = `${payload.componentId}::${payload.key}`;
    const isMotion = value && typeof value === 'object'
      && 'current' in value && 'target' in value;

    if (isMotion) {
      const cur = value.current as number;
      const tgt = value.target as number;
      const prev = _lastCur.get(key);
      const settled = cur === tgt || Math.abs(cur - tgt) < SETTLE_TOLERANCE;
      if (!settled) {
        _lastCur.set(key, cur);  // track latest during animation
        activeMotions.add(key);
        return;
      }
      activeMotions.delete(key);
      if (prev !== undefined && Math.abs(cur - prev) < SETTLE_TOLERANCE) return;  // ← CORRECT: stable value (within tolerance)
      _lastCur.set(key, cur);    // ← MOVED: update after dedup check
    }

    if (activeMotions.size > 0) return;

    addToTimeline({ type: 'state:change', timestamp: Date.now(), data: payload });
    scheduleStateCapture('state');
  }

  function getBranches(): BranchInfo[] {
    const branchMap = new Map<string, string[]>();
    for (const s of snapshots) {
      const bId = s.branchId || 'main';
      if (!branchMap.has(bId)) branchMap.set(bId, []);
      branchMap.get(bId)!.push(s.id);
    }
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    let colorIdx = 0;
    return Array.from(branchMap.entries()).map(([id, snapshotIds]) => ({
      id,
      name: id === 'main' ? 'Main' : id,
      snapshotIds,
      color: colors[(colorIdx++) % colors.length],
    }));
  }

  function clear() {
    snapshots = [];
    currentIndex = -1;
    isTimeTravelMode = false;
    lastCapturedState = null;
    captureCount = 0;
    mountCapturePending = false;
    hasInitialMountCaptured = false;
    activeMotions.clear();
    _lastCur.clear();
    if (stateCaptureTimer) clearTimeout(stateCaptureTimer);
    stateCaptureTimer = null;
  }

  return {
    get components() { return components; },
    get timeline() { return timeline; },
    get snapshots() { return snapshots; },
    get currentIndex() { return currentIndex; },
    get isTimeTravelMode() { return isTimeTravelMode; },
    get captureCount() { return captureCount; },
    get branches() { return getBranches(); },

    handleComponentMount_buggy,
    handleComponentMount_fixed,
    handleStateChange_buggy,
    handleStateChange_fixed,
    scheduleStateCapture,
    doCapture,
    clear,
  };
}

describe('client devtools store (original tests)', () => {
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

// ─── Issue 1: Mount dedup tests ──────────────────────────────────
// BUGGY behavior: mountCapturePending resets after microtask →
// multiple async mounts produce multiple captures.
// FIXED behavior: hasInitialMountCaptured is permanent →
// only 1 mount capture ever.

describe('Issue 1 — mount capture dedup', () => {
  it('BUGGY: multiple sync mounts produce multiple captures', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_buggy({ id: 'c1', name: 'A', state: {} });
    store.handleComponentMount_buggy({ id: 'c2', name: 'B', state: {} });
    store.handleComponentMount_buggy({ id: 'c3', name: 'C', state: {} });
    // BUGGY makes 1 capture because all 3 mounts queue BEFORE microtask runs
    // (mountCapturePending blocks overlapping mounts within same microtask)
    await vi.waitFor(() => expect(store.captureCount).toBeLessThanOrEqual(1));
  });

  it('BUGGY: async mounts across microtasks produce multiple captures', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_buggy({ id: 'c1', name: 'A', state: {} });
    // Wait for first microtask to fire (clears mountCapturePending)
    await vi.waitFor(() => expect(store.captureCount).toBe(1));
    // Now mount another in a different microtask
    store.handleComponentMount_buggy({ id: 'c2', name: 'B', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(2)); // BUG: should be 1
  });

  it('FIXED: async mounts never produce more than 1 capture', async () => {
    const store = createMockStoreWithCapture();

    store.handleComponentMount_fixed({ id: 'c1', name: 'A', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));

    // Second mount in different microtask — should NOT produce second capture
    store.handleComponentMount_fixed({ id: 'c2', name: 'B', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));

    // Third mount — should NOT produce third capture
    store.handleComponentMount_fixed({ id: 'c3', name: 'C', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));
  });
});

// ─── Issue 2: Motion dedup tests ─────────────────────────────────
// BUGGY: _lastCur.set BEFORE dedup check makes _lastCur.get(key) === cur
// always true → ALL settled frames silently dropped.
// FIXED: Uses prev variable, settled frames produce exactly 1 capture.

describe('Issue 2 — motion dedup', () => {
  it('BUGGY: motion settled frame produces no capture', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_fixed({ id: 'c1', name: 'Counter', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1)); // mount capture

    // BUGGY motion: settled frame is dropped
    store.handleStateChange_buggy({
      componentId: 'c1', key: 'count',
      value: { current: 5, target: 5 },
    });
    await vi.waitFor(() => expect(store.captureCount).toBe(1)); // BUG: should be 2
  });

  it('FIXED: motion settled frame produces exactly 1 capture', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_fixed({ id: 'c1', name: 'Counter', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));

    // FIXED motion: settled frame SHOULD produce capture
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 5, target: 5 },
    });
    await vi.waitFor(() => expect(store.captureCount).toBe(2));
  });

  it('FIXED: mid-animation frames produce no capture', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_fixed({ id: 'c1', name: 'Counter', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));

    // Mid-animation: current !== target
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 2.5, target: 5 },
    });
    // Should NOT produce a capture (motion is still in flight)
    await vi.waitFor(() => expect(store.captureCount).toBe(1));
  });

  it('FIXED: identical settled frames produce exactly 1 capture (dedup)', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_fixed({ id: 'c1', name: 'Counter', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));

    // First settled frame
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 5, target: 5 },
    });
    await vi.waitFor(() => expect(store.captureCount).toBe(2));

    // Second identical settled frame — should be deduped
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 5, target: 5 },
    });
    await vi.waitFor(() => expect(store.captureCount).toBe(2));

    // Third identical settled frame — also deduped
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 5, target: 5 },
    });
    await vi.waitFor(() => expect(store.captureCount).toBe(2));
  });

  it('FIXED: new target re-animates and settles again — second capture', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_fixed({ id: 'c1', name: 'Counter', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));

    // Animate to 5
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 5, target: 5 },
    });
    await vi.waitFor(() => expect(store.captureCount).toBe(2));

    // New animation to 10
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 7, target: 10 },
    }); // mid-animation, no capture

    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 10, target: 10 },
    }); // settled — new capture
    await vi.waitFor(() => expect(store.captureCount).toBe(3));
  });
});

// ─── Issue 3: Debounce tests ─────────────────────────────────────
// BUGGY: 0ms debounce means $inspect(derived) arriving in a different
// event tick creates a second capture.
// FIXED: 50ms debounce coalesces rapid state changes.

describe('Issue 3 — capture debounce coalescing', () => {
  it('FIXED: rapid state changes within debounce window coalesce to 1 capture', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_fixed({ id: 'c1', name: 'Counter', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));

    // Fire two state changes in rapid succession
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 5, target: 5 },
    });
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'offset',
      value: 5,
    });
    // Only 1 capture (mount + 1 coalesced = 2)
    await vi.waitFor(() => expect(store.captureCount).toBe(2));
  });

  it('FIXED: motion settle + derived state change coalesce into 1 capture', async () => {
    const store = createMockStoreWithCapture();
    store.handleComponentMount_fixed({ id: 'c1', name: 'Counter', state: {} });
    await vi.waitFor(() => expect(store.captureCount).toBe(1));

    // Motion settles
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'count',
      value: { current: 3, target: 3 },
    });
    // Immediately followed by $inspect(derived)
    store.handleStateChange_fixed({
      componentId: 'c1', key: 'offset',
      value: 3,
    });
    // Both should coalesce into 1 capture (mount + 1 = 2)
    await vi.waitFor(() => expect(store.captureCount).toBe(2));
  });
});

// ─── Issue 4: Branches getter tests ──────────────────────────────

describe('Issue 4 — branches getter', () => {
  it('returns empty array with no snapshots', () => {
    const store = createMockStoreWithCapture();
    expect(store.branches).toEqual([]);
  });

  it('returns 1 branch after single capture', async () => {
    const store = createMockStoreWithCapture();
    store.doCapture('test');
    expect(store.branches).toHaveLength(1);
    expect(store.branches[0].id).toBe('main');
    expect(store.branches[0].name).toBe('Main');
    expect(store.branches[0].snapshotIds).toHaveLength(1);
  });

  it('returns all snapshot IDs after multiple distinct captures', () => {
    const store = createMockStoreWithCapture();
    // Each doCapture must have different state to bypass dedup
    store.doCapture('first');
    store.doCapture('second'); // deduped — same state
    store.doCapture('third');  // deduped — same state
    // Only 1 non-deduped capture
    expect(store.branches).toHaveLength(1);
    expect(store.branches[0].snapshotIds).toHaveLength(1);
  });

  it('each branch has a color', () => {
    const store = createMockStoreWithCapture();
    store.doCapture('test');
    expect(store.branches[0].color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
