import type { Handle } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getTraceContext, runWithTraceContext, type TraceContext, type ServerTraceEvent } from './trace-context.js';
export type { Handle };

interface BodyPreview { text: string; bytes: number; truncated: boolean }
const emptyPreview = (): BodyPreview => ({ text: '', bytes: 0, truncated: false });

/** Read only an inspection branch. Neither uploads nor responses wait on tracing. */
function capturePreview(source: Request | Response, limit = 2000): Promise<BodyPreview> {
    try {
        const body = source.clone().body;
        if (!body) return Promise.resolve(emptyPreview());
        const reader = body.getReader();
        return new Promise(resolve => {
            const decoder = new TextDecoder();
            let text = '';
            let bytes = 0;
            let finished = false;
            const finish = (truncated: boolean) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                text += decoder.decode();
                resolve({ text, bytes, truncated });
                // Tee cancellation waits for both branches. Never await the application's branch.
                void reader.cancel().catch(() => {});
            };
            const timer = setTimeout(() => finish(true), 250);
            timer.unref?.();
            void (async () => {
                try {
                    while (!finished) {
                        const { value, done } = await reader.read();
                        if (finished) break;
                        if (done) { finish(false); break; }
                        const chunk = value.subarray(0, limit - bytes);
                        text += decoder.decode(chunk, { stream: true });
                        bytes += chunk.byteLength;
                        if (bytes >= limit) finish(true);
                    }
                } catch { finish(true); }
                finally { reader.releaseLock(); }
            })();
        });
    } catch { return Promise.resolve({ ...emptyPreview(), truncated: true }); }
}


const fetchKey = Symbol.for('svelte-devtools.fetch-tracing.v1');
interface FetchInstallation { original: typeof fetch; wrapper: typeof fetch; owners: Set<object> }
const fetchGlobals = globalThis as typeof globalThis & { [fetchKey]?: FetchInstallation };

function errorMessage(error: unknown, fallback: string): string {
    try {
        const descriptor = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'message') : undefined;
        return typeof descriptor?.value === 'string' ? descriptor.value.slice(0, 2000) : fallback;
    } catch { return fallback; }
}
function safeEmit(context: TraceContext, event: ServerTraceEvent): void {
    try { context.emit?.(event); } catch { /* Tracing never changes application results. */ }
}
function fallbackContext(): TraceContext {
    const emit = (globalThis as Record<string, unknown>).__svelte_devtools_addEvent__ as TraceContext['emit'];
    return { traceId: randomUUID(), spanId: randomUUID(), emit };
}

/** Preserve the native promise, response, thrown value, and upload body. */
function traceFetch(original: typeof fetch, receiver: unknown, input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
    const parent = getTraceContext() ?? fallbackContext();
    if (!parent.emit || parent.fetchInProgress) return original.call(receiver, input, init);
    const context = { ...parent, spanId: randomUUID(), fetchInProgress: true };
    const timestamp = Date.now();
    const start = performance.now();
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const requestPreview = init?.body != null
        ? Promise.resolve({ text: typeof init.body === 'string' ? init.body.slice(0, 2000) : '(stream or binary body)', truncated: typeof init.body !== 'string' || init.body.length > 2000 })
        : input instanceof Request ? capturePreview(input) : Promise.resolve(emptyPreview());
    const base = { url, method, traceId: context.traceId, spanId: context.spanId, parentSpanId: parent.spanId, routeId: parent.routeId, _handler: 'fetch-interceptor' };
    const failure = (error: unknown) => safeEmit(context, {
        id: context.spanId, type: 'server:error', timestamp, duration: performance.now() - start,
        data: { ...base, statusCode: 0, error: { message: errorMessage(error, 'Fetch failed') } },
    });
    let promise: Promise<Response>;
    try { promise = runWithTraceContext(context, () => original.call(receiver, input, init)); }
    catch (error) { failure(error); throw error; }
    void promise.then(response => {
        const duration = performance.now() - start;
        void Promise.all([requestPreview, capturePreview(response)]).then(([body, preview]) => safeEmit(context, {
            id: context.spanId, type: 'server:request', timestamp, duration,
            data: { ...base, statusCode: response.status,
                requestBody: body.text || undefined, requestBodyTruncated: body.truncated,
                responseSize: preview.truncated ? undefined : preview.bytes,
                responsePreview: preview.text, responseBodyTruncated: preview.truncated,
                contentType: response.headers.get('content-type') || '',
                reqHeaders: Object.fromEntries(new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))),
                resHeaders: Object.fromEntries(response.headers),
            },
        })).catch(() => {});
    }, failure).catch(() => {});
    return promise;
}

function installFetchInterceptor(): FetchInstallation {
    const installed = fetchGlobals[fetchKey];
    if (installed && globalThis.fetch === installed.wrapper) return installed;
    const original = globalThis.fetch;
    const wrapper: typeof fetch = function(input, init) { return traceFetch(original, globalThis, input, init); };
    const state = { original, wrapper, owners: installed?.owners ?? new Set<object>() };
    fetchGlobals[fetchKey] = state;
    globalThis.fetch = wrapper;
    return state;
}

