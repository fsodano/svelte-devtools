import { createWindowBridge } from '../bridge/window-bridge.js';
import { createTimeTravelStore } from './time-travel-store.svelte.js';
import type {
  ComponentNode,
  TimelineEntry,
  TraceTriggerEvent,
  BridgeHandler,
  ComponentMountPayload,
  ComponentUnmountPayload,
  StateChangePayload,
  EffectRunPayload
} from '@svelte-devtools/types';

interface ServerEvent {
  id: string;
  type: string;
  timestamp: number;
  duration?: number;
  data: {
    url?: string;
    method?: string;
    routeId?: string | null;
    error?: { message: string; stack?: string };
  };
}

function createDevtoolsStore() {
  let components = $state<ComponentNode[]>([]);
  let selectedComponentId = $state<string | null>(null);
  let timeline = $state<TimelineEntry[]>([]);
  let isConnected = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<ComponentNode[]>([]);
  // Semantic motion tracking. Active keys block all timeline recording
  // until all animations settle. A Spring/Tween is "settled" when the
  // current value from the $effect stops changing between frames — since
  // Spring easing is asymptotic, cur === tgt may never fire via $effect.
  const activeMotions = new Set<string>();
  const _lastCur = new Map<string, number>();
  const SETTLE_TOLERANCE = 0.0001;
  const bridge = createWindowBridge();
  const timeTravel = createTimeTravelStore(
    () => components,
    () => timeline,
    (c) => { components = c; },
    (t) => { timeline = t; }
  );
  let isRecording = $state(true);
  let ttTick = $state(0);
  let serverEvents = $state<unknown[]>([]);
  let serverEventsPollTimer: ReturnType<typeof setInterval> | null = null;
  let hasInitialMountCaptured = false;
  let stateCaptureTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Debounced state change batching ---
  // Rapid state updates (e.g. 20 PokemonCards firing $inspect on image load)
  // are batched into a single flush to avoid cascading reactive re-renders.
  const pendingStateChanges: Array<{
    componentId: string; key: string; value: unknown;
    isProp: boolean; prevValue: unknown; type: string;
    componentName: string;
  }> = [];
  let stateFlushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushStateChanges(): void {
    stateFlushTimer = null;
    if (pendingStateChanges.length === 0) return;

    // Build a map of the latest value per (componentId, key)
    const latest = new Map<string, { value: unknown; isProp: boolean }>();
    const timelineEntries: Array<{
      data: Record<string, unknown>; prevValue: unknown;
    }> = [];
    for (const ch of pendingStateChanges) {
      const mapKey = `${ch.componentId}::${ch.key}`;
      latest.set(mapKey, { value: ch.value, isProp: ch.isProp });
      timelineEntries.push({
        data: { componentId: ch.componentId, key: ch.key, value: ch.value,
                type: ch.type, componentName: ch.componentName },
        prevValue: ch.prevValue
      });
    }
    pendingStateChanges.length = 0;

    // Apply all latest values to components in a single pass
    components = components.map(c => {
      let mutated = false;
      let state = c.state;
      let props = c.props;
      for (const [mapKey, { value, isProp }] of latest) {
        if (mapKey.startsWith(c.id + '::')) {
          const key = mapKey.slice(c.id.length + 2);
          state = { ...state, [key]: value };
          if (isProp) props = { ...props, [key]: value };
          mutated = true;
        }
      }
      return mutated ? { ...c, state, props } : c;
    });

    // Batch-add timeline entries (single array copy)
    if (timelineEntries.length > 0) {
      const now = Date.now();
      const newEntries: TimelineEntry[] = timelineEntries.map(te => ({
        id: `evt-${now}-${Math.random().toString(36).substring(2, 11)}`,
        type: 'state:change' as const,
        timestamp: now,
        data: te.data
      }));
      timeline = [...timeline, ...newEntries].slice(-1000);
    }
  }

  function scheduleStateCapture(label = 'state', delayMs = 0): void {
    if (stateCaptureTimer) clearTimeout(stateCaptureTimer);
    stateCaptureTimer = setTimeout(() => {
      stateCaptureTimer = null;
      if (isRecording && !timeTravel.isTimeTravelMode && activeMotions.size === 0) {
        timeTravel.doCapture(label);
        ttTick++;
      }
    }, delayMs);
  }

  async function fetchServerEvents(): Promise<void> {
    try {
      const lastEventId = (serverEvents.length > 0) ? (serverEvents[serverEvents.length - 1] as Record<string, unknown>).id as string : undefined;
      const url = lastEventId
        ? `/__svelte-devtools/server-events?sinceId=${encodeURIComponent(lastEventId)}`
        : '/__svelte-devtools/server-events?last=50';
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const existingIds = new Set(serverEvents.map((e: unknown) => (e as Record<string, unknown>).id as string));
      const newEvents = (data as Array<Record<string, unknown>>).filter(e => !existingIds.has(e.id as string));
      if (newEvents.length > 0) {
        serverEvents = [...serverEvents, ...newEvents].slice(-1000);
        for (const evt of newEvents) {
          const typedEvt = evt as ServerEvent;
          addToTimeline({
            id: generateId(),
            type: typedEvt.type,
            timestamp: typedEvt.timestamp,
            data: typedEvt.data,
            duration: typedEvt.duration
          });
        }
      }
    } catch {
      // noop
    }
  }

  // Sync runtime state to server API cache every 2 seconds so HTTP API
  // endpoints can serve component/timeline data to AI agents and tooling.
  async function syncStateToServer(): Promise<void> {
    try {
      const snapshotTree = timeTravel.snapshots.map(s => ({
        id: s.id, parentId: s.parentId, branchId: s.branchId,
        timestamp: s.timestamp, label: s.label,
      }));
      const branchList = timeTravel.branches;
      const payload = JSON.stringify({
        components: components.map(c => ({ id: c.id, name: c.name, state: c.state, props: c.props, parentId: c.parentId, filename: c.filename })),
        timeline: timeline.map(e => ({ id: e.id, type: e.type, timestamp: e.timestamp, duration: e.duration, data: e.data })),
        snapshots: snapshotTree,
        branches: branchList,
      });
      // Use sendBeacon for fire-and-forget (doesn't block on page unload)
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/__svelte-devtools/api/sync', payload);
      } else {
        await fetch('/__svelte-devtools/api/sync', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } });
      }
    } catch {
      // Server not available yet — skip
    }
  }

  let syncTimer: ReturnType<typeof setInterval> | null = null;

  function startServerEventsPoll(): void {
    if (serverEventsPollTimer) return;
    fetchServerEvents();
    serverEventsPollTimer = setInterval(fetchServerEvents, 1000);
    syncStateToServer();
    syncTimer = setInterval(syncStateToServer, 2000);
  }

  function stopServerEventsPoll(): void {
    if (serverEventsPollTimer) clearInterval(serverEventsPollTimer);
    if (syncTimer) clearInterval(syncTimer);
    serverEventsPollTimer = null;
    syncTimer = null;
  }

  function init(): void {
    bridge.on('component:mount', handleComponentMount as BridgeHandler);
    bridge.on('component:unmount', handleComponentUnmount as BridgeHandler);
    bridge.on('state:change', handleStateChange as BridgeHandler);
    bridge.on('trace:trigger', handleTraceTrigger as BridgeHandler);
    bridge.on('effect:run', handleEffectRun as BridgeHandler);
    bridge.on('client:request', handleClientRequest as BridgeHandler);

    isConnected = true;
    startServerEventsPoll();
  }

  function handleComponentMount(payload: unknown): void {
    const node = ensureComponentNode(payload);
    const index = components.findIndex(c => c.id === node.id);
    if (index !== -1) {
      components[index] = node;
    } else {
      components = [...components, node];
    }

    addToTimeline({
      id: generateId(),
      type: 'component:mount',
      timestamp: Date.now(),
      data: {
        id: node.id,
        name: node.name,
        filename: node.filename,
        parentId: node.parentId
      }
    });

    if (isRecording && !hasInitialMountCaptured) {
      hasInitialMountCaptured = true;
      queueMicrotask(() => {
        if (isRecording && !timeTravel.isTimeTravelMode) {
          timeTravel.doCapture('mount');
        }
      });
    }
  }

  function ensureComponentNode(payload: unknown): ComponentNode {
    const p = payload as ComponentMountPayload;
    const stateObj = p.state instanceof Map ? Object.fromEntries(p.state) : (p.state ?? {});
    return {
      id: p.id,
      name: p.name,
      props: p.props instanceof Map ? Object.fromEntries(p.props) : (p.props ?? {}),
      state: stateObj,
      children: p.children ?? [],
      parentId: p.parentId,
      filename: p.filename,
      renderDuration: p.renderDuration
    };
  }

  function handleComponentUnmount(payload: unknown): void {
    const data = payload as ComponentUnmountPayload;
    const unmounted = components.find(c => c.id === data.id);
    components = components.filter(c => c.id !== data.id);
    addToTimeline({
      id: generateId(),
      type: 'component:unmount',
      timestamp: Date.now(),
      data: { id: data.id, name: unmounted?.name || data.name || 'unknown', filename: unmounted?.filename }
    });
  }

  function handleStateChange(payload: unknown): void {
    const data = payload as StateChangePayload;
    const existingComponent = components.find(c => c.id === data.componentId);
    if (!existingComponent) return;

    const value = data.value instanceof Map ? Object.fromEntries(data.value) : data.value;
    const isProp = (data as Record<string, unknown>).type === 'props';

    // ── Motion gate (Spring/Tween) ──────────────────────────────
    // Detect animation frames from the $effect watcher on class
    // instances. Mid-animation frames are dropped entirely; settled
    // frames proceed to the debounced batch.
    const isMotion = value && typeof value === 'object'
      && 'current' in (value as Record<string, unknown>)
      && 'target' in (value as Record<string, unknown>);
    if (isMotion) {
      const cur = (value as Record<string, unknown>).current as number;
      const tgt = (value as Record<string, unknown>).target as number;
      const key = `${data.componentId}::${data.key}`;
      const prev = _lastCur.get(key);
      const settled = cur === tgt || Math.abs(cur - tgt) < SETTLE_TOLERANCE;
      if (!settled) {
        _lastCur.set(key, cur);
        activeMotions.add(key);
        return; // mid‑animation → drop this frame entirely
      }
      // Settled: one last value, safe to record
      activeMotions.delete(key);
      if (prev !== undefined && Math.abs(cur - prev) < SETTLE_TOLERANCE) return; // dup
      _lastCur.set(key, cur);
    }

    // Queue into debounced batch instead of immediately rebuilding the
    // entire components array on every single $inspect fire.
    pendingStateChanges.push({
      componentId: data.componentId,
      key: data.key,
      value,
      isProp,
      prevValue: existingComponent.state?.[data.key],
      type: (data as Record<string, unknown>).type as string,
      componentName: existingComponent.name,
    });

    if (!stateFlushTimer) {
      stateFlushTimer = setTimeout(() => {
        flushStateChanges();

        // Time-travel and motion gates apply at flush time
        if (timeTravel.isTimeTravelMode) return;
        if (activeMotions.size > 0) return;

        if (isRecording) {
          scheduleStateCapture('state', 0);
        }
      }, 0);
    }
  }

  function handleTraceTrigger(payload: unknown): void {
    const data = (payload as TraceTriggerEvent['data']);
    addToTimeline({
      id: generateId(),
      type: 'trace:trigger',
      timestamp: Date.now(),
      data
    });
  }

  function handleClientRequest(payload: unknown): void {
    const p = payload as Record<string, unknown>;
    const reqData = p.data as Record<string, unknown> || {};
    addToTimeline({
      id: generateId(),
      type: 'client:request',
      timestamp: Date.now(),
      duration: reqData.duration as number,
      data: {
        url: reqData.url,
        method: reqData.method,
        statusCode: reqData.statusCode,
        duration: reqData.duration,
        responseSize: reqData.responseSize,
        responsePreview: reqData.responsePreview,
        requestBody: reqData.requestBody,
      }
    });
  }

  function handleEffectRun(payload: unknown): void {
    const data = payload as EffectRunPayload;
    addToTimeline({
      id: generateId(),
      type: 'effect:run',
      timestamp: Date.now(),
      data: payload,
      duration: data.duration
    });
  }

  function addToTimeline(entry: TimelineEntry): void {
    timeline = [...timeline, entry].slice(-1000);
  }

  /** Add multiple timeline entries in one array copy (avoids O(n²) behavior). */
  function addTimelineBatch(entries: TimelineEntry[]): void {
    if (entries.length === 0) return;
    timeline = [...timeline, ...entries].slice(-1000);
  }

  function clearTimeline(): void {
    if (stateCaptureTimer) {
      clearTimeout(stateCaptureTimer);
      stateCaptureTimer = null;
    }
    timeline = [];
  }

  function generateId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  function selectComponent(id: string): void {
    selectedComponentId = id;
  }

  function setSearchQuery(query: string, allComponents: ComponentNode[]): void {
    searchQuery = query;
    if (!query.trim()) {
      return; // Skip writing searchResults when query is empty — nothing reads it
    }

    const lowerQuery = query.toLowerCase();
    searchResults = allComponents.filter(comp => {
      if (comp.name.toLowerCase().includes(lowerQuery)) return true;
      if (comp.filename?.toLowerCase().includes(lowerQuery)) return true;
      const stateKeys = Object.keys(comp.state || {});
      if (stateKeys.some(key => key.toLowerCase().includes(lowerQuery))) return true;
      const stateValues = Object.values(comp.state || {});
      if (stateValues.some(val => String(val).toLowerCase().includes(lowerQuery))) return true;
      return false;
    });
  }

  function getFilteredComponents(allComponents: ComponentNode[]): ComponentNode[] {
    if (!searchQuery.trim()) return allComponents;
    return searchResults;
  }

  return {
    get components() { return components; },
    get selectedComponentId() { return selectedComponentId; },
    get timeline() { return timeline; },
    get isConnected() { return isConnected; },
    get searchQuery() { return searchQuery; },
    get searchResults() { return searchResults; },
    get timeTravel() { return timeTravel; },
    get serverEvents() { return serverEvents as ServerEvent[]; },
    get isRecording() { return isRecording; },
    set isRecording(v: boolean) { isRecording = v; },
    refresh() { bridge.refresh(); },
    init,
    selectComponent,
    setSearchQuery,
    getFilteredComponents,
    stopServerEventsPoll,
    clearTimeline,
    setServerEvents(events: unknown[]) { serverEvents = events; },
    restoreSnapshot(snapshotComponents: ComponentNode[], snapshotTimeline: TimelineEntry[]) {
      components = snapshotComponents;
      timeline = snapshotTimeline;
    }
  };
}

export const devtoolsStore = createDevtoolsStore();
