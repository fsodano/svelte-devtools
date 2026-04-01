import type { ComponentNode, TimelineEntry } from '@svelte-devtools/types';
import { LIMITS } from '@svelte-devtools/types';

/**
 * Time-travel debugging store
 * Captures state snapshots for rewinding application state
 */

export interface StateSnapshot {
  id: string;
  timestamp: number;
  components: ComponentNode[];
  timeline: TimelineEntry[];
  label?: string;
}

export interface TimeTravelStore {
  snapshots: StateSnapshot[];
  currentIndex: number;
  isTimeTravelMode: boolean;
  maxSnapshots: number;
  capture: () => void;
  restore: (index: number) => void;
  goToSnapshot: (id: string) => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

// Store state
let snapshots = $state<StateSnapshot[]>([]);
let currentIndex = $state(-1);
let isTimeTravelMode = $state(false);
let maxSnapshots = $state(LIMITS.MAX_STATE_SNAPSHOTS);
let lastCapturedState: { components: ComponentNode[]; timeline: TimelineEntry[] } | null = null;

// Debounce capture to avoid too many snapshots
let captureTimeout: ReturnType<typeof setTimeout> | null = null;
const CAPTURE_DEBOUNCE = 100; // ms

function generateSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function createTimeTravelStore(getComponents: () => ComponentNode[], getTimeline: () => TimelineEntry[]): TimeTravelStore {
  /**
   * Capture current state
   * Only captures if state has changed significantly
   */
  function capture(label?: string): void {
    if (captureTimeout) {
      clearTimeout(captureTimeout);
    }

    captureTimeout = setTimeout(() => {
      const components = getComponents();
      const timeline = getTimeline();

      // Check if state has changed significantly
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
        label
      };

      // If we're not at the end, truncate future snapshots
      if (currentIndex < snapshots.length - 1) {
        snapshots = snapshots.slice(0, currentIndex + 1);
      }

      snapshots.push(snapshot);

      // Limit snapshots
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

    const snapshot = snapshots[index];
    // Restore would be handled by the parent store
    currentIndex = index;
  }

  function goToSnapshot(id: string): void {
    const index = snapshots.findIndex(s => s.id === id);
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
    get snapshots() { return snapshots; },
    get currentIndex() { return currentIndex; },
    get isTimeTravelMode() { return isTimeTravelMode; },
    get maxSnapshots() { return maxSnapshots; },
    capture,
    restore,
    goToSnapshot,
    clear,
    get canUndo() { return currentIndex > 0; },
    get canRedo() { return currentIndex < snapshots.length - 1; },
    undo,
    redo
  };
}
