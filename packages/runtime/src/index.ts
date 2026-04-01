import {ComponentRegistry} from './instrumentation/registry.js';
import type {SvelteDevToolsAPI} from '@svelte-devtools/types';

interface DevToolsState {
    registry: ComponentRegistry;
    connected: boolean;
    components: Map<string, ComponentState>;
}

interface ComponentState {
    id: string;
    name: string;
    filename?: string;
    state: Map<string, unknown>;
    parentId?: string;
}

interface SvelteDevToolsRuntimeWindow extends Window {
    __SVELTE_DEVTOOLS_RUNTIME__?: typeof runtime;
    __SVELTE_DEVTOOLS_REGISTRY__?: Map<string, { id: string; name: string; filename: string }>;
    __SVELTE_DEVTOOLS__?: SvelteDevToolsAPI;
}

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

        setInterval(() => {
            const registry = (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_REGISTRY__;
            if (!registry) return;

            for (const [id, meta] of registry.entries()) {
                if (!state.components.has(id)) {
                    this.registerComponent(id, meta.name, meta.filename);
                }
            }
        }, 100);
    },

    registerComponent(id: string, name: string, filename: string, sourceLocation?: string): void {
        if (state.components.has(id)) return;

        const componentState: ComponentState = {
            id,
            name,
            filename,
            state: new Map(),
            parentId: undefined
        };
        state.components.set(id, componentState);

        setTimeout(() => {
            let parentId: string | undefined;
            if (typeof document !== 'undefined') {
                const el = document.querySelector(`[data-svelte-devtools-id="${id}"]`);
                if (el) {
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
            console.log('[Runtime:registerComponent] Emitted:', id, name, 'parentId:', parentId);
        }, 0);
    },

    handleState(componentId: string, key: string, type: string, value: unknown): void {
        console.log('[Runtime:handleState] Called with:', {componentId, key, type, value});
        let component = state.components.get(componentId);

        if (!component) {
            console.log('[Runtime:handleState] Creating new component for ID:', componentId);
            component = {
                id: componentId,
                name: 'Unknown',
                filename: undefined,
                state: new Map()
            };
            state.components.set(componentId, component);
        }

        component.state.set(key, value);
        console.log('[Runtime:handleState] Component state updated:', componentId, 'key:', key, 'value:', value);

        this.emit({
            type: 'state' as const,
            componentId,
            componentName: component.name,
            key,
            value,
            timestamp: performance.now()
        });
    },

    emit(event: {
        type: string;
        componentId?: string;
        componentName?: string;
        filename?: string;
        timestamp: number;
        key?: string;
        value?: unknown
    }): void {
        if (typeof window !== 'undefined') {

            const sanitizedEvent = {
                ...event,
                value: sanitizeForPostMessage(event.value)
            };
            console.log('[Runtime:emit] Sending event:', sanitizedEvent.type, 'payload:', sanitizedEvent);
            window.postMessage({source: 'svelte-devtools', type: sanitizedEvent.type, payload: sanitizedEvent}, '*');
        }
    },

    getState(): DevToolsState {
        return state;
    },

    getAllComponents(): ComponentState[] {
        return Array.from(state.components.values());
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
    (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS_RUNTIME__ = svelteDevToolsRuntime;

    (window as SvelteDevToolsRuntimeWindow).__SVELTE_DEVTOOLS__ = {
        version: runtime.version,
        enabled: true,
        getComponentTree: () => {
            const allComponents = runtime.getAllComponents();
            const componentMap = new Map<string, any>();

            allComponents.forEach(c => {
                componentMap.set(c.id, {
                    id: c.id,
                    name: c.name,
                    filename: c.filename,
                    el: null,
                    parentId: c.parentId,
                    children: [],
                    state: c.state,
                    effects: [],
                    mountTime: 0
                });
            });

            const roots: any[] = [];
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
                state: c.state,
                effects: [],
                mountTime: 0
            };
        },
        getTimeline: () => [],
        subscribe: () => () => {
        },
        trace: () => {
        }
    };

    runtime.init();
}
