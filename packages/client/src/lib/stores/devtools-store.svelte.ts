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
    () => timeline
  );

  function init(): void {
    console.log('[Store:init] Registering bridge handlers');
    bridge.on('component:mount', handleComponentMount as BridgeHandler);
    bridge.on('component:unmount', handleComponentUnmount as BridgeHandler);
    bridge.on('state:change', handleStateChange as BridgeHandler);
    bridge.on('trace:trigger', handleTraceTrigger as BridgeHandler);
    bridge.on('effect:run', handleEffectRun as BridgeHandler);

    isConnected = true;
    console.log('[Store:init] Connected to bridge');
  }

  function handleComponentMount(payload: unknown): void {
    console.log('[Store:handleComponentMount] Received:', payload);
    const node = ensureComponentNode(payload);
    console.log('[Store:handleComponentMount] Node:', node.id, 'parentId:', node.parentId);
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
    components = components.filter(c => c.id !== data.id);
    addToTimeline({
      id: generateId(),
      type: 'component:unmount',
      timestamp: performance.now(),
      data: { id: data.id }
    });
  }

  function handleStateChange(payload: unknown): void {
    console.log('[Store:handleStateChange] Received payload:', payload);
    const data = payload as StateChangePayload;
    const existingComponent = components.find(c => c.id === data.componentId);

    if (!existingComponent) {
      console.log('[Store:handleStateChange] Component not found:', data.componentId, '- dropping state change. Available components:', components.map(c => c.id));
      return;
    }

    const value = data.value instanceof Map ? Object.fromEntries(data.value) : data.value;
    console.log('[Store:handleStateChange] Updating component:', data.componentId, 'key:', data.key, 'value:', value);

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
      data
    });
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

  function generateId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  function selectComponent(id: string): void {
    selectedComponentId = id;
  }

  function setSearchQuery(query: string, allComponents: ComponentNode[]): void {
    searchQuery = query;
    if (!query.trim()) {
      searchResults = [];
      return;
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
    init,
    selectComponent,
    setSearchQuery,
    getFilteredComponents,
    captureState: () => timeTravel.capture()
  };
}

export const devtoolsStore = createDevtoolsStore();
