import type {BridgeHandler, ComponentInstance, ComponentMountPayload, SvelteDevToolsAPI} from '@fsodano/svelte-devtools-types';
import {mapRuntimeEventTypeToBridge, RUNE_TYPES, toDisplayValue} from '@fsodano/svelte-devtools-types';

const isDebug = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__SVELTE_DEVTOOLS_DEBUG__;

// Security: only trust messages from the same-origin app page (the parent
// window). The runtime posts from there; any other sender is hostile.
const ALLOWED_LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isAllowedMessageOrigin(origin: string): boolean {
    try {
        const url = new URL(origin);
        return (url.protocol === 'http:' || url.protocol === 'https:')
            && ALLOWED_LOCAL_HOSTNAMES.has(url.hostname);
    } catch {
        return false;
    }
}

function isValidBridgeMessage(event: MessageEvent, targetWindow: Window): boolean {
    return event.source === targetWindow && isAllowedMessageOrigin(event.origin);
}

export function createWindowBridge() {
    const listeners = new Map<string, Set<BridgeHandler>>();
    const mountedComponents = new Set<string>();
    const cleanups: Array<() => void> = [];
    let disposed = false;
    function dispose(): void {
        if (disposed) return;
        disposed = true;
        for (const cleanup of cleanups.splice(0)) cleanup();
        listeners.clear();
        mountedComponents.clear();
    }

    if (typeof window !== 'undefined') {
        const targetWindow = window.parent !== window ? window.parent : window;

        const handleMessage = (event: MessageEvent) => {
            if (!isValidBridgeMessage(event, targetWindow)) return;

            const data = event.data;
            if (!data || data.source !== 'svelte-devtools') return;

            if (isDebug) console.log('[Bridge:postMessage] Received event:', data.type, 'timestamp:', Date.now());
            const bridgeType = mapRuntimeEventTypeToBridge(data.type);
            if (isDebug) console.log('[Bridge:postMessage] Mapped to bridge type:', bridgeType);
            const callbacks = listeners.get(bridgeType);
            if (isDebug) console.log('[Bridge:postMessage] Callbacks found:', callbacks?.size || 0);
            if (callbacks) {
                const mappedPayload = mapPostMessagePayload(data.payload, data.type);
                if (isDebug) console.log('[Bridge:postMessage] Mapped payload:', mappedPayload);
                callbacks.forEach(fn => {
                    try {
                        fn(mappedPayload);
                    } catch (e) {
                        console.error('[Bridge] postMessage listener error:', e);
                    }
                });
            } else {
                if (isDebug) console.log('[Bridge:postMessage] No callbacks registered for type:', bridgeType);
            }
        };
        targetWindow.addEventListener('message', handleMessage);
        cleanups.push(() => targetWindow.removeEventListener('message', handleMessage));
        const handlePageHide = (event: PageTransitionEvent) => { if (!event.persisted) dispose(); };
        window.addEventListener('pagehide', handlePageHide);
        cleanups.push(() => window.removeEventListener('pagehide', handlePageHide));

        if (window.parent && window.parent !== window) {
            const parentWindow = window.parent as unknown as { __SVELTE_DEVTOOLS__?: SvelteDevToolsAPI };

            const syncComponents = () => {
                const parentApi = parentWindow.__SVELTE_DEVTOOLS__;
                if (!parentApi) return;

                const components = parentApi.getAllComponents?.() || [];

                components.forEach((comp: ComponentInstance) => {
                    if (!mountedComponents.has(comp.id)) {
                        mountedComponents.add(comp.id);
                        const callbacks = listeners.get('component:mount');
const payload: ComponentMountPayload = {
    id: comp.id,
    name: comp.name,
    props: toDisplayValue(comp.props || {}) as Record<string, unknown>,
    state: toDisplayValue(Object.fromEntries(comp.state || [])) as Record<string, unknown>,
    children: (comp.children || []) as string[],
    parentId: comp.parentId,
    filename: comp.filename
};
                        callbacks?.forEach(fn => fn(payload));
                    }
                });
            };

            let connected = false;
            const connectInterval = setInterval(() => {
                if (parentWindow.__SVELTE_DEVTOOLS__) {
                    connected = true;
                    clearInterval(connectInterval);
                    syncComponents();
                }
            }, 100);

            const connectTimeout = setTimeout(() => clearInterval(connectInterval), 5000);

            if (connected) {
                syncComponents();
            }

            const syncInterval = setInterval(syncComponents, 500);
            cleanups.push(() => {
                clearInterval(connectInterval);
                clearTimeout(connectTimeout);
                clearInterval(syncInterval);
            });

            // Listen for unmount events to clean up tracking
            const handleUnmount = (event: MessageEvent) => {
                if (!isValidBridgeMessage(event, targetWindow)) return;

                const data = event.data;
                if (data?.source === 'svelte-devtools' && (data?.type === 'component-unmount' || data?.type === 'component:unmount')) {
                    const payload = data.payload as { componentId?: string; id?: string };
                    const id = payload?.componentId || payload?.id;
                    if (id) mountedComponents.delete(id);
                }
            };
            targetWindow.addEventListener('message', handleUnmount);
            cleanups.push(() => targetWindow.removeEventListener('message', handleUnmount));
        }
    }

    return {
        dispose,
        on(type: string, fn: BridgeHandler) {
            if (disposed) return () => {};
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(fn);
            return () => listeners.get(type)!.delete(fn);
        },
        refresh() {
            if (disposed) return;
            const parentWindow = window.parent as unknown as { __SVELTE_DEVTOOLS__?: SvelteDevToolsAPI };
            if (parentWindow.__SVELTE_DEVTOOLS__?.refresh) {
                parentWindow.__SVELTE_DEVTOOLS__.refresh();
            }
            if (parentWindow.__SVELTE_DEVTOOLS__) {
                const components = parentWindow.__SVELTE_DEVTOOLS__.getAllComponents?.() || [];
                components.forEach((comp: ComponentInstance) => {
                    if (!mountedComponents.has(comp.id)) {
                        mountedComponents.add(comp.id);
                        const callbacks = listeners.get('component:mount');
                        const payload: ComponentMountPayload = {
                            id: comp.id,
                            name: comp.name,
                            props: toDisplayValue(comp.props || {}) as Record<string, unknown>,
                            state: toDisplayValue(Object.fromEntries(comp.state || [])) as Record<string, unknown>,
                            children: (comp.children || []) as string[],
                            parentId: comp.parentId,
                            filename: comp.filename
                        };
                        callbacks?.forEach(fn => fn(payload));
                    }
                });
            }
        }
    };
}

