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

/** Importing the production no-op must not change global fetch. */
let fetchInterceptorInstalled = false;
function installFetchInterceptor(): void {
    if (fetchInterceptorInstalled) return;
    fetchInterceptorInstalled = true;
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const addEvent = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ((e: ServerEvent) => void) | undefined;
        if (!addEvent) return originalFetch(input, init);
        const url = input instanceof Request ? input.url : String(input);
        const startTime = Date.now();
        const perfStart = performance.now();
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        // Do not construct a Request from an existing body: that can disturb the upload.
        // Request objects can be cloned; init bodies are inspected only when already strings.
        const requestPreview = init?.body != null
            ? Promise.resolve({ text: typeof init.body === 'string' ? init.body.slice(0, 2000) : '(stream or binary body)', truncated: typeof init.body !== 'string' || init.body.length > 2000 })
            : input instanceof Request ? capturePreview(input) : Promise.resolve(emptyPreview());
        const promise = originalFetch(input, init);
        void promise.then(async response => {
            const duration = performance.now() - perfStart;
            const [body, preview] = await Promise.all([requestPreview, capturePreview(response)]);
            addEvent({
                id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                type: 'server:request', timestamp: startTime, duration,
                data: {
                    url, method, statusCode: response.status, _handler: 'fetch-interceptor',
                    requestBody: body.text || undefined, requestBodyTruncated: body.truncated,
                    responseSize: preview.truncated ? undefined : preview.bytes,
                    responsePreview: preview.text, responseBodyTruncated: preview.truncated,
                    contentType: response.headers.get('content-type') || '',
                    reqHeaders: Object.fromEntries(new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))),
                    resHeaders: Object.fromEntries(response.headers),
                },
            });
        }).catch(() => { /* A trace must never alter the original fetch promise. */ });
        return promise;
    }) as typeof globalThis.fetch;
}

export function svelteDevToolsHandle(): Handle {
    installFetchInterceptor();
    return async ({ event, resolve }) => {
        const svelteRuntime =
            `<script type="module" src="/__svelte-devtools/svelte-runtime.js"></script>`;

        // ADR-0012 Phase 2: the navigation bridge is a Vite-transformed virtual
        // module (packages/vite-plugin/src/index.ts) that assigns the real
        // SvelteKit goto to window.__SVELTE_DEVTOOLS_REAL_GOTO__. Injected here
        // because SvelteKit SSR bypasses Vite's transformIndexHtml.
        const navigationBridge =
            `<script type="module" src="/@svelte-devtools-navigation-bridge"></script>`;

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

        const addEvent = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ((e: ServerEvent) => void) | undefined;
        const shouldTrace = !!addEvent && !/\.(svelte|js|ts|css|json|ico|svg|png|woff2?)$/.test(event.url.pathname);
        const requestPreview = shouldTrace ? capturePreview(event.request) : Promise.resolve(emptyPreview());

        const startTime = Date.now();
        const perfStart = performance.now();
        let response: Response | undefined;
        let error: Error | undefined;

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
                                return html.slice(0, htmlIdx) + devtoolsInject + navigationBridge + svelteRuntime + html.slice(htmlIdx);
                            }
                            return html + devtoolsInject + navigationBridge + svelteRuntime;
                        }
                        return html.slice(0, bodyIdx) + devtoolsInject + navigationBridge + svelteRuntime + html.slice(bodyIdx);
                    }
                    return html.slice(0, idx) + devtoolsInject + navigationBridge + svelteRuntime + html.slice(idx);
                } catch (err) {
                    console.warn('[Svelte DevTools] transformPageChunk failed:', err);
                    return html;
                }
            }
            });
        } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));
            throw e;
        } finally {
            if (shouldTrace && addEvent) {
                const duration = performance.now() - perfStart;
                const contentType = response?.headers.get('content-type') || '';
                const responsePreview = response ? capturePreview(response, contentType.includes('json') ? 2000 : 500) : Promise.resolve(emptyPreview());
                void Promise.all([requestPreview, responsePreview]).then(([body, preview]) => {
                    addEvent({
                        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                        type: error ? 'server:error' : 'server:ssr', timestamp: startTime, duration,
                        data: {
                            url: event.url.pathname + event.url.search,
                            method: event.request.method,
                            requestBody: body.text || undefined,
                            requestBodyTruncated: body.truncated,
                            _handler: 'sveltekit', statusCode: response?.status,
                            routeId: event.route.id, contentType,
                            responseSize: preview.truncated ? undefined : preview.bytes,
                            responsePreview: preview.text,
                            responseBodyTruncated: preview.truncated,
                            reqHeaders: Object.fromEntries(event.request.headers || []),
                            resHeaders: Object.fromEntries(response?.headers || []),
                            duration,
                            error: error ? { message: error.message, stack: error.stack } : undefined,
                        },
                    });
                }).catch(() => { /* Tracing errors must not change resolve's result. */ });
            }
        }

        return response!;
    };
}

export function noopHandle(): Handle {
    return async ({ event, resolve }) => resolve(event);
}