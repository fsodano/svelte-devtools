import { AsyncLocalStorage } from 'node:async_hooks';

export interface ServerTraceEvent {
    id: string;
    type: string;
    timestamp: number;
    duration?: number;
    data: Record<string, unknown>;
}

export interface TraceContext {
    traceId: string;
    spanId: string;
    routeId?: string | null;
    emit?: (event: ServerTraceEvent) => void;
    /** Set by the Kit handle so the outer HTTP middleware does not emit twice. */
    handledByKit?: boolean;
    injectPath?: string;
    fetchInProgress?: boolean;
}

// Vite can evaluate this module both as plugin code and through its SSR loader.
// Share context, not URL/timestamp guesses, across those module instances.
const key = Symbol.for('svelte-devtools.trace-context.v1');
const globals = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<TraceContext> };
const storage = globals[key] ??= new AsyncLocalStorage<TraceContext>();

export function getTraceContext(): TraceContext | undefined { return storage.getStore(); }
export function runWithTraceContext<T>(context: TraceContext, callback: () => T): T {
    return storage.run(context, callback);
}
export function emitServerEvent(event: ServerTraceEvent): void {
    try { getTraceContext()?.emit?.(event); } catch { /* Inspection must not alter the application. */ }
}
