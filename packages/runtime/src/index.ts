import { installNetworkTools } from './network-bridge.js';
import {ComponentRegistry} from './instrumentation/registry.js';
import { LIMITS, isJsonEditable, type TimelineEntry } from '@fsodano/svelte-devtools-types';
import type {ComponentInstance, SvelteDevToolsAPI} from '@fsodano/svelte-devtools-types';
export { getInitScript } from './init.js';

type ComponentState = ComponentInstance;

interface DevToolsState {
    registry: ComponentRegistry;
    connected: boolean;
    components: Map<string, ComponentState>;
}

import type { GlobalRuntime } from './init.js';

interface SvelteDevToolsRuntimeWindow extends Window {
    __SVELTE_DEVTOOLS_RUNTIME__: GlobalRuntime;
    __SVELTE_DEVTOOLS_REGISTRY__?: Map<string, { id: string; name: string; filename: string; parentId?: string }>;
    __SVELTE_DEVTOOLS__?: SvelteDevToolsAPI;
    __SVELTE_DEVTOOLS_DEBUG__?: boolean;
    __SVELTE_DEVTOOLS_TICK__?: () => Promise<void>;
    __SVELTE_DEVTOOLS_REAL_GOTO__?: (path: string, opts?: Record<string, unknown>) => Promise<void>;
}

const isDebug = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>)?.__SVELTE_DEVTOOLS_DEBUG__;

const state: DevToolsState = {
    registry: new ComponentRegistry(),
    connected: false,
    components: new Map()
};

const eventHistory: TimelineEntry[] = [];
const eventSubscribers = new Set<(event: unknown) => void>();
let nextEventId = 0;

function recordEvent(event: { type: string; timestamp: number; duration?: number; [key: string]: unknown }): void {
    const types: Record<string, string> = { state: 'state:change', effect: 'effect:run', 'component-register': 'component:mount' };
    eventHistory.push({
        id: `runtime-${++nextEventId}`,
        type: types[event.type] ?? event.type,
        timestamp: event.timestamp,
        data: structuredClone(event),
        ...(event.duration !== undefined ? { duration: event.duration } : {}),
    });
    if (eventHistory.length > LIMITS.MAX_TIMELINE_EVENTS) eventHistory.splice(0, eventHistory.length - LIMITS.MAX_TIMELINE_EVENTS);
    for (const callback of [...eventSubscribers]) {
        try { callback(structuredClone(event)); }
        catch (error) { if (isDebug) console.warn('[Svelte DevTools] Event subscriber failed:', error); }
    }
}

function clearEventObservers(): void {
    eventHistory.length = 0;
    eventSubscribers.clear();
}

