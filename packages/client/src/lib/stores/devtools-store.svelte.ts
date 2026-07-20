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
  const bridge = createWindowBridge();
  const timeTravel = createTimeTravelStore(
    () => components,
    () => timeline,
    (c) => { components = c; },
    (t) => { timeline = t; }
  );
  let serverEvents = $state<unknown[]>([]);
  let serverEventsPollTimer: ReturnType<typeof setInterval> | null = null;

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
      const payload = JSON.stringify({
        components: components.map(c => ({ id: c.id, name: c.name, state: c.state, props: c.props, parentId: c.parentId, filename: c.filename })),
        timeline: timeline.map(e => ({ id: e.id, type: e.type, timestamp: e.timestamp, duration: e.duration, data: e.data })),
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
      timestamp: performance.now(),
      data: node
    });

    timeTravel.capture('mount');
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
      timestamp: performance.now(),
      data: { id: data.id, name: unmounted?.name || data.name || 'unknown', filename: unmounted?.filename }
    });
  }

  function handleStateChange(payload: unknown): void {
    const data = payload as StateChangePayload;
    const existingComponent = components.find(c => c.id === data.componentId);

    if (!existingComponent) {
      return;
    }

    const value = data.value instanceof Map ? Object.fromEntries(data.value) : data.value;
    const prevValue = existingComponent.state?.[data.key];

    components = components.map(c => {
      if (c.id === data.componentId) {
        return { ...c, state: { ...c.state, [data.key]: value } };
      }
      return c;
    });

    addToTimeline({
      id: generateId(),
      type: 'state:change',
      timestamp: performance.now(),
      data: { ...data, prevValue, componentName: existingComponent.name }
    });

    timeTravel.capture('state');
  }

  function handleTraceTrigger(payload: unknown): void {
    const data = (payload as TraceTriggerEvent['data']);
    addToTimeline({
      id: generateId(),
      type: 'trace:trigger',
      timestamp: performance.now(),
      data
    });
  }

  function handleEffectRun(payload: unknown): void {
    const data = payload as EffectRunPayload;
    addToTimeline({
      id: generateId(),
      type: 'effect:run',
      timestamp: performance.now(),
      data: payload,
      duration: data.duration
    });
  }

  function addToTimeline(entry: TimelineEntry): void {
    timeline = [...timeline, entry].slice(-1000);
  }

  function clearTimeline(): void {
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
