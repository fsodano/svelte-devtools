import type { ComponentNode, TimelineEntry } from '@svelte-devtools/types';
import { LIMITS } from '@svelte-devtools/types';

export interface StateSnapshot {
  id: string;
  parentId: string | null;
  branchId: string;
  timestamp: number;
  label: string;
  components: ComponentNode[];
  timeline: TimelineEntry[];
}

export interface BranchInfo {
  id: string;
  name: string;
  snapshotIds: string[];
  color: string;
}

export interface TimeTravelStore {
  snapshots: StateSnapshot[];
  currentIndex: number;
  currentBranchId: string;
  branches: BranchInfo[];
  isTimeTravelMode: boolean;
  maxSnapshots: number;
  capture: () => void;
  restore: (index: number) => void;
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

const BRANCH_COLORS = ['#ff3e00', '#40b3ff', '#6a9955', '#dcdcaa', '#ce9178', '#c586c0', '#4ec9b0'];
let branchColorIndex = 0;

function nextBranchColor(): string {
  return BRANCH_COLORS[branchColorIndex++ % BRANCH_COLORS.length];
}

function generateBranchId(): string {
  return `branch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

let snapshots = $state<StateSnapshot[]>([]);
let currentIndex = $state(-1);
let currentBranchId = $state('main');
let branches = $state<BranchInfo[]>([
  { id: 'main', name: 'main', snapshotIds: [], color: BRANCH_COLORS[0] }
]);
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
  setTimeline?: (t: TimelineEntry[]) => void
): TimeTravelStore {
  function doCapture(label?: string): void {
    const comps = getComponents();
    const tl = getTimeline();

    if (lastCapturedState) {
      const componentsChanged = JSON.stringify(comps) !== JSON.stringify(lastCapturedState.components);
      const timelineChanged = tl.length !== lastCapturedState.timeline.length;
      if (!componentsChanged && !timelineChanged) return;
    }

    let branchId = currentBranchId;
    let parentId: string | null = snapshots.length > 0 && currentIndex >= 0
      ? snapshots[currentIndex].id
      : null;

    if (currentIndex < snapshots.length - 1) {
      branchId = generateBranchId();
      parentId = snapshots[currentIndex]?.id || null;
      branches = [...branches, {
        id: branchId,
        name: `fork-${branches.length}`,
        snapshotIds: [],
        color: nextBranchColor()
      }];
    }

    const snapshot: StateSnapshot = {
      id: generateSnapshotId(),
      parentId,
      branchId,
      timestamp: Date.now(),
      label: label || '',
      components: deepClone(comps),
      timeline: deepClone(tl),
    };

    snapshots = [...snapshots, snapshot];
    if (snapshots.length > maxSnapshots) {
      snapshots = snapshots.slice(snapshots.length - maxSnapshots);
    }

    const branch = branches.find(b => b.id === branchId);
    if (branch) {
      branch.snapshotIds = [...(branch.snapshotIds || []), snapshot.id];
    }

    currentIndex = snapshots.length - 1;
    currentBranchId = branchId;
    isTimeTravelMode = true;
    lastCapturedState = { components: comps, timeline: tl };
  }

  function capture(label?: string): void {
    // Leading-edge: capture immediately on first call
    if (!captureTimeout) {
      doCapture(label);
    }

    // Trailing-edge debounce: if more changes come within 100ms,
    // wait for quiescence before capturing again
    if (captureTimeout) clearTimeout(captureTimeout);
    captureTimeout = setTimeout(() => {
      captureTimeout = null;
      captureMaxTimer = null;
      doCapture(label);
    }, CAPTURE_DEBOUNCE);

    // Max wait: guarantee a capture at least every 1s even under
    // continuous events (e.g. bridge polling every 100ms)
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

  function restore(index: number): void {
    if (index < 0 || index >= snapshots.length) return;
    currentIndex = index;
    currentBranchId = snapshots[index].branchId;
    isTimeTravelMode = true;
    const snapshot = snapshots[index];
    if (setComponents) setComponents(deepClone(snapshot.components));
    if (setTimeline) setTimeline(deepClone(snapshot.timeline));
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
    currentBranchId = 'main';
    isTimeTravelMode = false;
    lastCapturedState = null;
    branches = [{ id: 'main', name: 'main', snapshotIds: [], color: BRANCH_COLORS[0] }];
    branchColorIndex = 0;
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
    get currentBranchId() { return currentBranchId; },
    get branches() { return branches; },
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
