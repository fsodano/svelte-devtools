import {ComponentRegistry} from './instrumentation/registry.js';
import type {ComponentInstance, SvelteDevToolsAPI} from '@svelte-devtools/types';

type ComponentState = ComponentInstance;

interface DevToolsState {
    registry: ComponentRegistry;
    connected: boolean;
    components: Map<string, ComponentState>;
}

interface SvelteDevToolsRuntimeWindow extends Window {
    __SVELTE_DEVTOOLS_RUNTIME__?: typeof runtime;
    __SVELTE_DEVTOOLS_REGISTRY__?: Map<string, { id: string; name: string; filename: string }>;
    __SVELTE_DEVTOOLS__?: SvelteDevToolsAPI;
    __SVELTE_DEVTOOLS_DEBUG__?: boolean;
}

const isDebug = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>)?.__SVELTE_DEVTOOLS_DEBUG__;

const state: DevToolsState = {
    registry: new ComponentRegistry(),
    connected: false,
    components: new Map()
};

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

        // Intercept client-side fetch calls and emit client:request events
        if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
            const origFetch = window.fetch.bind(window);
            const self = this;
            window.fetch = ((input, init) => {
                const urlStr = typeof input === 'string' ? input
                    : input instanceof URL ? input.href
                    : input instanceof Request ? input.url
                    : String(input);
                const method = init?.method || 'GET';
                const startTime = performance.now();
                    const promise = origFetch(input, init);
                    promise.then(async (res) => {
                    const duration = performance.now() - startTime;
                    let respBody = '';
                    try { respBody = await res.clone().text(); } catch {/* ignore */}
                    const reqHeaders: Record<string, string> = {};
                    if (init?.headers) {
                        const h = init.headers;
                        if (h instanceof Headers) h.forEach((v, k) => { reqHeaders[k] = v; });
                        else if (Array.isArray(h)) h.forEach(([k, v]) => { reqHeaders[k] = v; });
                        else Object.assign(reqHeaders, h as Record<string, string>);
                    }
                    self.emit({
                        type: 'client:request',
                        componentId: '',
                        componentName: '',
                        timestamp: Date.now(),
                        data: {
                            url: urlStr,
                            method,
                            statusCode: res.status,
                            statusText: res.statusText,
                            duration,
                            responseSize: respBody.length,
                            responseHeaders: Object.fromEntries([...res.headers.entries()]),
                            requestHeaders: reqHeaders,
                            responsePreview: respBody.slice(0, 500),
                        }
                    });
                }).catch(() => {});
                return promise;
            }) as typeof window.fetch;
        }

        // Watch for DOM mutations to detect component mounts and unmounts.
        // Watches both childList (for new elements) and attributes (for
        // `data-svelte-devtools-id` which Svelte 5 sets after appending).
        if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
            const tryRegister = (el: Element, registry: Map<string, { id: string; name: string; filename: string }> | undefined) => {
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
                const removedId = el.getAttribute('data-svelte-devtools-id');
                if (removedId && state.components.has(removedId)) {
                    this.emit({
                        type: 'component:unmount',
                        componentId: removedId,
                        componentName: state.components.get(removedId)!.name,
                        timestamp: performance.now()
                    });
                    state.components.delete(removedId);
                }
                const descendants = el.querySelectorAll('[data-svelte-devtools-id]');
                for (const desc of descendants) {
                    const descId = desc.getAttribute('data-svelte-devtools-id');
                    if (descId && state.components.has(descId)) {
                        this.emit({
                            type: 'component:unmount',
                            componentId: descId,
                            componentName: state.components.get(descId)!.name,
                            timestamp: performance.now()
                        });
                        state.components.delete(descId);
                    }
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
            let parentId: string | undefined;
            if (typeof document !== 'undefined') {
                const el = document.querySelector(`[data-svelte-devtools-id="${id}"]`);
                if (el) {
                    componentState.el = el;
                    let parent = el.parentElement;
                    while (parent) {
                        const parentIdAttr = parent.getAttribute('data-svelte-devtools-id');
                        if (parentIdAttr && state.components.has(parentIdAttr)) {
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
                value: sanitizeForPostMessage(event.value)
            };
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
        const compSetters = this._registerStateStore.get(componentId);
        if (compSetters) {
            const setter = compSetters.get(key);
            if (setter) setter(value);
        }
        const comp = state.components.get(componentId);
        if (comp) comp.state.set(key, value);
    }
};

function sanitizeForPostMessage(value: unknown): unknown {
    if (typeof value === 'function') {
        return '[Function]';
    }
    if (value instanceof Element || value instanceof Node) {
        return '[DOM Node]';
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeForPostMessage);
    }
    if (value instanceof Map) {
        const obj: Record<string, unknown> = {};
        value.forEach((v, k) => {
            obj[String(k)] = sanitizeForPostMessage(v);
        });
        return obj;
    }
    if (value instanceof Set) {
        return Array.from(value).map(sanitizeForPostMessage);
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
                    obj[key] = sanitizeForPostMessage(desc.get.call(value));
                } catch (e) {
                    obj[key] = '[Error]';
                }
            } else if (typeof desc.value !== 'function') {
                obj[key] = sanitizeForPostMessage(desc.value);
            }
        }
        proto = Object.getPrototypeOf(proto);
    }

    return Object.keys(obj).length > 0 ? obj : String(value);
}

if (typeof window !== 'undefined') {
    const svelteDevToolsRuntime = (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_RUNTIME__ || runtime;
    svelteDevToolsRuntime.version = runtime.version;
    svelteDevToolsRuntime.init = runtime.init.bind(runtime);
    svelteDevToolsRuntime.registerComponent = runtime.registerComponent.bind(runtime);
    svelteDevToolsRuntime.emit = runtime.emit.bind(runtime);
    svelteDevToolsRuntime.getState = runtime.getState.bind(runtime);
    svelteDevToolsRuntime.handleEffect = runtime.handleEffect.bind(runtime);
    svelteDevToolsRuntime.reportError = runtime.reportError.bind(runtime);
    svelteDevToolsRuntime._registerState = runtime._registerState.bind(runtime);
    svelteDevToolsRuntime.setComponentState = runtime.setComponentState.bind(runtime);
    svelteDevToolsRuntime.refresh = runtime.refresh.bind(runtime);
    (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_RUNTIME__ = svelteDevToolsRuntime;

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
        getTimeline: () => [],
        setComponentState: (id: string, key: string, value: unknown) => {
            svelteDevToolsRuntime.setComponentState(id, key, value);
        },
        refresh: () => {
            svelteDevToolsRuntime.refresh();
        },
        subscribe: () => () => {
        },
        trace: () => {
        }
    };

    runtime.init();
}