function mapPostMessagePayload(payload: unknown, eventType: string): unknown {
    const _payload = payload as Record<string, unknown>;

    switch (eventType) {
        case 'component:unmount':
        case 'component-unmount':
            return { id: _payload.componentId || _payload.id, name: _payload.componentName || _payload.name };

        case RUNE_TYPES.STATE:
        case RUNE_TYPES.DERIVED:
        case RUNE_TYPES.INSPECT:
            return {
                componentId: _payload.componentId,
                key: _payload.key || 'state',
                value: _payload.value,
                prevValue: _payload.prevValue,
                type: _payload.inspectType  // forward the $inspect type for prop detection
            };

        case RUNE_TYPES.EFFECT:
        case RUNE_TYPES.EFFECT_PRE:
            return {
                componentId: _payload.componentId,
                effectName: _payload.key,
                dependencies: _payload.dependencies,
                duration: _payload.duration
            };

        case RUNE_TYPES.TRACE_TRIGGER:
            return {
                componentId: _payload.componentId,
                componentName: _payload.componentName,
                stateKey: (payload as Record<string, unknown>).stateKey,
                trigger: (payload as Record<string, unknown>).trigger
            };

        case RUNE_TYPES.COMPONENT_REGISTER:
            if (isDebug) console.log('[Bridge:mapPayload] component-register raw:', _payload);
            return {
                id: _payload.componentId || _payload.id,
                name: _payload.componentName || _payload.name,
                filename: _payload.filename,
                parentId: _payload.parentId
            };

        default:
            return payload;
    }
}