export const runtime = {
    version: '0.0.1',
    init(): void {
        if (state.connected) return;
        state.connected = true;

        this.emit({
            type: 'runtime-ready',
            componentId: 'runtime',
            componentName: 'Runtime',
            timestamp: performance.now()
        });

        // Share the same interceptor for request inspection and panel mock rules.
        if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
            installNetworkTools(request => this.emit({
                type: 'client:request', componentId: '', componentName: '',
                timestamp: request.timestamp,
                data: { ...request, responsePreview: request.responseBody,
                    contentType: request.responseHeaders?.['content-type'],
                    responseSize: request.responseBody?.length },
            }));
        }

        // Watch for DOM mutations to detect component mounts and unmounts.
        // Watches both childList (for new elements) and attributes (for
        // `data-svelte-devtools-id` which Svelte 5 sets after appending).
        if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
            const tryRegister = (el: Element, registry: Map<string, { id: string; name: string; filename: string; parentId?: string }> | undefined) => {
                const id = el.getAttribute('data-svelte-devtools-id');
                if (id && !state.components.has(id) && registry?.has(id)) {
                    const meta = registry.get(id)!;
                    this.registerComponent(id, meta.name, meta.filename);
                }
                const descendants = el.querySelectorAll('[data-svelte-devtools-id]');
                for (const desc of descendants) {
                    const descId = desc.getAttribute('data-svelte-devtools-id');
                    if (descId && !state.components.has(descId) && registry?.has(descId)) {
                        const meta = registry.get(descId)!;
                        this.registerComponent(descId, meta.name, meta.filename);
                    }
                }
            };
            const tryUnregister = (el: Element) => {
                // A keyed each block can move a node without destroying its component.
                if (el.isConnected) return;
                const ids = [el, ...el.querySelectorAll('[data-svelte-devtools-id]')];
                for (const node of ids) {
                    const id = node.getAttribute('data-svelte-devtools-id');
                    // Injected components own their lifetime through onDestroy, even if
                    // a conditional removes their first DOM element.
                    if (id && !(window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_REGISTRY__?.has(id)) this.unregisterComponent(id);
                }
            };

            const observer = new MutationObserver((mutations) => {
                const registry = (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_REGISTRY__;
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-svelte-devtools-id') {
                        // Svelte 5 often sets the attribute AFTER the element is in the DOM
                        if (mutation.target instanceof Element) {
                            tryRegister(mutation.target, registry);
                        }
                    }
                    for (const node of mutation.addedNodes) {
                        if (node instanceof Element) {
                            tryRegister(node, registry);
                        }
                    }
                    for (const node of mutation.removedNodes) {
                        if (node instanceof Element) {
                            tryUnregister(node);
                        }
                    }
                }
            });
            const startObserver = () => {
                if (document.body) {
                    // Scan existing elements for components already mounted
                    const registry = (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_REGISTRY__;
                    const existing = document.body.querySelectorAll('[data-svelte-devtools-id]');
                    for (const el of existing) {
                        const id = el.getAttribute('data-svelte-devtools-id');
                        if (id && !state.components.has(id) && registry?.has(id)) {
                            const meta = registry.get(id)!;
                            this.registerComponent(id, meta.name, meta.filename);
                        }
                    }
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['data-svelte-devtools-id']
                    });
                } else {
                    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
                }
            };
            startObserver();
        }
    },

    unregisterComponent(id: string): void {
        const component = state.components.get(id);
        if (!component) return;
        this.emit({ type: 'component:unmount', componentId: id, componentName: component.name, timestamp: performance.now() });
        state.components.delete(id);
        this._registerStateStore.delete(id);
    },

    registerComponent(id: string, name: string, filename: string, sourceLocation?: string): void {
        if (state.components.has(id)) return;

        const componentState: ComponentState = {
            id,
            name,
            filename,
            el: null,
            state: new Map(),
            props: {},
            parentId: undefined,
            children: [],
            effects: [],
            mountTime: performance.now()
        };
        state.components.set(id, componentState);

        setTimeout(() => {
            if (!state.components.has(id)) return;
            // Context ancestry survives fragments, layouts and DOM portals. DOM ancestry
            // is only a fallback for components registered by older instrumentation.
            let parentId = (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_REGISTRY__?.get(id)?.parentId;
            if (typeof document !== 'undefined') {
                const el = document.querySelector(`[data-svelte-devtools-id="${id}"]`);
                if (el) {
                    componentState.el = el;
                    let parent = el.parentElement;
                    while (parent) {
                        const parentIdAttr = parent.getAttribute('data-svelte-devtools-id');
                        if (!parentId && parentIdAttr && parentIdAttr !== id && state.components.has(parentIdAttr)) {
                            parentId = parentIdAttr;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }
            }

            componentState.parentId = parentId;

            state.registry.register({
                name,
                props: {},
                timestamp: performance.now(),
                children: [],
                filename,
                parentId,
                sourceLocation: sourceLocation ? {filename: sourceLocation, line: 0, column: 0} : undefined
            });

            recordEvent({ type: 'component-register', componentId: id, componentName: name, filename, parentId, timestamp: performance.now() });
            window.postMessage({
                source: 'svelte-devtools',
                type: 'component-register',
                payload: {
                    id,
                    name,
                    filename,
                    parentId,
                    timestamp: performance.now()
                }
            }, '*');
            if (isDebug) console.log('[Runtime:registerComponent] Emitted:', id, name, 'parentId:', parentId);
        }, 0);
    },

    handleState(componentId: string, key: string, type: string, value: unknown): void {
        if (isDebug) console.log('[Runtime:handleState] Called with:', {componentId, key, type, value});
        let component = state.components.get(componentId);

        if (!component) {
            if (isDebug) console.log('[Runtime:handleState] Creating new component for ID:', componentId);
            component = {
                id: componentId,
                name: 'Unknown',
                filename: undefined,
                el: null,
                state: new Map(),
                props: {},
                parentId: undefined,
                children: [],
                effects: [],
                mountTime: performance.now(),
                isPlaceholder: true
            };
            state.components.set(componentId, component);
        }

        component.state.set(key, value);
        // Check if this key is a prop by looking at the registry metadata.
        // The plugin transform records $props() destructured keys in propKeys
        // and stores them in the registry during compilation.
        const registry = typeof window !== 'undefined'
            ? (window as unknown as Record<string, unknown>).__SVELTE_DEVTOOLS_REGISTRY__
            : undefined;
        const meta = (registry as Map<string, { propKeys?: string[] }> | undefined)?.get(componentId);
        if (meta?.propKeys?.includes(key)) {
            component.props = { ...component.props, [key]: value };
        }
        if (isDebug) console.log('[Runtime:handleState] Component state updated:', componentId, 'key:', key, 'value:', value);

        this.emit({
            type: 'state' as const,
            componentId,
            componentName: component.name,
            key,
            value,
            inspectType: type,  // forward the $inspect type ('state' | 'derived' | 'props')
            timestamp: performance.now()
        });
    },

    handleEffect(componentId: string, key: string, runeName: string, filename: string): void {
        if (isDebug) console.log('[Runtime:handleEffect] Called with:', {componentId, key, runeName, filename});
        const component = state.components.get(componentId);
        if (!component) return;
        if (!component.effects.includes(key)) {
            component.effects.push(key);
        }
        const stateSnapshot: Record<string, unknown> = {};
        for (const [k, v] of component.state) {
            stateSnapshot[k] = v;
        }
        this.emit({
            type: 'effect',
            componentId,
            componentName: component.name,
            key,
            value: {
                runeName,
                filename,
                runCount: component.effects.filter(e => e === key).length + 1,
                observedState: Object.keys(stateSnapshot).length > 0 ? stateSnapshot : undefined,
            },
            timestamp: Date.now()
        });
    },

    reportError(componentId: string, error: unknown): void {
        if (isDebug) console.log('[Runtime:reportError]', {componentId, error});
        this.emit({
            type: 'trace:trigger',
            componentId,
            componentName: (state.components.get(componentId)?.name) || 'unknown',
            key: 'error',
            value: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            },
            timestamp: Date.now()
        });
    },

    /** Force re-scan the DOM for any components missed by the observer. */
    refresh(): void {
        if (typeof document === 'undefined') return;
        const registry = (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_REGISTRY__;
        if (!registry) return;
        const existing = document.body?.querySelectorAll('[data-svelte-devtools-id]') ?? [];
        for (const el of existing) {
            const id = el.getAttribute('data-svelte-devtools-id');
            if (id && !state.components.has(id) && registry.has(id)) {
                const meta = registry.get(id)!;
                this.registerComponent(id, meta.name, meta.filename);
            }
        }
    },

    emit(event: {
        type: string;
        componentId?: string;
        componentName?: string;
        filename?: string;
        timestamp: number;
        key?: string;
        value?: unknown;
        inspectType?: string;
        data?: unknown;
        duration?: number;
    }): void {
        if (typeof window !== 'undefined') {

            const sanitizedEvent = {
                ...event,
                value: sanitizeForPostMessage(event.value),
                data: sanitizeForPostMessage(event.data)
            };
            recordEvent(sanitizedEvent);
            if (isDebug) console.log('[Runtime:emit] Sending event:', sanitizedEvent.type, 'payload:', sanitizedEvent);
            window.postMessage({source: 'svelte-devtools', type: sanitizedEvent.type, payload: sanitizedEvent}, '*');
        }
    },

    getState(): DevToolsState {
        return state;
    },

    getAllComponents(): ComponentState[] {
        return Array.from(state.components.values());
    },

    _registerStateStore: new Map<string, Map<string, (v: unknown) => void>>(),

    _registerState(componentId: string, key: string, setter: (v: unknown) => void): void {
        let compSetters = this._registerStateStore.get(componentId);
        if (!compSetters) {
            compSetters = new Map();
            this._registerStateStore.set(componentId, compSetters);
        }
        compSetters.set(key, setter);
    },

    setComponentState(componentId: string, key: string, value: unknown): void {
        // Snapshots cannot reconstruct functions, collections, or class instances.
        // Preserve those live values instead of replacing them with serialized previews.
        const current = state.components.get(componentId)?.state;
        if (current?.has(key) && !isJsonEditable(current.get(key))) return;
        const compSetters = this._registerStateStore.get(componentId);
        if (compSetters) {
            const setter = compSetters.get(key);
            if (setter) setter(value);
        }
        const comp = state.components.get(componentId);
        if (comp && compSetters?.has(key)) comp.state.set(key, value);
    },

    startInspectBatch(): void {
        if (isDebug) console.log('[Svelte DevTools] startInspectBatch');
    },

    endInspectBatch(): void {
        if (isDebug) console.log('[Svelte DevTools] endInspectBatch');
        // Signal the DevTools client once all pending reactivity microtasks
        // ($inspect callbacks, $effect flushes) have drained. A two-deep
        // queueMicrotask ensures this runs after every microtask queued by
        // the setComponentState calls in the current batch.
        queueMicrotask(() => {
            queueMicrotask(() => {
                window.postMessage({source: 'svelte-devtools', type: 'restore:echoes-done'}, '*');
            });
        });
    },

    flushAllEffects(): void {
        if (isDebug) console.log('[Svelte DevTools] flushAllEffects');
    }
};

function sanitizeForPostMessage(value: unknown, ancestors = new WeakSet<object>()): unknown {
    if (typeof value === 'function') {
        return '[Function]';
    }
    if ((typeof Element !== 'undefined' && value instanceof Element) || (typeof Node !== 'undefined' && value instanceof Node)) {
        return '[DOM Node]';
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (ancestors.has(value)) return '[Circular]';
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map(item => sanitizeForPostMessage(item, ancestors));
        }
        if (value instanceof Map) {
            const obj: Record<string, unknown> = {};
            value.forEach((v, k) => {
                obj[String(k)] = sanitizeForPostMessage(v, ancestors);
            });
            return obj;
        }
        if (value instanceof Set) {
            return Array.from(value).map(item => sanitizeForPostMessage(item, ancestors));
        }

        const obj: Record<string, unknown> = {};
        const seen = new Set<string>();
        let proto: unknown = value;

        while (proto && proto !== Object.prototype) {
            const descriptors = Object.getOwnPropertyDescriptors(proto);
            for (const [key, desc] of Object.entries(descriptors)) {
                if (seen.has(key)) continue;
                seen.add(key);
                if (typeof desc.get === 'function') {
                    try {
                        obj[key] = sanitizeForPostMessage(desc.get.call(value), ancestors);
                    } catch (e) {
                        obj[key] = '[Error]';
                    }
                } else if (typeof desc.value !== 'function') {
                    obj[key] = sanitizeForPostMessage(desc.value, ancestors);
                }
            }
            proto = Object.getPrototypeOf(proto);
        }

        return Object.keys(obj).length > 0 || Object.getPrototypeOf(value) === Object.prototype ? obj : String(value);
    } finally { ancestors.delete(value); }
}

// ============================================================================
// Element Inspector
// ============================================================================

let inspectorEnabled = false;
let inspectorOverlay: HTMLElement | null = null;
let inspectorTooltip: HTMLElement | null = null;

function inspectorFindComponentId(target: Element): string | null {
    let current: Element | null = target;
    while (current) {
        const id = current.getAttribute('data-svelte-devtools-id');
        if (id) return id;
        current = current.parentElement;
    }
    return null;
}

function inspectorClearOverlay(): void {
    if (inspectorOverlay) {
        inspectorOverlay.remove();
        inspectorOverlay = null;
    }
    if (inspectorTooltip) {
        inspectorTooltip.remove();
        inspectorTooltip = null;
    }
}

function inspectorShowOverlay(id: string, name: string): void {
    const target = document.querySelector(`[data-svelte-devtools-id="${id}"]`);
    if (!(target instanceof HTMLElement)) {
        inspectorClearOverlay();
        return;
    }
    const rect = target.getBoundingClientRect();

    if (!inspectorOverlay) {
        inspectorOverlay = document.createElement('div');
        inspectorOverlay.style.cssText =
            'position:fixed;top:0;left:0;box-sizing:border-box;pointer-events:none;' +
            'outline:2px solid #FF3E00;outline-offset:-2px;background:rgba(255,62,0,0.06);' +
            'z-index:2147483646;';
        document.body.appendChild(inspectorOverlay);
    }
    inspectorOverlay.style.top = `${rect.top}px`;
    inspectorOverlay.style.left = `${rect.left}px`;
    inspectorOverlay.style.width = `${rect.width}px`;
    inspectorOverlay.style.height = `${rect.height}px`;

    if (!inspectorTooltip) {
        inspectorTooltip = document.createElement('div');
        inspectorTooltip.style.cssText =
            'position:fixed;padding:2px 8px;font-size:11px;font-family:system-ui,sans-serif;' +
            'color:#fff;background:#FF3E00;border-radius:3px;pointer-events:none;' +
            'white-space:nowrap;z-index:2147483647;';
        document.body.appendChild(inspectorTooltip);
    }
    inspectorTooltip.textContent = name;
    const tooltipTop = rect.top >= 24 ? rect.top - 24 : rect.bottom + 4;
    inspectorTooltip.style.top = `${tooltipTop}px`;
    inspectorTooltip.style.left = `${rect.left}px`;
}

function onInspectorPointerOver(event: PointerEvent): void {
    if (!inspectorEnabled) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const id = inspectorFindComponentId(target);
    if (!id) {
        inspectorClearOverlay();
        return;
    }
    const component = state.components.get(id);
    inspectorShowOverlay(id, component?.name ?? 'Unknown');
}

function onInspectorClick(event: MouseEvent): void {
    if (!inspectorEnabled) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const id = inspectorFindComponentId(target);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    window.postMessage({
        source: 'svelte-devtools',
        type: 'inspect:select',
        payload: { componentId: id }
    }, '*');
    inspectorDisable();
}

function onInspectorKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        inspectorDisable();
    }
}

