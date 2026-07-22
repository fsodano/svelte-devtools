import type { ComponentNode, TimelineEntry } from '@svelte-devtools/types';
import { LIMITS } from '@svelte-devtools/types';

export interface KitState {
  data?: unknown;
  form?: unknown;
  url?: { href: string; origin: string; pathname: string; search: string; hash: string } | null;
  params?: Record<string, string>;
  route?: { id: string | null };
}

export interface StateSnapshot {
  id: string;
  parentId: string | null;
  branchId: string;
  timestamp: number;
  label: string;
  components: ComponentNode[];
  timeline: TimelineEntry[];
  kitState?: KitState | null;
}

export interface BranchInfo {
  id: string;
  name: string;
  snapshotIds: string[];
  color: string;
}

export interface TimeTravelStore {
  snapshots: StateSnapshot[];
  branches: BranchInfo[];
  currentIndex: number;
  isTimeTravelMode: boolean;
  maxSnapshots: number;
  capture: (label?: string) => void;
  /** Direct capture call — no debounce, no timers. Gate via isTimeTravelMode
   *  and activeMotions in the DevTools store before calling this. */
  doCapture: (label?: string) => void;
  restore: (index: number, truncate?: boolean) => void;
  goToSnapshot: (id: string) => void;
  setStateEdit: (componentId: string, key: string, value: unknown) => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  setComponents?: (c: ComponentNode[]) => void;
  setTimeline?: (t: TimelineEntry[]) => void;
}

let snapshots = $state<StateSnapshot[]>([]);
let currentIndex = $state(-1);
let isTimeTravelMode = $state(false);
let maxSnapshots = $state(LIMITS.MAX_STATE_SNAPSHOTS);
let lastCapturedState: { components: ComponentNode[]; timeline: TimelineEntry[] } | null = null;

function generateSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function createTimeTravelStore(
  getComponents: () => ComponentNode[],
  getTimeline: () => TimelineEntry[],
  setComponents?: (c: ComponentNode[]) => void,
  setTimeline?: (t: TimelineEntry[]) => void,
  onRestore?: () => void
): TimeTravelStore {
  function getKitStateFromParent(): KitState | null {
    try {
      const parentApi = (typeof window !== 'undefined'
        ? ((window.parent || window) as unknown as { __SVELTE_DEVTOOLS__?: Record<string, unknown> }).__SVELTE_DEVTOOLS__
        : undefined) as Record<string, unknown> | undefined;
      if (!parentApi || !parentApi._readKitState) return null;
      return (parentApi._readKitState as () => KitState | null)();
    } catch { return null; }
  }

  function doCapture(label?: string): void {
    const comps = getComponents();
    const tl = getTimeline();

    if (lastCapturedState) {
      const componentsChanged = JSON.stringify(comps) !== JSON.stringify(lastCapturedState.components);
      const timelineChanged = tl.length !== lastCapturedState.timeline.length;
      if (!componentsChanged && !timelineChanged) return;
    }

    // If we're in the past, truncate future snapshots (linear timeline)
    if (currentIndex < snapshots.length - 1) {
      const snapAtIdx = snapshots[currentIndex];
      if (snapAtIdx && JSON.stringify(comps) === JSON.stringify(snapAtIdx.components)) {
        lastCapturedState = { components: comps, timeline: tl };
        return;
      }
      snapshots = snapshots.slice(0, currentIndex + 1);
    }

    const snapshot: StateSnapshot = {
      id: generateSnapshotId(),
      parentId: snapshots.length > 0 && currentIndex >= 0
        ? snapshots[currentIndex].id
        : null,
      branchId: 'main',
      timestamp: Date.now(),
      label: label || '',
      components: deepClone(comps),
      timeline: deepClone(tl),
      kitState: getKitStateFromParent(),
    };

    snapshots = [...snapshots, snapshot];
    if (snapshots.length > maxSnapshots) {
      snapshots = snapshots.slice(snapshots.length - maxSnapshots);
    }

    currentIndex = snapshots.length - 1;
    lastCapturedState = { components: comps, timeline: tl };
  }

  // capture() is a pass-through to doCapture — the devtools-store gates
  // via isTimeTravelMode + activeMotions before calling either.
  function capture(label?: string): void {
    doCapture(label);
  }

  function pushStateToApp(components: ComponentNode[]): void {
    const parentApi = typeof window !== 'undefined'
      ? ((window.parent || window) as unknown as { __SVELTE_DEVTOOLS__?: Record<string, unknown> }).__SVELTE_DEVTOOLS__
      : undefined;
    if (!parentApi?.setComponentState) return;
    if (parentApi.startInspectBatch) parentApi.startInspectBatch();
    const isMapOrSet = (v: unknown) => {
      const tag = Object.prototype.toString.call(v);
      return tag === '[object Map]' || tag === '[object Set]';
    };
    const liveComps = typeof parentApi.getAllComponents === 'function'
      ? (parentApi.getAllComponents as () => Array<{ id: string; state: Map<string, unknown> }>)()
      : [];
    for (const comp of components) {
      const liveComp = liveComps.find(c => c.id === comp.id);
      for (const [key, value] of Object.entries(comp.state || {})) {
        const liveVal = liveComp?.state?.get(key);
        if (liveVal !== undefined && isMapOrSet(liveVal)) continue;
        (parentApi.setComponentState as (id: string, key: string, value: unknown) => void)(comp.id, key, value);
      }
    }
    if (parentApi.endInspectBatch) parentApi.endInspectBatch();
    parentApi.flushAllEffects?.();
  }

  function getParentApi(): Record<string, unknown> | undefined {
    return typeof window !== 'undefined'
      ? ((window.parent || window) as unknown as { __SVELTE_DEVTOOLS__?: Record<string, unknown> }).__SVELTE_DEVTOOLS__
      : undefined;
  }

  let _origFetch: typeof window.fetch | null = null;
  let pendingRestoreIndex: number | null = null;

  function doRestore(index: number, truncate = false): void {
    if (index < 0 || index >= snapshots.length) return;
    isTimeTravelMode = true;
    if (truncate) snapshots = snapshots.slice(0, index + 1);
    currentIndex = index;

    const parentApi = getParentApi();
    const snapshot = snapshots[index];
    if (parentApi) {
      parentApi.isTimeTraveling = true;
      if (snapshot.kitState) parentApi._kitSnapshot = snapshot.kitState;
    }
    if (typeof window !== 'undefined' && !_origFetch) {
      _origFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const api = getParentApi();
        if (api?.isTimeTraveling) return new Promise(() => {});
        return _origFetch!(...args);
      };
    }
    setTimeout(() => {
      if (parentApi) parentApi.isTimeTraveling = false;
      if (_origFetch) { window.fetch = _origFetch; _origFetch = null; }
    }, 2000);

    if (setComponents) {
      const current = getComponents();
      const merged = current.map(c => {
        const sc = snapshot.components.find(s => s.id === c.id);
        return sc ? { ...c, state: deepClone(sc.state) } : c;
      });
      for (const sc of snapshot.components) {
        if (!merged.find(m => m.id === sc.id)) merged.push(deepClone(sc));
      }
      setComponents(merged);
    }
    if (setTimeline) setTimeline(deepClone(snapshot.timeline));
    pushStateToApp(snapshot.components);
    onRestore?.();

    // Unlock via macrotask — gives Svelte 5 one event-loop tick to
    // flush all {hard: true} mutations and $inspect echoes before
    // the DevTools starts listening again. If another restore was
    // requested while in-flight, service it immediately after unlock.
    setTimeout(() => {
      isTimeTravelMode = false;
      const next = pendingRestoreIndex;
      pendingRestoreIndex = null;
      if (next !== null) doRestore(next, false);
    }, 0);
  }

  function restore(index: number, truncate = false): void {
    if (index < 0 || index >= snapshots.length) return;
    if (isTimeTravelMode) {
      // Defer — a restore is already in-flight; avoid racing its
      // pushStateToApp + setTimeout(0) unlock cycle.
      pendingRestoreIndex = index;
      return;
    }
    doRestore(index, truncate);
  }

  function goToSnapshot(id: string): void {
    const index = snapshots.findIndex(s => s.id === id);
    if (index !== -1) restore(index);
  }

  function setStateEdit(componentId: string, key: string, value: unknown): void {
    const comps = getComponents();
    const updated = comps.map(c =>
      c.id === componentId ? { ...c, state: { ...c.state, [key]: value } } : c
    );
    if (setComponents) setComponents(updated);
    capture('state-edit');
  }

  function clear(): void {
    snapshots = [];
    currentIndex = -1;
    isTimeTravelMode = false;
    lastCapturedState = null;
  }

  function undo(): void {
    if (currentIndex > 0) restore(currentIndex - 1);
  }

  function redo(): void {
    if (currentIndex < snapshots.length - 1) restore(currentIndex + 1);
  }

  return {
    get snapshots() { return snapshots; },
    get branches(): BranchInfo[] {
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
    },
    get currentIndex() { return currentIndex; },
    get isTimeTravelMode() { return isTimeTravelMode; },
    get maxSnapshots() { return maxSnapshots; },
    capture,
    doCapture,
    restore,
    goToSnapshot,
    setStateEdit,
    clear,
    get canUndo() { return currentIndex > 0; },
    get canRedo() { return currentIndex < snapshots.length - 1; },
    undo,
    redo,
    setComponents,
    setTimeline,
  };
}