/** Called by a dev server, not at module import. Last owner restores only its own wrapper. */
export function acquireFetchTracing(): () => void {
    const state = installFetchInterceptor();
    const owner = {};
    state.owners.add(owner);
    return () => {
        state.owners.delete(owner);
        if (!state.owners.size && fetchGlobals[fetchKey] === state) {
            if (globalThis.fetch === state.wrapper) globalThis.fetch = state.original;
            delete fetchGlobals[fetchKey];
        }
    };
}

export function svelteDevToolsHandle(): Handle {
    installFetchInterceptor();
    return async ({ event, resolve }) => {
        const inherited = getTraceContext();
        // The outer HTTP context is a request identity, not a method/path cache.
        if (inherited) inherited.handledByKit = true;
        const context: TraceContext = {
            ...(inherited ?? fallbackContext()),
            routeId: event.route.id,
            // Internal event.fetch can dispatch another Kit request in-process.
            spanId: inherited?.fetchInProgress ? randomUUID() : inherited?.spanId ?? randomUUID(),
            fetchInProgress: false,
        };
        return runWithTraceContext(context, async () => {
            const injectPath = context.injectPath ?? (globalThis as Record<string, unknown>).__SVELTE_DEVTOOLS_INJECT_PATH__ as string | undefined;
            const scripts = (injectPath ? `<script type="module" src="/@fs${injectPath}"></script>` : '') +
                '<script type="module" src="/@svelte-devtools-navigation-bridge"></script>' +
                '<script type="module" src="/__svelte-devtools/svelte-runtime.js"></script>';
            let injected = false;
            let tail = '';
            // Keep at most a closing-tag prefix across chunks; never buffer an HTML response.
            const transformPageChunk = ({ html, done }: { html: string; done: boolean }): string => {
                if (injected) return html;
                const chunk = tail + html;
                tail = '';
                const marker = chunk.indexOf('</head>');
                if (marker !== -1) { injected = true; return chunk.slice(0, marker) + scripts + chunk.slice(marker); }
                if (done) {
                    injected = true;
                    const end = chunk.indexOf('</body>') !== -1 ? chunk.indexOf('</body>') : chunk.lastIndexOf('</html>');
                    return end === -1 ? chunk + scripts : chunk.slice(0, end) + scripts + chunk.slice(end);
                }
                // A closing head tag can straddle chunk boundaries.
                for (let n = Math.min(6, chunk.length); n > 0; n--) {
                    if ('</head>'.startsWith(chunk.slice(-n))) { tail = chunk.slice(-n); return chunk.slice(0, -n); }
                }
                return chunk;
            };
            const originalFetch = event.fetch;
            if (originalFetch) event.fetch = ((input, init) => traceFetch(originalFetch, event, input, init)) as typeof event.fetch;
            const shouldTrace = !!context.emit && !/^\/(?:__svelte-devtools|\.devtools)(?:\/|$)/.test(event.url.pathname) &&
                !/\.(svelte|js|ts|css|ico|svg|png|woff2?)$/.test(event.url.pathname);
            const requestPreview = shouldTrace ? capturePreview(event.request) : Promise.resolve(emptyPreview());
            const timestamp = Date.now();
            const start = performance.now();
            let response: Response | undefined;
            let failure: unknown;
            try { response = await resolve(event, { transformPageChunk }); return response; }
            catch (error) { failure = error; throw error; }
            finally {
                if (shouldTrace) {
                    const duration = performance.now() - start;
                    const contentType = response?.headers.get('content-type') || '';
                    const preview = response ? capturePreview(response, contentType.includes('json') ? 2000 : 500) : Promise.resolve(emptyPreview());
                    void Promise.all([requestPreview, preview]).then(([body, result]) => safeEmit(context, {
                        id: context.spanId, type: failure || (response?.status ?? 0) >= 400 ? 'server:error' : 'server:ssr', timestamp, duration,
                        data: {
                            traceId: context.traceId, spanId: context.spanId,
                            parentSpanId: inherited?.fetchInProgress ? inherited.spanId : undefined,
                            routeId: event.route.id, url: event.url.pathname + event.url.search, method: event.request.method,
                            _handler: 'sveltekit', statusCode: response?.status, contentType, duration,
                            requestBody: body.text || undefined, requestBodyTruncated: body.truncated,
                            responseSize: result.truncated ? undefined : result.bytes,
                            responsePreview: result.text, responseBodyTruncated: result.truncated,
                            reqHeaders: Object.fromEntries(event.request.headers), resHeaders: Object.fromEntries(response?.headers ?? []),
                            error: failure === undefined ? undefined : { message: errorMessage(failure, 'Request failed') },
                        },
                    })).catch(() => {});
                }
            }
        });
    };
}

export function noopHandle(): Handle { return async ({ event, resolve }) => resolve(event); }