function inspectorEnable(): void {
    if (inspectorEnabled) return;
    inspectorEnabled = true;
    if (typeof document !== 'undefined') {
        document.addEventListener('pointerover', onInspectorPointerOver, true);
        document.addEventListener('click', onInspectorClick, true);
        document.addEventListener('keydown', onInspectorKeyDown, true);
    }
    window.postMessage({source: 'svelte-devtools', type: 'inspect:toggle', payload: {enabled: true}}, '*');
}

function inspectorDisable(): void {
    inspectorEnabled = false;
    if (typeof document !== 'undefined') {
        document.removeEventListener('pointerover', onInspectorPointerOver, true);
        document.removeEventListener('click', onInspectorClick, true);
        document.removeEventListener('keydown', onInspectorKeyDown, true);
    }
    inspectorClearOverlay();
    window.postMessage({source: 'svelte-devtools', type: 'inspect:toggle', payload: {enabled: false}}, '*');
}

if (typeof window !== 'undefined') {
    const svelteDevToolsRuntime = (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_RUNTIME__ || runtime;
    svelteDevToolsRuntime.version = runtime.version;
    svelteDevToolsRuntime.init = runtime.init.bind(runtime);
    svelteDevToolsRuntime.registerComponent = runtime.registerComponent.bind(runtime);
    svelteDevToolsRuntime.unregisterComponent = runtime.unregisterComponent.bind(runtime);
    svelteDevToolsRuntime.emit = runtime.emit.bind(runtime);
    svelteDevToolsRuntime.getState = runtime.getState.bind(runtime);
    svelteDevToolsRuntime.handleEffect = runtime.handleEffect.bind(runtime);
    svelteDevToolsRuntime.reportError = runtime.reportError.bind(runtime);
    svelteDevToolsRuntime._registerState = runtime._registerState.bind(runtime);
    svelteDevToolsRuntime.setComponentState = runtime.setComponentState.bind(runtime);
    svelteDevToolsRuntime.refresh = runtime.refresh.bind(runtime);
    (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_RUNTIME__ = svelteDevToolsRuntime;

    // Drain the __SVELTE_DEVTOOLS_QUEUE__ used by the Vite 8 transform for
    // _registerState calls that fired before the runtime finished loading.
    // Each entry is a function(runtime) that calls runtime._registerState(...).
    const win = window as unknown as Record<string, unknown>;
    var queuedFns = win.__SVELTE_DEVTOOLS_QUEUE__ as Array<(rt: typeof svelteDevToolsRuntime) => void> | undefined;
    if (queuedFns) {
        for (var k = 0; k < queuedFns.length; k++) {
            try { queuedFns[k](svelteDevToolsRuntime); } catch (e) {
                if (isDebug) console.warn('[Svelte DevTools] Error draining __SVELTE_DEVTOOLS_QUEUE__:', e);
            }
        }
        win.__SVELTE_DEVTOOLS_QUEUE__ = [];
    }

    (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS__ = {
        version: runtime.version,
        enabled: true,
        getComponentTree: () => {
            const allComponents = runtime.getAllComponents();
            interface TreeNode {
                id: string;
                name: string;
                filename?: string;
                el: Element | null;
                parentId?: string;
                children: TreeNode[];
                props: Record<string, unknown>;
                state: Map<string, unknown>;
                effects: string[];
                mountTime: number;
                isPlaceholder?: boolean;
            }
            const componentMap = new Map<string, TreeNode>();

            allComponents.forEach(c => {
                componentMap.set(c.id, {
                    id: c.id,
                    name: c.name,
                    filename: c.filename,
                    el: c.el,
                    parentId: c.parentId,
                    children: [],
                    props: c.props,
                    state: c.state,
                    effects: [...c.effects],
                    mountTime: c.mountTime,
                    isPlaceholder: c.isPlaceholder
                });
            });

            const roots: TreeNode[] = [];
            componentMap.forEach((node, id) => {
                if (node.parentId && componentMap.has(node.parentId)) {
                    componentMap.get(node.parentId)!.children.push(node);
                } else {
                    roots.push(node);
                }
            });

            return roots;
        },
        getAllComponents: () => runtime.getAllComponents().map(c => ({
            id: c.id,
            name: c.name,
            filename: c.filename,
            el: null,
            parentId: c.parentId,
            children: [],
            props: c.props,
            state: c.state,
            effects: [],
            mountTime: 0
        })),
        getComponentById: (id: string) => {
            const c = runtime.getAllComponents().find(c => c.id === id);
            if (!c) return undefined;
            return {
                id: c.id,
                name: c.name,
                filename: c.filename,
                el: null,
                parentId: c.parentId,
                children: [],
                props: c.props,
                state: c.state,
                effects: [],
                mountTime: 0
            };
        },
        getWritableStateKeys: (id: string) => Array.from(runtime._registerStateStore.get(id)?.keys() ?? []).filter(key => {
            const state = runtime.getState().components.get(id)?.state;
            return !!state?.has(key) && isJsonEditable(state.get(key));
        }),
        editComponentState: (id: string, key: string, value: unknown) => {
            if (!runtime.getState().components.has(id)) throw new Error('Component is no longer mounted.');
            if (!runtime._registerStateStore.get(id)?.has(key)) throw new Error('This value is read-only.');
            if (!isJsonEditable(runtime.getState().components.get(id)!.state.get(key)) || !isJsonEditable(value)) {
                throw new Error('This value cannot be edited safely as JSON. Functions and other non-JSON values are read-only.');
            }
            runtime.setComponentState(id, key, value);
        },
        getTimeline: () => structuredClone(eventHistory),
        setComponentState: (id: string, key: string, value: unknown) => {
            svelteDevToolsRuntime.setComponentState(id, key, value);
        },
        startInspectBatch: () => {
            svelteDevToolsRuntime.startInspectBatch();
        },
        endInspectBatch: () => {
            svelteDevToolsRuntime.endInspectBatch();
        },
        flushAllEffects: () => {
            svelteDevToolsRuntime.flushAllEffects();
        },
        refresh: () => {
            svelteDevToolsRuntime.refresh();
        },
        enableInspector: () => {
            inspectorEnable();
        },
        disableInspector: () => {
            inspectorDisable();
        },
        subscribe: (callback) => {
            // Each subscription owns its registration, even for the same callback.
            const listener = (event: unknown) => callback(event);
            eventSubscribers.add(listener);
            return () => { eventSubscribers.delete(listener); };
        },
        trace: (name, dependencies) => {
            runtime.emit({ type: 'trace:trigger', componentId: '', componentName: name,
                key: name, value: { name, dependencies: [...dependencies] }, timestamp: Date.now() });
        }
    };

    window.addEventListener('pagehide', (event) => {
        if (!event.persisted) clearEventObservers();
    });
    runtime.init();
}
