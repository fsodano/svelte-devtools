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

export interface TimeTravelStore {
  snapshots: StateSnapshot[];
  currentIndex: number;
  isTimeTravelMode: boolean;
  maxSnapshots: number;
  capture: () => void;
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

let captureTimeout: ReturnType<typeof setTimeout> | null = null;
let captureMaxTimer: ReturnType<typeof setTimeout> | null = null;
const CAPTURE_DEBOUNCE = 100;
const CAPTURE_MAX_WAIT = 1000;

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
  // ── Hybrid restore lock ─────────────────────────────────────────
  // Sliding silence window + hard ceiling. After a restore, every
  // incoming state:change event resets a 50ms timer. The lock lifts
  // when Svelte 5's $effect re-runs go quiet for 50ms. A 2s hard
  // ceiling guarantees release even under continuous signal spam.
  let isRestoring = false;
  let _restoreSilenceTimer: ReturnType<typeof setTimeout> | null = null;
  let _restoreCeilingTimer: ReturnType<typeof setTimeout> | null = null;
  const SILENCE_THRESHOLD = 50;
  const HARD_CEILING = 2000;

  function _resetSilenceTimer(): void {
    if (_restoreSilenceTimer) clearTimeout(_restoreSilenceTimer);
    _restoreSilenceTimer = setTimeout(() => {
      _unlock();
    }, SILENCE_THRESHOLD);
  }

  function _unlock(): void {
    isRestoring = false;
    if (_restoreSilenceTimer) { clearTimeout(_restoreSilenceTimer); _restoreSilenceTimer = null; }
    if (_restoreCeilingTimer) { clearTimeout(_restoreCeilingTimer); _restoreCeilingTimer = null; }
  }

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
      // Check if this is a restore echo — pushStateToApp echoed the snapshot's
      // state back through $inspect. The components match, so skip entirely.
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
    isTimeTravelMode = true;
    lastCapturedState = { components: comps, timeline: tl };
  }

  function capture(label?: string): void {
    // While the restore lock is active, every incoming state:change
    // resets the silence timer. We return early here so no debounce
    // or capture is started — the snapshot only records once the
    // engine goes quiet for SILENCE_THRESHOLD ms.
    if (isRestoring) {
      _resetSilenceTimer();
      return;
    }

    // Trailing-edge only: wait for quiescence so intermediate animation
    // frames (Spring/Tween $effect re-runs) settle before capturing.
    if (captureTimeout) clearTimeout(captureTimeout);
    captureTimeout = setTimeout(() => {
      captureTimeout = null;
      captureMaxTimer = null;
      doCapture(label);
    }, CAPTURE_DEBOUNCE);

    // Max wait: guarantee a capture at least every 1s even under
    // continuous events (e.g. bridge polling every 100ms).
    if (!captureMaxTimer) {
      captureMaxTimer = setTimeout(() => {
        if (captureTimeout) {
          clearTimeout(captureTimeout);
          captureTimeout = null;
        }
        captureMaxTimer = null;
        doCapture(label);
      }, CAPTURE_MAX_WAIT);
    }
  }

  function pushStateToApp(components: ComponentNode[]): void {
    const parentApi = typeof window !== 'undefined'
      ? ((window.parent || window) as unknown as { __SVELTE_DEVTOOLS__?: Record<string, unknown> }).__SVELTE_DEVTOOLS__
      : undefined;
    if (!parentApi?.setComponentState) return;
    if (parentApi.startInspectBatch) parentApi.startInspectBatch();
    // Snapshot values are plain JSON (postMessage serialization), but live
    // Svelte signals hold Proxied Maps/Sets. Restoring a plain {} to a Map
    // signal crashes Svelte's proxy engine — detect via toStringTag which
    // works through Proxies (unlike instanceof).
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

  function restore(index: number, truncate = false): void {
    if (index < 0 || index >= snapshots.length) return;
    // Activate the hybrid restore lock. Every incoming state:change
    // while locked resets a 50ms silence timer. The lock lifts after
    // 50ms of quiet, or at 2s hard ceiling — whichever comes first.
    isRestoring = true;
    _resetSilenceTimer();
    _restoreCeilingTimer = setTimeout(() => {
      _unlock();
    }, HARD_CEILING);
    // Drain any pending capture timers so they can't race us.
    if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }
    if (captureMaxTimer) { clearTimeout(captureMaxTimer); captureMaxTimer = null; }
    // True time travel: if truncating, discard all future snapshots.
    // When a user clicks a snapshot dot the future is thrown away.
    if (truncate) snapshots = snapshots.slice(0, index + 1);
    currentIndex = index;
    isTimeTravelMode = true;
    const snapshot = snapshots[index];
    if (setComponents) {
      // Merge snapshot state into current components rather than replacing.
      // This preserves components that were discovered after the snapshot was
      // taken (e.g. child components mounted after the first mount capture).
      const current = getComponents();
      const merged = current.map(c => {
        const sc = snapshot.components.find(s => s.id === c.id);
        return sc ? { ...c, state: deepClone(sc.state) } : c;
      });
      // Add any snapshot-only components that are no longer in current
      // (e.g. components that were unmounted since the snapshot was taken)
      for (const sc of snapshot.components) {
        if (!merged.find(m => m.id === sc.id)) {
          merged.push(deepClone(sc));
        }
      }
      setComponents(merged);
    }
    if (setTimeline) setTimeline(deepClone(snapshot.timeline));

    // Lock the page to prevent network requests during time travel
    const parentApi = getParentApi();
    if (parentApi) {
      parentApi.isTimeTraveling = true;
      // Set Kit state snapshot for the $app/state Proxy to serve
      if (snapshot.kitState) {
        parentApi._kitSnapshot = snapshot.kitState;
      }
    }

    // Monkey-patch fetch to suppress network requests during restore
    if (typeof window !== 'undefined' && !_origFetch) {
      _origFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const api = getParentApi();
        if (api?.isTimeTraveling) {
          return new Promise(() => {}); // hang indefinitely
        }
        return _origFetch!(...args);
      };
    }

    pushStateToApp(snapshot.components);

    // Release fetch-level locks once the hard ceiling ensures all
    // reactive echoes have settled. The capture lock (isRestoring)
    // is managed independently by the silence + ceiling timers above.
    setTimeout(() => {
      if (parentApi) parentApi.isTimeTraveling = false;
      if (_origFetch) {
        window.fetch = _origFetch;
        _origFetch = null;
      }
    }, HARD_CEILING);

    onRestore?.();
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
    get currentIndex() { return currentIndex; },
    get isTimeTravelMode() { return isTimeTravelMode; },
    get maxSnapshots() { return maxSnapshots; },
    capture,
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
