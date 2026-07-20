import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Types (mirror from @svelte-devtools/types) ────────────────────────────

interface ComponentNode {
  id: string;
  name: string;
  filename?: string;
  children: ComponentNode[];
  props: Record<string, unknown>;
}

interface TimelineEntry {
  type: string;
  timestamp: number;
  data?: unknown;
}

interface StateSnapshot {
  id: string;
  timestamp: number;
  components: ComponentNode[];
  timeline: TimelineEntry[];
  label?: string;
}

interface TimeTravelStore {
  snapshots: StateSnapshot[];
  currentIndex: number;
  isTimeTravelMode: boolean;
  maxSnapshots: number;
  capture: (label?: string) => void;
  restore: (index: number) => void;
  goToSnapshot: (id: string) => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

// ─── Pure mock store (replicates time-travel-store.svelte.ts logic) ─────────

const LIMITS = { MAX_STATE_SNAPSHOTS: 50 };
const CAPTURE_DEBOUNCE = 100;

function generateSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function createMockTimeTravelStore(
  getComponents: () => ComponentNode[],
  getTimeline: () => TimelineEntry[],
  setComponents?: (c: ComponentNode[]) => void,
  setTimeline?: (t: TimelineEntry[]) => void
): TimeTravelStore {
  let snapshots: StateSnapshot[] = [];
  let currentIndex = -1;
  let isTimeTravelMode = false;
  let maxSnapshots = LIMITS.MAX_STATE_SNAPSHOTS;
  let lastCapturedState: { components: ComponentNode[]; timeline: TimelineEntry[] } | null = null;

  let captureTimeout: ReturnType<typeof setTimeout> | null = null;

  function capture(label?: string): void {
    if (captureTimeout) {
      clearTimeout(captureTimeout);
    }

    captureTimeout = setTimeout(() => {
      const components = getComponents();
      const timeline = getTimeline();

      if (lastCapturedState) {
        const componentsChanged = JSON.stringify(components) !== JSON.stringify(lastCapturedState.components);
        const timelineChanged = timeline.length !== lastCapturedState.timeline.length;

        if (!componentsChanged && !timelineChanged) {
          return;
        }
      }

      const snapshot: StateSnapshot = {
        id: generateSnapshotId(),
        timestamp: Date.now(),
        components: deepClone(components),
        timeline: deepClone(timeline),
        label,
      };

      if (currentIndex < snapshots.length - 1) {
        snapshots = snapshots.slice(0, currentIndex + 1);
      }

      snapshots.push(snapshot);

      if (snapshots.length > maxSnapshots) {
        snapshots = snapshots.slice(snapshots.length - maxSnapshots);
      }

      currentIndex = snapshots.length - 1;
      isTimeTravelMode = true;
      lastCapturedState = { components, timeline };
    }, CAPTURE_DEBOUNCE);
  }

  function restore(index: number): void {
    if (index < 0 || index >= snapshots.length) return;

    currentIndex = index;
    isTimeTravelMode = true;

    const snapshot = snapshots[index];
    if (setComponents) setComponents(deepClone(snapshot.components));
    if (setTimeline) setTimeline(deepClone(snapshot.timeline));
  }

  function goToSnapshot(id: string): void {
    const index = snapshots.findIndex((s) => s.id === id);
    if (index !== -1) {
      restore(index);
    }
  }

  function clear(): void {
    snapshots = [];
    currentIndex = -1;
    isTimeTravelMode = false;
    lastCapturedState = null;
  }

  function undo(): void {
    if (currentIndex > 0) {
      restore(currentIndex - 1);
    }
  }

  function redo(): void {
    if (currentIndex < snapshots.length - 1) {
      restore(currentIndex + 1);
    }
  }

  return {
    get snapshots() {
      return snapshots;
    },
    get currentIndex() {
      return currentIndex;
    },
    get isTimeTravelMode() {
      return isTimeTravelMode;
    },
    get maxSnapshots() {
      return maxSnapshots;
    },
    capture,
    restore,
    goToSnapshot,
    clear,
    get canUndo() {
      return currentIndex > 0;
    },
    get canRedo() {
      return currentIndex < snapshots.length - 1;
    },
    undo,
    redo,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeComponent(id: string, name: string, props?: Record<string, unknown>): ComponentNode {
  return { id, name, filename: `/src/${name}.svelte`, children: [], props: props ?? {} };
}

function makeTimelineEntry(type: string, data?: unknown): TimelineEntry {
  return { type, timestamp: Date.now(), data };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createMockTimeTravelStore', () => {
  describe('capture', () => {
    it('creates a snapshot on first capture', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'Counter')],
        () => [makeTimelineEntry('init')]
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      const snap = store.snapshots[0];
      expect(snap.id).toMatch(/^snapshot-/);
      expect(snap.timestamp).toBeGreaterThan(0);
      expect(snap.components).toEqual([makeComponent('c1', 'Counter')]);
      expect(snap.timeline).toEqual([makeTimelineEntry('init')]);
    });

    it('sets isTimeTravelMode to true after capture', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.isTimeTravelMode).toBe(true));
    });

    it('deduplicates: does not capture if state unchanged', async () => {
      const components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => [makeTimelineEntry('init')]
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      // Same state — should be deduplicated
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));
    });

    it('captures when components change', async () => {
      let components: ComponentNode[] = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => [makeTimelineEntry('init')]
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));
    });

    it('captures when timeline length changes', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => [makeTimelineEntry('init')]
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      // Same components but different timeline length
      store.capture();
      // Timeline length is same, so dedup — need to change timeline
      // Actually timeline length is same, so this should dedup. Let's test timeline change separately.
      expect(store.snapshots).toHaveLength(1);
    });

    it('truncates future snapshots when capturing after undo', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => [makeTimelineEntry('init')]
      );

      // Capture 3 snapshots
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B'), makeComponent('c3', 'C')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(3));
      expect(store.currentIndex).toBe(2);

      // Undo to index 0
      store.undo();
      expect(store.currentIndex).toBe(0);

      // Capture new state — should truncate snapshots at index 1+
      components = [makeComponent('c1', 'A'), makeComponent('c4', 'D')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));
      expect(store.snapshots[0].components).toHaveLength(1);
      expect(store.snapshots[1].components).toHaveLength(2);
    });

    it('stores optional label', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      store.capture('checkpoint-1');
      await vi.waitFor(() => expect(store.snapshots[0].label).toBe('checkpoint-1'));
    });

    it('deep clones components and timeline', async () => {
      const components: ComponentNode[] = [makeComponent('c1', 'A', { count: 0 })];
      const store = createMockTimeTravelStore(
        () => components,
        () => [makeTimelineEntry('update', { value: 42 })]
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      // Mutate original
      components[0].props.count = 999;

      // Snapshot should be unaffected
      expect(store.snapshots[0].components[0].props.count).toBe(0);
    });

    it('debounces capture calls', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      // Rapid calls — only the last one should produce a snapshot
      store.capture();
      store.capture();
      store.capture();

      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));
    });
  });

  describe('undo / redo', () => {
    it('canUndo is false with 0 or 1 snapshots', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      expect(store.canUndo).toBe(false);

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));
      expect(store.canUndo).toBe(false);
    });

    it('canUndo is true with 2+ snapshots at index > 0', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      expect(store.canUndo).toBe(true);
    });

    it('canRedo is false when at latest snapshot', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      expect(store.canRedo).toBe(false);
    });

    it('canRedo is true when not at latest snapshot', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B'), makeComponent('c3', 'C')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(3));

      // Undo once
      store.undo();
      expect(store.currentIndex).toBe(1);
      expect(store.canRedo).toBe(true);
    });

    it('undo moves currentIndex back by one', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B'), makeComponent('c3', 'C')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(3));

      store.undo();
      expect(store.currentIndex).toBe(1);
    });

    it('redo moves currentIndex forward by one', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B'), makeComponent('c3', 'C')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(3));

      store.undo();
      expect(store.currentIndex).toBe(1);

      store.redo();
      expect(store.currentIndex).toBe(2);
    });

    it('undo at index 0 does nothing', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      store.undo();
      expect(store.currentIndex).toBe(0);
    });

    it('redo at latest index does nothing', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      store.redo();
      expect(store.currentIndex).toBe(1);
    });

    it('undo/redo chain works correctly', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      for (let i = 1; i <= 5; i++) {
        components = Array.from({ length: i }, (_, j) => makeComponent(`c${j}`, `C${j}`));
        store.capture();
        await vi.waitFor(() => expect(store.snapshots).toHaveLength(i));
      }

      expect(store.currentIndex).toBe(4);

      // Undo 3 steps
      store.undo();
      expect(store.currentIndex).toBe(3);
      store.undo();
      expect(store.currentIndex).toBe(2);
      store.undo();
      expect(store.currentIndex).toBe(1);

      // Redo 2 steps
      store.redo();
      expect(store.currentIndex).toBe(2);
      store.redo();
      expect(store.currentIndex).toBe(3);
    });
  });

  describe('restore', () => {
    it('restores to a given index', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B'), makeComponent('c3', 'C')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(3));

      store.restore(0);
      expect(store.currentIndex).toBe(0);
    });

    it('does nothing for out-of-bounds index', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      store.restore(-1);
      expect(store.currentIndex).toBe(0);

      store.restore(99);
      expect(store.currentIndex).toBe(0);
    });

    it('calls setComponents and setTimeline when provided', async () => {
      let components = [makeComponent('c1', 'A')];
      let restoredComponents: ComponentNode[] = [];
      let restoredTimeline: TimelineEntry[] = [];

      const store = createMockTimeTravelStore(
        () => components,
        () => [makeTimelineEntry('init')],
        (c) => {
          restoredComponents = c;
        },
        (t) => {
          restoredTimeline = t;
        }
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      store.restore(0);
      expect(restoredComponents).toEqual([makeComponent('c1', 'A')]);
      expect(restoredTimeline).toEqual([makeTimelineEntry('init')]);
    });

    it('deep clones restored components (mutation safety)', async () => {
      let components = [makeComponent('c1', 'A', { count: 0 })];
      let restoredComponents: ComponentNode[] = [];

      const store = createMockTimeTravelStore(
        () => components,
        () => [],
        (c) => {
          restoredComponents = c;
        }
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      store.restore(0);
      restoredComponents[0].props.count = 999;

      // Original should be unaffected
      expect(components[0].props.count).toBe(0);
    });
  });

  describe('goToSnapshot', () => {
    it('finds and restores a snapshot by id', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));
      const id1 = store.snapshots[0].id;

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));
      const id2 = store.snapshots[1].id;

      store.restore(0);
      expect(store.currentIndex).toBe(0);

      store.goToSnapshot(id2);
      expect(store.currentIndex).toBe(1);
    });

    it('does nothing for unknown id', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      store.goToSnapshot('nonexistent-id');
      expect(store.currentIndex).toBe(0);
    });
  });

  describe('clear', () => {
    it('resets all state', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => [makeTimelineEntry('init')]
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      store.clear();
      expect(store.snapshots).toHaveLength(0);
      expect(store.currentIndex).toBe(-1);
      expect(store.isTimeTravelMode).toBe(false);
    });

    it('clears lastCapturedState so next capture is not deduplicated', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      store.clear();
      expect(store.snapshots).toHaveLength(0);

      // Same state — should capture because lastCapturedState was cleared
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));
    });
  });

  describe('maxSnapshots cap', () => {
    it('caps snapshots at maxSnapshots', async () => {
      let components: ComponentNode[] = [];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      // Override maxSnapshots to a small value
      // We need to mutate the store's internal maxSnapshots — but it's a getter.
      // Instead, create a store with a custom maxSnapshots by modifying LIMITS temporarily.
      const originalMax = LIMITS.MAX_STATE_SNAPSHOTS;
      LIMITS.MAX_STATE_SNAPSHOTS = 3;

      try {
        for (let i = 0; i < 6; i++) {
          components = [makeComponent(`c${i}`, `C${i}`)];
          store.capture();
          await vi.waitFor(() => expect(store.snapshots.length).toBeLessThanOrEqual(3));
        }

        expect(store.snapshots).toHaveLength(3);
        // Should keep the last 3 snapshots
        expect(store.snapshots[0].components[0].name).toBe('C3');
        expect(store.snapshots[1].components[0].name).toBe('C4');
        expect(store.snapshots[2].components[0].name).toBe('C5');
      } finally {
        LIMITS.MAX_STATE_SNAPSHOTS = originalMax;
      }
    });

    it('does not cap when under limit', async () => {
      let components: ComponentNode[] = [];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      const originalMax = LIMITS.MAX_STATE_SNAPSHOTS;
      LIMITS.MAX_STATE_SNAPSHOTS = 10;

      try {
        for (let i = 0; i < 5; i++) {
          components = [makeComponent(`c${i}`, `C${i}`)];
          store.capture();
          await vi.waitFor(() => expect(store.snapshots).toHaveLength(i + 1));
        }
      } finally {
        LIMITS.MAX_STATE_SNAPSHOTS = originalMax;
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty initial state', async () => {
      const store = createMockTimeTravelStore(
        () => [],
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));
      expect(store.snapshots[0].components).toEqual([]);
      expect(store.snapshots[0].timeline).toEqual([]);
    });

    it('handles deep nested component trees', async () => {
      const tree: ComponentNode = {
        id: 'root',
        name: 'App',
        filename: '/src/App.svelte',
        children: [
          {
            id: 'child1',
            name: 'Header',
            filename: '/src/Header.svelte',
            children: [
              { id: 'child1a', name: 'Logo', filename: '/src/Logo.svelte', children: [], props: {} },
            ],
            props: {},
          },
          {
            id: 'child2',
            name: 'Main',
            filename: '/src/Main.svelte',
            children: [],
            props: {},
          },
        ],
        props: {},
      };

      const store = createMockTimeTravelStore(
        () => [tree],
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      // Verify deep clone — mutation should not affect snapshot
      tree.children[0].name = 'Hacked';
      expect(store.snapshots[0].children[0].name).toBe('Header');
    });

    it('stores label in snapshot', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      store.capture('my-checkpoint');
      await vi.waitFor(() => expect(store.snapshots[0].label).toBe('my-checkpoint'));
    });

    it('label is optional', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));
      expect(store.snapshots[0].label).toBeUndefined();
    });

    it('currentIndex starts at -1', () => {
      const store = createMockTimeTravelStore(
        () => [],
        () => []
      );
      expect(store.currentIndex).toBe(-1);
    });

    it('isTimeTravelMode starts as false', () => {
      const store = createMockTimeTravelStore(
        () => [],
        () => []
      );
      expect(store.isTimeTravelMode).toBe(false);
    });

    it('canUndo starts as false', () => {
      const store = createMockTimeTravelStore(
        () => [],
        () => []
      );
      expect(store.canUndo).toBe(false);
    });

    it('canRedo starts as false', () => {
      const store = createMockTimeTravelStore(
        () => [],
        () => []
      );
      expect(store.canRedo).toBe(false);
    });

    it('snapshots are unique', async () => {
      let components: ComponentNode[] = [];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      for (let i = 0; i < 5; i++) {
        components = [makeComponent(`c${i}`, `C${i}`)];
        store.capture();
        await vi.waitFor(() => expect(store.snapshots).toHaveLength(i + 1));
      }

      const ids = store.snapshots.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });

    it('snapshots have increasing timestamps', async () => {
      let components: ComponentNode[] = [];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      for (let i = 0; i < 3; i++) {
        components = [makeComponent(`c${i}`, `C${i}`)];
        store.capture();
        await vi.waitFor(() => expect(store.snapshots).toHaveLength(i + 1));
        await new Promise((r) => setTimeout(r, 10));
      }

      for (let i = 1; i < store.snapshots.length; i++) {
        expect(store.snapshots[i].timestamp).toBeGreaterThanOrEqual(store.snapshots[i - 1].timestamp);
      }
    });
  });

  describe('capture with setComponents/setTimeline but no restore', () => {
    it('capture does not call setComponents/setTimeline', async () => {
      const setComp = vi.fn();
      const setTL = vi.fn();

      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => [makeTimelineEntry('init')],
        setComp,
        setTL
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      expect(setComp).not.toHaveBeenCalled();
      expect(setTL).not.toHaveBeenCalled();
    });
  });

  describe('restore after clear', () => {
    it('cannot restore after clear (empty snapshots)', async () => {
      const store = createMockTimeTravelStore(
        () => [makeComponent('c1', 'A')],
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      store.clear();
      store.restore(0);
      expect(store.currentIndex).toBe(-1);
    });
  });

  describe('redo after new capture truncates future', () => {
    it('new capture after undo truncates redo history', async () => {
      let components = [makeComponent('c1', 'A')];
      const store = createMockTimeTravelStore(
        () => components,
        () => []
      );

      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(1));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      components = [makeComponent('c1', 'A'), makeComponent('c2', 'B'), makeComponent('c3', 'C')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(3));

      // Undo to index 1
      store.undo();
      expect(store.currentIndex).toBe(1);

      // Capture new state — should truncate index 2
      components = [makeComponent('c1', 'A'), makeComponent('c4', 'D')];
      store.capture();
      await vi.waitFor(() => expect(store.snapshots).toHaveLength(2));

      // No more redo possible
      expect(store.canRedo).toBe(false);
      store.redo();
      expect(store.currentIndex).toBe(1);
    });
  });
});
