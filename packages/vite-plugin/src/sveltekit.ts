import type { Handle } from '@sveltejs/kit';

export type { Handle };

const GLOBAL_KEY = '__svelte_devtools_addEvent__';
const SEEN_KEY = '__svelte_devtools_markSeen__';

interface ServerEvent {
    id: string;
    type: string;
    timestamp: number;
    duration?: number;
    data: unknown;
}

/** Install the fetch interceptor at module load time so it wraps
 *  globalThis.fetch before SvelteKit caches it for load functions. */
const _origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : input instanceof Request ? input.url
        : String(input);
    const startTime = Date.now();
    const perfStart = performance.now();
    const method = init?.method || 'GET';
    const promise = _origFetch(input, init);
    promise.then(async (res) => {
        const addEvent = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
            | ((e: ServerEvent) => void)
            | undefined;
        if (!addEvent) return;
        const duration = performance.now() - perfStart;
        let responseBody = '';
        try { responseBody = await res.clone().text(); } catch { /* ignore */ }
        addEvent({
            id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            type: 'server:request',
            timestamp: startTime,
            duration,
            data: {
                url: urlStr,
                method,
                statusCode: res.status,
                _handler: 'fetch-interceptor',
                requestBody: init?.body instanceof ReadableStream
                    ? '(stream)'
                    : (init?.body as string | undefined)?.slice(0, 2000) || undefined,
                responseSize: responseBody.length,
                responsePreview: responseBody.slice(0, 2000),
                reqHeaders: init?.headers,
            }
        });
    }).catch(() => {});
    return promise;
}) as typeof globalThis.fetch;

export function svelteDevToolsHandle(): Handle {
    return async ({ event, resolve }) => {
        const svelteRuntime =
            `<script type="module" src="/__svelte-devtools/svelte-runtime.js"></script>`;

        // Inject @vitejs/devtools client for SvelteKit SSR (Vite's transformIndexHtml is bypassed by SSR)
        const devtoolsInjectPath = (globalThis as Record<string, unknown>).__SVELTE_DEVTOOLS_INJECT_PATH__ as string | undefined;
        const devtoolsInject = devtoolsInjectPath
            ? `<script type="module" src="/@fs${devtoolsInjectPath}"></script>`
            : '';

        const reqKey = `${event.request.method}:${event.url.pathname}`;
        const markSeen = (globalThis as Record<string, unknown>)[SEEN_KEY] as
            | ((key: string) => void)
            | undefined;
        if (markSeen) markSeen(reqKey);

        let requestBody = '';
        if (event.request.method === 'POST') {
            try {
                const reqClone = event.request.clone();
                requestBody = await reqClone.text();
            } catch (e) {
                console.warn('[Svelte DevTools] Could not read request body:', e instanceof Error ? e.message : e);
            }
        }

        const startTime = Date.now();
        const perfStart = performance.now();
        let response: Response | undefined;
        let error: Error | undefined;
        let responseBody = '';

        try {
            response = await resolve(event, {
            transformPageChunk: ({ html }) => {
                try {
                    const marker = `</head>`;
                    let idx = html.indexOf(marker);
                    if (idx === -1) {
                        const bodyIdx = html.indexOf('</body>');
                        if (bodyIdx === -1) {
                            const htmlIdx = html.lastIndexOf('</html>');
                            if (htmlIdx !== -1) {
                                return html.slice(0, htmlIdx) + devtoolsInject + svelteRuntime + html.slice(htmlIdx);
                            }
                            return html + devtoolsInject + svelteRuntime;
                        }
                        return html.slice(0, bodyIdx) + devtoolsInject + svelteRuntime + html.slice(bodyIdx);
                    }
                    return html.slice(0, idx) + devtoolsInject + svelteRuntime + html.slice(idx);
                } catch (err) {
                    console.warn('[Svelte DevTools] transformPageChunk failed:', err);
                    return html;
                }
            }
            });
            const clone = response.clone();
            responseBody = await clone.text();
        } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));
            throw error;
        } finally {
            const duration = performance.now() - perfStart;
            const addEvent = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
                | ((e: ServerEvent) => void)
                | undefined;

            if (addEvent) {
                // Skip Vite dev module requests (individual .svelte/.js/.ts/.css files)
                const path = event.url.pathname;
                if (/\.(svelte|js|ts|css|json|ico|svg|png|woff2?)$/.test(path)) { return response!; }
                const resHeadersRaw = response?.headers;
                const headersEntries: [string, string][] = typeof resHeadersRaw?.entries === 'function'
                    ? [...resHeadersRaw.entries()] as [string, string][]
                    : typeof resHeadersRaw?.forEach === 'function'
                        ? [] as [string, string][]
                        : Object.entries(resHeadersRaw || {}) as unknown as [string, string][];
                const contentType = typeof resHeadersRaw?.get === 'function'
                    ? resHeadersRaw.get('content-type') || ''
                    : (resHeadersRaw as unknown as Record<string, string>)?.['content-type'] || '';
                const isJson = contentType.includes('json');
                addEvent({
                    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                    type: error ? 'server:error' : 'server:ssr',
                    timestamp: startTime,
                    duration,
                    data: {
                        url: event.url.pathname + event.url.search,
                        method: event.request.method,
                        requestBody: requestBody.slice(0, 2000) || undefined,
                        _handler: 'sveltekit',
                        statusCode: response?.status,
                        routeId: event.route.id,
                        contentType,
                        responseSize: responseBody.length,
                        responsePreview: isJson ? responseBody.slice(0, 2000) : responseBody.slice(0, 500),
                        reqHeaders: {
                            'content-type': typeof event.request.headers?.get === 'function'
                                ? event.request.headers.get('content-type') : undefined,
                            'user-agent': typeof event.request.headers?.get === 'function'
                                ? event.request.headers.get('user-agent') : undefined,
                            'accept': typeof event.request.headers?.get === 'function'
                                ? event.request.headers.get('accept') : undefined,
                            'referer': typeof event.request.headers?.get === 'function'
                                ? event.request.headers.get('referer') : undefined,
                        },
                        resHeaders: Object.fromEntries(headersEntries),
                        duration,
                        error: error
                            ? { message: error.message, stack: error.stack }
                            : undefined
                    }
                });
            }
        }

        return response!;
    };
}

export function noopHandle(): Handle {
    return async ({ event, resolve }) => resolve(event);
}