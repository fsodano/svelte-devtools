import type {BridgeHandler, ComponentInstance, ComponentMountPayload, SvelteDevToolsAPI} from '@svelte-devtools/types';
import {mapRuntimeEventTypeToBridge, RUNE_TYPES} from '@svelte-devtools/types';

const isDebug = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__SVELTE_DEVTOOLS_DEBUG__;

export function createWindowBridge() {
    const listeners = new Map<string, Set<BridgeHandler>>();

    if (typeof window !== 'undefined') {
        const targetWindow = window.parent !== window ? window.parent : window;

        targetWindow.addEventListener('message', (event) => {
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
        });

        if (window.parent && window.parent !== window) {
            const parentWindow = window.parent as unknown as { __SVELTE_DEVTOOLS__?: SvelteDevToolsAPI };
            const mountedComponents = new Set<string>();

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
                            state: Object.fromEntries(comp.state || []),
                            children: comp.children || [],
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

            setTimeout(() => clearInterval(connectInterval), 5000);

            if (connected) {
                syncComponents();
            }

            setInterval(syncComponents, 100);

            // Listen for unmount events to clean up tracking
            targetWindow.addEventListener('message', (event) => {
                const data = event.data;
                if (data?.source === 'svelte-devtools' && data?.type === 'component-unmount') {
                    const payload = data.payload as { componentId?: string; id?: string };
                    const id = payload?.componentId || payload?.id;
                    if (id) mountedComponents.delete(id);
                }
            });
        }
    }

    return {
        on(type: string, fn: BridgeHandler) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(fn);
            return () => listeners.get(type)!.delete(fn);
        }
    };
}

function mapPostMessagePayload(payload: unknown, eventType: string): unknown {
    const _payload = payload as Record<string, unknown>;

    switch (eventType) {
        case RUNE_TYPES.STATE:
        case RUNE_TYPES.DERIVED:
        case RUNE_TYPES.INSPECT:
            return {
                componentId: _payload.componentId,
                key: _payload.key || 'state',
                value: _payload.value,
                prevValue: _payload.prevValue
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
