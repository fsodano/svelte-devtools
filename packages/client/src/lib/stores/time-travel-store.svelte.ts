import type { ComponentNode, TimelineEntry } from '@fsodano/svelte-devtools-types';
import { LIMITS } from '@fsodano/svelte-devtools-types';

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
  /** Clear isTimeTravelMode and process any deferred restore. Called by the
   *  devtools-store motion gate after restore animations drain. */
  clearTimeTravelMode: () => void;
  maxSnapshots: number;
  capture: (label?: string) => void;
  /** Direct capture call — no debounce, no timers. Gate via isTimeTravelMode
   *  and activeMotions in the DevTools store before calling this. */
  doCapture: (label?: string) => void;
  restore: (index: number, truncate?: boolean) => Promise<void>;
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
      const parentWin = getParentWindow();
      if (!parentWin) return null;
      const parentApi = (parentWin as unknown as { __SVELTE_DEVTOOLS__?: Record<string, unknown> }).__SVELTE_DEVTOOLS__;

      // Prefer the runtime-provided kit state reader when it exists.
      if (parentApi && typeof parentApi._readKitState === 'function') {
        return (parentApi._readKitState as () => KitState | null)();
      }

      // Fallback: _readKitState is never defined at runtime — read the URL
      // directly from the parent window so snapshots capture the route.
      return {
        url: {
          href: parentWin.location.href,
          origin: parentWin.location.origin,
          pathname: parentWin.location.pathname,
          search: parentWin.location.search,
          hash: parentWin.location.hash,
        },
      };
    } catch { return null; }
  }

  function doCapture(label?: string): void {
    if (isTimeTravelMode) return;
    const comps = getComponents();
    const tl = getTimeline();

    // If the current components are byte-identical to the last snapshot
    // that was restored, skip. This catches phantom captures from
    // pushStateToApp echoes that arrive after isTimeTravelMode clears.
    if (lastRestoredSnapshotJSON && JSON.stringify(comps) === lastRestoredSnapshotJSON) {
      lastCapturedState = { components: comps, timeline: tl };
      return;
    }

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
    // Restore dedup is now stale — the user made a real change.
    lastRestoredSnapshotJSON = null;
  }

  // capture() is a pass-through to doCapture — the devtools-store gates
  // via isTimeTravelMode + activeMotions before calling either.
  function capture(label?: string): void {
    doCapture(label);
  }

  function pushStateToApp(components: ComponentNode[]): void {
    const parentApi = getParentApi() as Record<string, (args?: unknown) => void> | undefined;
    if (!parentApi?.setComponentState) return;
    parentApi.startInspectBatch?.();
    const isMapOrSet = (v: unknown) => {
      const tag = Object.prototype.toString.call(v);
      return tag === '[object Map]' || tag === '[object Set]';
    };
    const liveComps = typeof parentApi.getAllComponents === 'function'
      ? (parentApi.getAllComponents as () => Array<{ id: string; state: Map<string, unknown> }>)()
      : [];
    for (const comp of components) {
      const liveComp = liveComps.find(c => c.id === comp.id);
      for (const [key, value] of Object.entries(comp.props || {})) {
        (parentApi.setComponentState as (id: string, key: string, value: unknown) => void)(comp.id, key, value);
      }
      for (const [key, value] of Object.entries(comp.state || {})) {
        const liveVal = liveComp?.state?.get(key);
        if (liveVal !== undefined && isMapOrSet(liveVal)) continue;
        (parentApi.setComponentState as (id: string, key: string, value: unknown) => void)(comp.id, key, value);
      }
    }
    parentApi.endInspectBatch?.();
    parentApi.flushAllEffects?.();
  }

  function getParentApi(): Record<string, unknown> | undefined {
    return typeof window !== 'undefined'
      ? ((window.parent || window) as unknown as { __SVELTE_DEVTOOLS__?: Record<string, unknown> }).__SVELTE_DEVTOOLS__
      : undefined;
  }

  let _origFetch: typeof window.fetch | null = null;
  let pendingRestoreIndex: number | null = null;
  // Serialized components of the last restore snapshot. Compared at the
  // top of doCapture to catch ANY capture that happens after a restore.
  let lastRestoredSnapshotJSON: string | null = null;
  let _isJumpingRoute = false;

  function getParentWindow(): Window | null {
    return typeof window !== 'undefined' ? ((window.parent || window) as Window) : null;
  }

  function internalClearTTMode(): void {
    if (!isTimeTravelMode) return;
    lastCapturedState = { components: getComponents(), timeline: getTimeline() };
    isTimeTravelMode = false;
    const next = pendingRestoreIndex;
    pendingRestoreIndex = null;
    if (next !== null) doRestore(next, false);
  }

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
      lastCapturedState = { components: getComponents(), timeline: getTimeline() };
    }
    // Store the restored snapshot's components JSON for post-restore
    // capture dedup that can happen after isTimeTravelMode is cleared.
    lastRestoredSnapshotJSON = JSON.stringify(snapshot.components);
    if (setTimeline) setTimeline(deepClone(snapshot.timeline));
    pushStateToApp(snapshot.components);
    onRestore?.();

    // isTimeTravelMode stays true to block phantom captures from pushStateToApp
    // echoes. The flushStateChanges gate in the devtools store (line 321) will
    // call clearTimeTravelMode when the echo's timer fires and the capture is
    // blocked. No microtask fallback here — microtasks run before the flush
    // timer's macrotask, so clearing early would defeat the gate.
    if (_origFetch) { window.fetch = _origFetch; _origFetch = null; }
    if (parentApi) parentApi.isTimeTraveling = false;
  }

  // __SVELTE_DEVTOOLS_TICK__ is never defined at runtime, so after a
  // cross-route goto we poll parentApi.getAllComponents() until the
  // snapshot's component ids mount (50ms interval, 2000ms budget).
  async function waitForRouteMount(snapshotComponents: ComponentNode[]): Promise<void> {
    const snapshotIds = new Set(snapshotComponents.map(c => c.id));
    const parentApi = getParentApi() as {
      getAllComponents?: () => Array<{ id: string }>;
    } | undefined;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const mounted = parentApi?.getAllComponents?.() ?? [];
      if (mounted.some(c => snapshotIds.has(c.id))) return;
      await new Promise<void>(resolve => setTimeout(resolve, 50));
    }
  }

  async function restore(index: number, truncate = false): Promise<void> {
    if (index < 0 || index >= snapshots.length || _isJumpingRoute) return;
    if (isTimeTravelMode) {
      pendingRestoreIndex = index;
      return;
    }

    // Cross-route detection: check if restoring a snapshot from a different URL
    const snapshot = snapshots[index];
    const parentWin = getParentWindow();

    if (
      parentWin &&
      snapshot.kitState?.url
    ) {
      const targetPath = snapshot.kitState.url.pathname + snapshot.kitState.url.search + snapshot.kitState.url.hash;
      const currentPath = parentWin.location.pathname + parentWin.location.search + parentWin.location.hash;

      if (currentPath !== targetPath) {
        _isJumpingRoute = true;
        isTimeTravelMode = false;
        const savedCurrentIndex = currentIndex;

        try {
          const realGoto = (parentWin as unknown as { __SVELTE_DEVTOOLS_REAL_GOTO__?: (path: string, opts: Record<string, unknown>) => Promise<void> }).__SVELTE_DEVTOOLS_REAL_GOTO__;
          if (typeof realGoto === 'function') {
            await realGoto(targetPath, { replaceState: true, keepFocus: true, noScroll: true });
          } else {
            const a = parentWin.document.createElement('a');
            a.href = targetPath;
            a.style.display = 'none';
            parentWin.document.body.appendChild(a);
            a.click();
            a.remove();
          }

          await waitForRouteMount(snapshot.components);
        } finally {
          _isJumpingRoute = false;
        }

        // Race condition guard: user may have clicked a different snapshot
        // while the navigation was in flight. Compare against the saved
        // currentIndex, NOT the target index (which is always different).
        if (currentIndex !== savedCurrentIndex && currentIndex !== -1) return;
      }
    }

    doRestore(index, truncate);
  }

  function goToSnapshot(id: string): void {
    const index = snapshots.findIndex(s => s.id === id);
    if (index !== -1) restore(index);
  }

  function setStateEdit(componentId: string, key: string, value: unknown): void {
    const comps = getComponents();
    const updated = comps.map(c => {
      if (c.id !== componentId) return c;
      const isProp = c.props !== undefined && Object.prototype.hasOwnProperty.call(c.props, key);
      if (isProp) {
        return { ...c, props: { ...c.props, [key]: value } };
      }
      return { ...c, state: { ...c.state, [key]: value } };
    });
    if (setComponents) setComponents(updated);
    pushStateToApp(updated);
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
    clearTimeTravelMode: () => {
      internalClearTTMode();
    },
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
