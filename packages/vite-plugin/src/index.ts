import type {Plugin, ResolvedConfig, ViteDevServer} from 'vite';
import {createFilter} from 'vite';
import MagicString from 'magic-string';
import {parse as parseJS} from '@babel/parser';
import * as t from '@babel/types';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {createRequire} from 'module';
import sirv from 'sirv';
import launchEditor from 'launch-editor';
import { randomUUID } from 'node:crypto';
import { runWithTraceContext, type TraceContext } from './trace-context.js';
import { acquireFetchTracing } from './sveltekit.js';
import { addServerEvent, clearServerEvents } from './server-events.js';
import { resolveEditorLocation } from './editor.js';
import {parse} from 'svelte/compiler';
import type {StateDeclaration, SvelteDevToolsPluginOptions} from '@fsodano/svelte-devtools-types';
import {DOCK_CONFIG, RPC_METHODS, RPC_TYPES} from '@fsodano/svelte-devtools-types';
import type {ViteDevToolsNodeContext} from '@vitejs/devtools-kit';
import {analyzeMigration} from './migration-analyzer.js';
import {COMPONENT_REGISTRY, computeMigrationScores} from './registry.js';
import {getDevtoolsToken, isAuthorized} from './token.js';
import {configureHttpGuards, isAllowedHost, sendForbiddenHost, sendUnauthorized} from './http-guard.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEVTOOLS_PREFIX = '/__svelte-devtools';
// ADR-0012 Phase 2: the navigation bridge is a Vite-transformed virtual module.
// The injected page script loads it by URL; Vite's transform middleware maps
// that URL to the `\0`-prefixed id and runs the module through the normal
// plugin pipeline (resolveId -> load -> import analysis), so the real
// `$app/navigation` import is rewritten to SvelteKit's module URL.
const NAVIGATION_BRIDGE_URL = '/@svelte-devtools-navigation-bridge';
const NAVIGATION_BRIDGE_ID = '\0virtual:svelte-devtools-navigation-bridge';
let logsApi: Record<string, (arg: unknown) => unknown> | null = null;
let viteServer: ViteDevServer | null = null;
let batchTimer: ReturnType<typeof setTimeout> | null = null;

const isDebug = process.env.SVELTE_DEVTOOLS_DEBUG === 'true';

function getStableId(id: string, root: string): string {
    const relPath = path.relative(root, id);
    let hash = 0;
    for (let i = 0; i < relPath.length; i++) {
        hash = ((hash << 5) - hash) + relPath.charCodeAt(i);
        hash |= 0;
    }
    return `svt-${Math.abs(hash).toString(36)}`;
}

export function svelteDevTools(options: SvelteDevToolsPluginOptions = {}): Plugin {
    const {exclude = [/node_modules/], include = [/\.svelte$/], enableStateInspection = true, allowedOrigins, allowedHosts} = options;
    let root = process.cwd();
    let config: ResolvedConfig;
    let hasSvelteKit = false;

    // Vite 8: use createFilter for include/exclude matching
    const filter = createFilter(include, exclude);

    const tracingDisposers = new Set<() => void>();
    const plugin: Plugin & { devtools: { setup: (ctx: ViteDevToolsNodeContext) => void } } = {
        name: 'svelte-devtools',
        // apply: 'serve' is the default for devtools plugins — no need to set explicitly
        apply: 'serve',
        enforce: 'pre',
        closeBundle() { for (const dispose of tracingDisposers) dispose(); tracingDisposers.clear(); },

        resolveId(id: string) {
            // ADR-0012 Phase 2: $app/navigation is no longer intercepted. App
            // code resolves SvelteKit's real module, so navigation stays native.
            // Only the devtools-only bridge URL maps to the virtual module.
            if (id === NAVIGATION_BRIDGE_URL) {
                return NAVIGATION_BRIDGE_ID;
            }
            return null;
        },

        load(id: string) {
            if (id === NAVIGATION_BRIDGE_ID) {
                return `
import { goto } from '$app/navigation';

// ADR-0012 Phase 2: expose the real SvelteKit goto to the DevTools iframe for
// cross-route time travel. This module is injected into the page (SvelteKit
// only) and never imported by app code, so app navigation keeps SvelteKit's
// real implementation.
if (typeof window !== 'undefined') {
    window.__SVELTE_DEVTOOLS_REAL_GOTO__ = goto;
}
`;
            }
            return null;
        },

        configResolved(resolvedConfig: ResolvedConfig) {
            config = resolvedConfig;
            root = config.root;

            // Detect rolldown (Vite 8)
            const isRolldown = resolvedConfig.plugins.some(
                (p: { name?: string }) => p?.name?.includes('rolldown') || p?.name?.includes('vite:rolldown')
            );
            if (isRolldown) {
                console.log('\x1b[33m[Svelte DevTools] Detected rolldown (Vite 8). Using rolldown-compatible transform.\x1b[0m');
            }

            // Resolve tsconfig paths for SvelteKit alias support
            const tsconfigPath = path.resolve(root, 'tsconfig.json');
            if (fs.existsSync(tsconfigPath)) {
                try {
                    const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
                    const parsed = JSON.parse(tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''));
                    if (parsed?.compilerOptions?.paths) {
                        const aliases = parsed.compilerOptions.paths;
                        for (const [alias, paths] of Object.entries(aliases)) {
                            if (Array.isArray(paths) && paths.length > 0) {
                                const aliasPath = path.resolve(root, paths[0].replace(/\/\*$/, ''));
                                if (!config.resolve.alias) {
                                    config.resolve.alias = [];
                                }
                                (config.resolve.alias as Array<{ find: string | RegExp; replacement: string }>).push({
                                    find: alias,
                                    replacement: aliasPath
                                });
                            }
                        }
                    }
                } catch {
                    // Ignore tsconfig parse errors
                }
            }

                hasSvelteKit = resolvedConfig.plugins.some(
                    (p: { name?: string }) => p?.name === 'vite-plugin-sveltekit'
                );
                if (hasSvelteKit && isDebug) {
                    console.info(
                        '[Svelte DevTools] SvelteKit detected — add to src/hooks.server.ts:\n' +
                        '  import { dev } from \'$app/environment\';\n' +
                        '  import { svelteDevToolsHandle, noopHandle } from \'@fsodano/vite-plugin-svelte-devtools/sveltekit\';\n' +
                        '  export const handle = dev ? svelteDevToolsHandle() : noopHandle();'
                    );
                }
        },

        configureServer(server: ViteDevServer) {
            viteServer = server;

            // ADR-0009: per-run API token printed next to the Manual Auth Token.
            const token = getDevtoolsToken();
            configureHttpGuards({allowedOrigins, allowedHosts});
            console.log('\x1b[32m[Svelte DevTools] Agent API token (SVELTE_DEVTOOLS_TOKEN):\x1b[0m');
            console.log(`\x1b[32m  ${token}\x1b[0m`);
            console.log('  Use it for /__svelte-devtools/api/* and legacy endpoints:');
            console.log('  curl -H "Authorization: Bearer <token>" http://localhost:<port>/__svelte-devtools/api/');

            let clientPath: string;
            try {
                clientPath = path.resolve(path.dirname(require.resolve('@fsodano/svelte-devtools-client/package.json')), 'dist');
            } catch {
                clientPath = path.resolve(__dirname, '../../client/dist');
            }

            const distPath = path.resolve(__dirname, '../../../dist');
            let runtimePath: string;
            try {
                runtimePath = path.resolve(path.dirname(require.resolve('@fsodano/svelte-devtools-runtime/package.json')), '../runtime/dist');
            } catch {
                runtimePath = path.resolve(__dirname, '../../runtime/dist');
            }

            // Resolve @vitejs/devtools inject.js from project root (Vite allow-list scope)
            let viteDevtoolsInjectPath: string;
            try {
                const devtoolsPkgJson = require.resolve('@vitejs/devtools/package.json', { paths: [root] });
                const devtoolsPkgDir = path.dirname(devtoolsPkgJson);
                viteDevtoolsInjectPath = path.resolve(devtoolsPkgDir, 'dist/client/inject.js').replace(/\\/g, '/');
                if (isDebug) console.log('[Svelte DevTools] Found @vitejs/devtools inject at:', viteDevtoolsInjectPath);
            } catch (e) {
                viteDevtoolsInjectPath = '';
                if (isDebug) console.log('[Svelte DevTools] @vitejs/devtools not found, skipping inject');
            }

            const releaseFetch = acquireFetchTracing();
            let tracingActive = true;
            const emit = (event: Parameters<typeof addServerEvent>[0]) => { if (tracingActive) addServerEvent(event, server); };
            const disposeTracing = () => {
                if (!tracingActive) return;
                tracingActive = false;
                releaseFetch();
                clearServerEvents(server);
                tracingDisposers.delete(disposeTracing);
            };
            tracingDisposers.add(disposeTracing);
            server.httpServer?.once('close', disposeTracing);

            server.middlewares.use((req, res, next) => {
                const url = req.url?.split('?')[0] || '';
                if (/^\/(?:__svelte-devtools|\.devtools|@|node_modules)/.test(url) ||
                    /\.(svelte|js|ts|css|woff2?|map|ico|svg|png|jpg|webp|avif|ttf|eot)$/.test(url)) { next(); return; }
                const context: TraceContext = { traceId: randomUUID(), spanId: randomUUID(), emit, injectPath: viteDevtoolsInjectPath };
                const timestamp = Date.now();
                const start = performance.now();
                const originalWrite = res.write;
                const originalEnd = res.end;
                // Retain only the preview prefix; count every byte actually passed to write/end.
                const chunks: Buffer[] = [];
                let previewBytes = 0;
                let responseBytes = 0;
                const capture = (chunk: unknown, encoding: unknown) => {
                    if (typeof chunk !== 'string' && !ArrayBuffer.isView(chunk)) return;
                    const encodingName = typeof encoding === 'string' ? encoding as BufferEncoding : undefined;
                    responseBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk, encodingName) : chunk.byteLength;
                    if (previewBytes < 2000) {
                        const buffer = typeof chunk === 'string' ? Buffer.from(chunk.slice(0, 2000), encodingName)
                            : Buffer.from(chunk.buffer, chunk.byteOffset, Math.min(chunk.byteLength, 2000));
                        const prefix = buffer.subarray(0, 2000 - previewBytes);
                        chunks.push(Buffer.from(prefix));
                        previewBytes += prefix.length;
                    }
                };
                const wrappedWrite = function(this: typeof res, ...args: unknown[]) {
                    capture(args[0], args[1]);
                    return Reflect.apply(originalWrite, this, args);
                } as typeof res.write;
                const wrappedEnd = function(this: typeof res, ...args: unknown[]) {
                    capture(args[0], args[1]);
                    return Reflect.apply(originalEnd, this, args);
                } as typeof res.end;
                res.write = wrappedWrite;
                res.end = wrappedEnd;
                let finished = false;
                const complete = () => {
                    if (finished) return;
                    finished = true;
                    if (res.write === wrappedWrite) res.write = originalWrite;
                    if (res.end === wrappedEnd) res.end = originalEnd;
                    if (context.handledByKit || !tracingActive) return;
                    const contentType = String(res.getHeader('content-type') ?? '');
                    const limit = contentType.includes('json') ? 2000 : 500;
                    const preview = Buffer.concat(chunks).subarray(0, limit);
                    emit({ id: context.spanId, type: res.statusCode >= 400 || !res.writableFinished ? 'server:error' : 'server:ssr', timestamp,
                        duration: performance.now() - start,
                        data: { traceId: context.traceId, spanId: context.spanId, url: req.url || '/', method: req.method || 'GET',
                            statusCode: res.statusCode, _handler: 'generic', contentType,
                            responseSize: responseBytes, responsePreview: preview.toString('utf8'), responseBodyTruncated: responseBytes > limit,
                            reqHeaders: { 'content-type': req.headers['content-type'], 'accept': req.headers.accept,
                                cookie: req.headers.cookie ? '[present]' : undefined },
                            resHeaders: Object.fromEntries(Object.entries(res.getHeaders()).map(([key, value]) => [key, String(value)])),
                        },
                    });
                };
                res.once('finish', complete);
                res.once('close', complete);
                runWithTraceContext(context, next);
            });

            // ADR-0009: reject disallowed Host values on every protected route
            // before the request reaches any handler. Static panel/runtime
            // assets are unaffected.
            server.middlewares.use(DEVTOOLS_PREFIX, (req, res, next) => {
                const url = req.url?.split('?')[0] || '';
                const protectedPath = url === '/api' || url.startsWith('/api/') ||
                    url.startsWith('/server-events') || url.startsWith('/migration-score') ||
                    url.startsWith('/open-in-editor');
                if (protectedPath && !isAllowedHost(req.headers.host)) {
                    sendForbiddenHost(res);
                    return;
                }
                next();
            });

            server.middlewares.use('/__svelte-devtools/server-events', async (req, res, _next) => {
                if (!isAuthorized(req)) {
                    sendUnauthorized(res);
                    return;
                }
                try {
                    const {method} = req;
                    if (method === 'GET') {
                        res.setHeader('Content-Type', 'application/json');
                        res.setHeader('Cache-Control', 'no-store');
                        const {getServerEvents} = await import('./server-events.js');
                        const rawUrl = req.url || '';
                        const qsIdx = rawUrl.indexOf('?');
                        const params = new URLSearchParams(qsIdx >= 0 ? rawUrl.slice(qsIdx) : '');
                        const last = parseInt(params.get('last') || '', 10) || undefined;
                        const sinceId = params.get('sinceId') || undefined;
                        res.end(JSON.stringify(getServerEvents({last, sinceId}, server)));
                    } else if (method === 'DELETE') {
                        const {clearServerEvents} = await import('./server-events.js');
                        clearServerEvents(server);
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ok: true}));
                    } else {
                        res.statusCode = 405;
                        res.end(JSON.stringify({error: 'Method not allowed'}));
                    }
                } catch (e) {
                    const err = e instanceof Error ? e.message : String(e);
                    console.error('[Svelte DevTools] server-events error:', err);
                    res.statusCode = 500;
                    res.end(JSON.stringify({error: err}));
                }
            });

            server.middlewares.use('/__svelte-devtools/open-in-editor', (req, res, _next) => {
                if (!isAuthorized(req)) {
                    sendUnauthorized(res);
                    return;
                }
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end(JSON.stringify({error: 'Method not allowed'}));
                    return;
                }
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const {file, line, column} = JSON.parse(body || '{}');
                        if (!file) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({error: 'Missing file parameter'}));
                            return;
                        }
                        const location = resolveEditorLocation(root, file, line ?? 1, column ?? 1);
                        res.setHeader('Content-Type', 'application/json');
                        launchEditor(location, (_file, message) => {
                            if (!res.writableEnded) {
                                res.statusCode = 500;
                                res.end(JSON.stringify({error: message || 'The editor could not be launched.'}));
                            } else server.config.logger.error(`[Svelte DevTools] Editor launch failed: ${message}`);
                        });
                        // launch-editor reports failures, but has no success callback.
                        // Acknowledge the request, not proof that an editor window opened.
                        setImmediate(() => {
                            if (!res.writableEnded) {
                                res.statusCode = 200;
                                res.end(JSON.stringify({ok: true, status: 'requested'}));
                            }
                        });
                    } catch (e) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({error: e instanceof Error ? e.message : 'Invalid editor request'}));
                    }
                });
            });

            server.middlewares.use('/__svelte-devtools/migration-score', async (req, res, _next) => {
                if (!isAuthorized(req)) {
                    sendUnauthorized(res);
                    return;
                }
                if (req.method !== 'GET') {
                    res.statusCode = 405;
                    res.end(JSON.stringify({error: 'Method not allowed'}));
                    return;
                }
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(JSON.stringify({ok: true, ...computeMigrationScores()}));
            });

            // ── API endpoints (Connect strips /__svelte-devtools/api prefix) ──
            server.middlewares.use('/__svelte-devtools/api', async (req, res, _next) => {
                const pathname = req.url?.split('?')[0] || '/';
                const { handleApiRequest } = await import('./server-api.js');
                await handleApiRequest(req, res, server, pathname);
            });

            server.middlewares.use(DEVTOOLS_PREFIX, (req, res, next) => {
                const url = req.url?.split('?')[0] || '';

                // ADR-0009: inject the per-run token into the prebuilt panel
                // HTML so the client can authenticate its own API requests.
                if (url === '' || url === '/' || url === '/index.html') {
                    const indexHtmlPath = path.join(clientPath, 'index.html');
                    if (fs.existsSync(indexHtmlPath)) {
                        const html = fs.readFileSync(indexHtmlPath, 'utf-8');
                        const tokenScript = `<script>window.__SVELTE_DEVTOOLS_TOKEN__=${JSON.stringify(token)};</script>`;
                        const injected = html.includes('</head>')
                            ? html.replace('</head>', `${tokenScript}</head>`)
                            : html + tokenScript;
                        res.setHeader('Content-Type', 'text/html');
                        res.setHeader('Cache-Control', 'no-store');
                        // The panel carries the per-run API token in its HTML.
                        // Prevent hostile sites from framing it (clickjacking)
                        // while keeping the same-origin dev app iframe allowed.
                        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
                        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
                        res.end(injected);
                        return;
                    }
                }

                if (url.startsWith('/') && !url.startsWith('//')) {
                    const filePath = url.slice(1);

                    // Serve runtime script
                    if (filePath === 'svelte-runtime.js') {
                        const runtimeFile = path.join(runtimePath, 'index.js');
                        if (fs.existsSync(runtimeFile)) {
                            res.setHeader('Content-Type', 'application/javascript');
                            fs.createReadStream(runtimeFile).pipe(res);
                            return;
                        }
                    }

                    const fullPath = path.join(distPath, filePath);
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                        sirv(distPath, {dev: true})(req, res, next);
                        return;
                    }
                }
                sirv(clientPath, {dev: true, single: true})(req, res, next);
            });

            server.ws.on('svelte-devtools:open-in-editor', (data: { file: string; line?: number }) => {
                try { launchEditor(resolveEditorLocation(root, data.file, data.line ?? 1, 1)); }
                catch (error) { server.config.logger.error(`[Svelte DevTools] ${error instanceof Error ? error.message : 'Invalid editor location'}`); }
            });
        },

        transformIndexHtml(html: string) {
            const runtimeScript = `<script type="module" src="${DEVTOOLS_PREFIX}/svelte-runtime.js"></script>`;
            // ADR-0012 Phase 2: inject the navigation bridge only in SvelteKit
            // apps. Plain Vite apps never import $app/navigation, so the bridge
            // would have nothing to bind and stays out of their HTML.
            const navigationBridge = hasSvelteKit
                ? `<script type="module" src="${NAVIGATION_BRIDGE_URL}"></script>`
                : '';
            return html.replace('</head>', `${navigationBridge}${runtimeScript}</head>`);
        },


        devtools: {
            setup(ctx: ViteDevToolsNodeContext) {
                // Register the dock entry
                ctx.docks.register({
                    id: DOCK_CONFIG.ID,
                    title: DOCK_CONFIG.TITLE,
                    icon: DOCK_CONFIG.ICON,
                    type: DOCK_CONFIG.TYPE,
                    url: DOCK_CONFIG.URL
                });

                // Register RPC methods for event-based communication
                ctx.rpc.register({
                    name: RPC_METHODS.GET_COMPONENTS,
                    type: RPC_TYPES.QUERY,
                    handler: async () => {
                        return Array.from(COMPONENT_REGISTRY.values());
                    }
                });

                ctx.rpc.register({
                    name: RPC_METHODS.OPEN_IN_EDITOR,
                    type: RPC_TYPES.MUTATION,
                    handler: async (data: unknown) => {
                        const typedData = data as { file: string; line?: number };
                        const file = path.resolve(root, typedData.file);
                        if (fs.existsSync(file)) {
                            launchEditor(`${file}:${typedData.line || 1}`);
                            return true;
                        }
                        return false;
                    }
                });

                // Migration score RPC
                ctx.rpc.register({
                    name: RPC_METHODS.MIGRATION_SCORE,
                    type: RPC_TYPES.QUERY,
                    handler: async () => {
                        return computeMigrationScores();
                    }
                });

                // Agent: build status RPC
                ctx.rpc.register({
                    name: RPC_METHODS.BUILD_STATUS,
                    type: RPC_TYPES.QUERY,
                    handler: async () => ({
                        ok: true,
                        data: {
                            connected: true,
                            totalComponents: COMPONENT_REGISTRY.size,
                            activeComponents: COMPONENT_REGISTRY.size,
                            trackedRunes: ['$state', '$derived', '$props', '$effect', '$effect.pre', '$bindable', 'untrack', '$host'],
                            errors: [],
                            warnings: [],
                        },
                        timestamp: Date.now(),
                    })
                });

                // Agent: component state RPC
                ctx.rpc.register({
                    name: RPC_METHODS.COMPONENT_STATE,
                    type: RPC_TYPES.QUERY,
                    handler: async (componentId: unknown) => {
                        const id = componentId as string;
                        const meta = COMPONENT_REGISTRY.get(id);
                        if (!meta) return { ok: false, error: { code: 'NOT_FOUND', message: `Component ${id} not found` }, timestamp: Date.now() };
                        return { ok: true, data: meta, timestamp: Date.now() };
                    }
                });

                // Agent: rescan RPC
                ctx.rpc.register({
                    name: RPC_METHODS.RESCAN,
                    type: RPC_TYPES.MUTATION,
                    handler: async () => {
                        if (viteServer) {
                            viteServer.ws.send({ type: 'full-reload' });
                        }
                        const count = COMPONENT_REGISTRY.size;
                        return { ok: true, data: { rescanned: count }, timestamp: Date.now() };
                    }
                });

                // Store messages API and send init notification
                const ctxAny = ctx as unknown as Record<string, unknown>;
                if (ctxAny.logs) {
                    logsApi = ctxAny.logs as Record<string, (arg: unknown) => unknown>;
                    if (typeof logsApi.add === 'function') {
                        logsApi.add({
                            message: 'Svelte DevTools initialized',
                            description: 'Component tree, state inspection, and migration scoring active',
                            level: 'info',
                            category: 'svelte-devtools',
                        } as unknown);
                    }
                }

                // Set up agent shared state for build status tracking
                const rpcAny = ctx.rpc as unknown as Record<string, unknown>;
                if (rpcAny.sharedState) {
                    (rpcAny.sharedState as Record<string, (arg: string, opts: Record<string, unknown>) => Promise<unknown>>).get?.('svelte-devtools:agent-state', {
                        initialValue: { lastBuildStatus: null, recentErrors: [], componentCount: 0 },
                    }).catch(() => {});
                }
            }
        },

        transform(code: string, id: string) {
            if (/\.svelte-kit\/generated/.test(id)) return null;
            if (!filter(id)) return null;

            if (isDebug) console.log('[Svelte DevTools] Transforming:', id);
            const s = new MagicString(code);
            const componentName = path.basename(id, '.svelte');
            const componentId = getStableId(id, root);
            const runeCounts: Record<string, number> = {};
            const propKeys: string[] = [];

            try {
                if (enableStateInspection) injectStateInspection(s, code, id, componentId, runeCounts, propKeys);
                injectComponentMetadata(s, code, componentId, componentName, id, propKeys);
                injectEffectTracking(s, code, id, componentId, runeCounts);
            } catch (e) {
                if (logsApi && typeof logsApi.add === 'function') {
                    logsApi.add({
                        message: `Transform error in ${componentName}`,
                        description: e instanceof Error ? e.message : String(e),
                        level: 'error',
                        category: 'svelte-devtools',
                    } as unknown);
                }
                return null;
            }

            const migrationResult = analyzeMigration(code, id, runeCounts);
            COMPONENT_REGISTRY.set(componentId, {id: componentId, name: componentName, filename: id, runeCounts, propKeys, migrationResult});

            if (migrationResult && migrationResult.percentage < 50 && logsApi && typeof logsApi.add === 'function') {
                logsApi.add({
                    message: `${componentName} is ${migrationResult.percentage}% migrated`,
                    description: `${migrationResult.patterns.length} Svelte 4 pattern(s) found: ${migrationResult.patterns.map(p => p.svelte4).join(', ')}`,
                    level: 'warn',
                    category: 'svelte-migration',
                } as unknown);
            }

            if (batchTimer) clearTimeout(batchTimer);
            batchTimer = setTimeout(() => {
                if (!logsApi || typeof logsApi.add !== 'function') return;
                const total = COMPONENT_REGISTRY.size;
                const totalRunes = Array.from(COMPONENT_REGISTRY.values())
                    .reduce((sum, m) => sum + Object.values(m.runeCounts ?? {}).reduce((a, b) => a + b, 0), 0);
                logsApi.add({
                    message: `Registered ${total} component${total === 1 ? '' : 's'} (${totalRunes} rune trackings)`,
                    level: 'info',
                    category: 'svelte-devtools',
                    autoDelete: 8000,
                } as unknown);
            }, 2000);

            return s.hasChanged() ? {code: s.toString(), map: s.generateMap({hires: true})} : null;
        }
    };
    return plugin;
}

interface RpcMethodDefinition {
    name: string;
    type: 'query' | 'mutation';
    handler: (data: unknown) => Promise<unknown>;
}

interface DockEntry {
    id: string;
    title: string;
    icon: string;
    type: 'iframe';
    url: string;
}

function instanceRef(componentId: string): string {
    return `__svt_${componentId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function injectComponentMetadata(s: MagicString, code: string, componentId: string, componentName: string, filename: string, propKeys?: string[]): void {
    const ref = instanceRef(componentId);
    const ast = parseSvelte(code, filename);
    const script = ast?.instance;
    // Reuse an existing $props.id declaration; Svelte permits only one per component.
    const js = script ? parseJavaScript(code.slice(script.content.start, script.content.end)) : null;
    let existingId: string | undefined;
    for (const statement of js?.program.body ?? []) {
        if (!t.isVariableDeclaration(statement)) continue;
        for (const declaration of statement.declarations) {
            const init = declaration.init;
            if (t.isIdentifier(declaration.id) && t.isCallExpression(init) && t.isMemberExpression(init.callee)
                && t.isIdentifier(init.callee.object, { name: '$props' }) && t.isIdentifier(init.callee.property, { name: 'id' })) {
                existingId = declaration.id.name;
            }
        }
    }
    // Define our ID before user code. If the app already declares $props.id, move only that
    // pure compiler-rune declaration here so all inspection hooks can use it immediately.
    let idDeclaration = `const ${ref}_uid=$props.id();const ${ref}=${JSON.stringify(componentId + ':')}+${ref}_uid;`;
    if (existingId && js && script) {
        for (const statement of js.program.body) {
            if (!t.isVariableDeclaration(statement)) continue;
            for (const declaration of statement.declarations) {
                if (t.isIdentifier(declaration.id, { name: existingId }) && declaration.init) {
                    s.overwrite(script.content.start + declaration.init.start!, script.content.start + declaration.init.end!, `${ref}_uid`);
                }
            }
        }
        idDeclaration = `const ${ref}_uid=$props.id();const ${ref}=${JSON.stringify(componentId + ':')}+${ref}_uid;`;
    }
    const metadata = `{id:${ref},parentId:${ref}_parent,name:${JSON.stringify(componentName)},filename:${JSON.stringify(filename)},propKeys:${JSON.stringify(propKeys || [])}}`;
    const combined = `import {onDestroy as ${ref}_destroy,getContext as ${ref}_getContext,setContext as ${ref}_setContext} from 'svelte';${idDeclaration}` +
        `const ${ref}_context=Symbol.for('svelte-devtools.component-parent');const ${ref}_parent=${ref}_getContext(${ref}_context);${ref}_setContext(${ref}_context,${ref});let ${ref}_alive=true;` +
        `if(typeof window!=='undefined'){window.__SVELTE_DEVTOOLS_REGISTRY__||=new Map();window.__SVELTE_DEVTOOLS_REGISTRY__.set(${ref},${metadata});` +
        `const register=(r)=>{if(${ref}_alive)r.registerComponent(${ref},${JSON.stringify(componentName)},${JSON.stringify(filename)})};` +
        `if(window.__SVELTE_DEVTOOLS_RUNTIME__)register(window.__SVELTE_DEVTOOLS_RUNTIME__);else(window.__SVELTE_DEVTOOLS_QUEUE__||=[]).push(register);}` +
        `${ref}_destroy(()=>{${ref}_alive=false;if(typeof window!=='undefined'){window.__SVELTE_DEVTOOLS_RUNTIME__?.unregisterComponent(${ref});window.__SVELTE_DEVTOOLS_REGISTRY__?.delete(${ref})}});`;
    if (script) s.appendLeft(script.content.start, combined);
    else s.prepend(`<script>${combined}</script>`);

    // Tag owned DOM nodes, including alternate branches and multiple roots. Use the
    // compiler AST so markup-like strings, comments and child component props stay intact.
    function tagElements(node: unknown): void {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(tagElements); return; }
        const element = node as Record<string, unknown>;
        if ((element.type === 'RegularElement' || element.type === 'SvelteElement') && typeof element.name === 'string' &&
            !['title', 'meta', 'link', 'base', 'script', 'style'].includes(element.name)) {
            s.appendLeft(Number(element.start) + 1 + element.name.length,
                ` data-svelte-devtools-id={${ref}} data-svelte-component=${JSON.stringify(componentName)}`);
        }
        for (const value of Object.values(element)) if (value && typeof value === 'object') tagElements(value);
    }
    tagElements(ast?.fragment);
}

function injectStateInspection(s: MagicString, code: string, filename: string, componentId: string, runeCounts: Record<string, number>, propKeys?: string[]): void {
    const ast = parseSvelte(code, filename);
    if (!ast) return;

    const {scriptContent, scriptStart} = extractScript(code, ast);
    if (!scriptContent) return;

    const jsAst = parseJavaScript(scriptContent);
    if (!jsAst) return;

    const decls = findStateDeclarations(jsAst, scriptStart, runeCounts, propKeys);

    decls.sort((a, b) => b.injectPos - a.injectPos);

    for (const d of decls) {
        const injectCode = createInjectCode(d, componentId);
        s.appendLeft(d.injectPos, injectCode);
    }
}

interface SvelteAst {
    fragment?: unknown;
    instance?: {
        content: {
            start: number;
            end: number;
        };
    };
}

function parseSvelte(code: string, filename: string): SvelteAst | null {
    try {
        return parse(code, {filename, modern: true}) as unknown as SvelteAst;
    } catch {
        return null;
    }
}

function extractScript(code: string, ast: { instance?: { content: { start: number; end: number } } }): {
    scriptContent: string;
    scriptStart: number
} {
    if (ast.instance) {
        return {
            scriptStart: ast.instance.content.start,
            scriptContent: code.slice(ast.instance.content.start, ast.instance.content.end)
        };
    }
    // A parsed component without an instance script may still have a module
    // script. Module code cannot refer to the per-instance instrumentation ID.
    return {scriptContent: '', scriptStart: 0};
}

function parseJavaScript(code: string): t.File | null {
    try {
        return parseJS(code, {sourceType: 'module', plugins: ['typescript', 'jsx']});
    } catch {
        return null;
    }
}

function createInjectCode(d: StateDeclaration, componentId: string): string {
    if (d.isClassInstance) {
        return `;if(typeof window!=='undefined'){var _q=window.__SVELTE_DEVTOOLS_QUEUE__=window.__SVELTE_DEVTOOLS_QUEUE__||[];var _fn=function(r){r._registerState(${instanceRef(componentId)},'${d.key}',function(v){var s=${d.key};if(s&&v&&typeof v==='object'){var _val=v.current!==void 0?v.current:(v.target!==void 0?v.target:v);if(typeof s.set==='function'){s.set(_val,{hard:true})}else{if(v.target!==void 0)s.target=v.target;if(v.current!==void 0)s.current=v.current}}})};if(window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__._registerState){_fn(window.__SVELTE_DEVTOOLS_RUNTIME__)}else{_q.push(_fn)}};{$effect(()=>{const s=${d.key};if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleState){window.__SVELTE_DEVTOOLS_RUNTIME__.handleState(${instanceRef(componentId)},'${d.key}','update',{current:s?.current,target:s?.target,stiffness:s?.stiffness,damping:s?.damping})}})}`;
    }
    // Skip setter for $derived — assigning to a const throws in Svelte 5 SSR.
    // Skip setter for const $derived — assigning to a const throws.
    const skipSetter = d.callee === '$derived' || d.callee === '$derived.by';
    const ref = instanceRef(componentId);
    const assignment = d.isConst
        ? `if(Array.isArray(${d.key})&&Array.isArray(v)){${d.key}.splice(0,${d.key}.length,...v)}else if(${d.key}&&v&&typeof ${d.key}==='object'&&typeof v==='object'&&!Array.isArray(${d.key})&&!Array.isArray(v)){for(const k of Object.keys(${d.key}))if(!Object.prototype.hasOwnProperty.call(v,k))delete ${d.key}[k];Object.assign(${d.key},v)}else{throw new Error('A const state value can only be edited in place with the same object or array type')}`
        : `${d.key}=v`;
    const setterReg = skipSetter ? '' : `;if(typeof window!=='undefined'){const register=(r)=>{${d.isConst ? `if(${d.key}===null||typeof ${d.key}!=='object')return;` : ''}if(window.__SVELTE_DEVTOOLS_REGISTRY__?.has(${ref}))r._registerState(${ref},'${d.key}',(v)=>{${assignment}})};if(window.__SVELTE_DEVTOOLS_RUNTIME__)register(window.__SVELTE_DEVTOOLS_RUNTIME__);else(window.__SVELTE_DEVTOOLS_QUEUE__||=[]).push(register)}`;
    return `${setterReg};$inspect(${d.key}).with((t,...v)=>{if(typeof window!=='undefined'){const inspect=(r)=>{if(window.__SVELTE_DEVTOOLS_REGISTRY__?.has(${ref}))r.handleState(${ref},'${d.key}',t,v[0])};if(window.__SVELTE_DEVTOOLS_RUNTIME__)inspect(window.__SVELTE_DEVTOOLS_RUNTIME__);else(window.__SVELTE_DEVTOOLS_QUEUE__||=[]).push(inspect)}})`;
}

function findStateDeclarations(ast: t.File, offset: number, runeCounts: Record<string, number>, propKeys?: string[]): StateDeclaration[] {
    const result: StateDeclaration[] = [];

    t.traverse(ast, {
        enter(node) {
            if (!t.isVariableDeclaration(node)) return;

            for (const decl of node.declarations) {
                if (!decl.init) continue;

                extractRuneDeclarations(decl, offset, result, runeCounts, propKeys, node.kind === 'const');
                extractMotionDeclaration(decl, offset, result);
            }
        }
    });

    return result;
}

/**
 * Extract declarations for $state, $derived, $props with support for:
 * - Simple: let count = $state(0)
 * - Object destructuring: let { a, b } = $state({})
 * - Array destructuring: let [first, ...rest] = $state([])
 * - Default values: let { name = 'default' } = $props()
 * - Renamed keys: let { user: name } = $props()
 * - Bindable: let { x = $bindable() } = $props()
 */
function extractRuneDeclarations(decl: t.VariableDeclarator, offset: number, result: StateDeclaration[], runeCounts: Record<string, number>, propKeys?: string[], isConst = false): void {
    if (!t.isCallExpression(decl.init)) return;

    // Handle MemberExpression: $effect.pre(...)
    if (t.isMemberExpression(decl.init.callee)) {
        if (t.isIdentifier(decl.init.callee.object) && decl.init.callee.object.name === '$effect' &&
            t.isIdentifier(decl.init.callee.property) && decl.init.callee.property.name === 'pre') {
            runeCounts['$effect.pre'] = (runeCounts['$effect.pre'] || 0) + 1;
        }
        return;
    }

    if (!t.isIdentifier(decl.init.callee)) return;

    const callee = decl.init.callee.name;
    if (!['$state', '$derived', '$props', '$effect', '$effect.pre', '$bindable', 'untrack', '$host'].includes(callee)) return;

    runeCounts[callee] = (runeCounts[callee] || 0) + 1;

    // untrack and $host are counted but should not produce $inspect injection
    if (callee === 'untrack' || callee === '$host') return;

    const pos = decl.init.end;
    if (pos == null) return;

    // Babel resolves binding names through aliases, defaults, nested patterns,
    // array holes, and rest elements. Property names are not local bindings.
    const bindings = t.getBindingIdentifiers(decl.id);
    for (const key of Object.keys(bindings)) {
        result.push({ key, injectPos: offset + pos, isClassInstance: false, callee, isConst });
    }

    if (callee === '$props' && t.isObjectPattern(decl.id)) {
        for (const prop of decl.id.properties) {
            if (!t.isObjectProperty(prop)) continue;
            if (propKeys) propKeys.push(...Object.keys(t.getBindingIdentifiers(prop.value)));
            if (t.isAssignmentPattern(prop.value)) {
                const right = prop.value.right;
                if (t.isCallExpression(right) && t.isIdentifier(right.callee, { name: '$bindable' })) {
                    runeCounts['$bindable'] = (runeCounts['$bindable'] || 0) + 1;
                }
            }
        }
    }
}

function injectEffectTracking(s: MagicString, code: string, filename: string, componentId: string, runeCounts: Record<string, number>): void {
    const ast = parseSvelte(code, filename);
    if (!ast) return;

    const {scriptContent, scriptStart} = extractScript(code, ast);
    if (!scriptContent) return;

    const jsAst = parseJavaScript(scriptContent);
    if (!jsAst) return;

    // Track standalone $effect() calls (not variable declarations)
    const trackedPositions: { start: number; end: number; name: string }[] = [];

    t.traverse(jsAst, {
        enter(node) {
            if (!t.isExpressionStatement(node)) return;
            if (!t.isCallExpression(node.expression)) return;

            let callee: string | null = null;

            // Handle $effect.pre() as MemberExpression
            if (t.isMemberExpression(node.expression.callee)) {
                if (t.isIdentifier(node.expression.callee.object) && node.expression.callee.object.name === '$effect' &&
                    t.isIdentifier(node.expression.callee.property) && node.expression.callee.property.name === 'pre') {
                    callee = '$effect.pre';
                }
            } else if (t.isIdentifier(node.expression.callee)) {
                callee = node.expression.callee.name;
            }

            if (!callee) return;

            if (callee === '$effect' || callee === '$effect.pre') {
                runeCounts[callee] = (runeCounts[callee] || 0) + 1;
                if (node.expression.start != null && node.expression.end != null) {
                    trackedPositions.push({
                        start: node.expression.start,
                        end: node.expression.end,
                        name: callee,
                    });
                }
            } else if (callee === 'untrack') {
                runeCounts['untrack'] = (runeCounts['untrack'] || 0) + 1;
            }
        },
    });

    // Detect $state.snapshot() and $state.fsync() member expressions
    t.traverse(jsAst, {
        enter(node) {
            if (!t.isCallExpression(node)) return;
            if (!t.isMemberExpression(node.callee)) return;
            if (!t.isIdentifier(node.callee.object)) return;
            if (node.callee.object.name !== '$state') return;
            if (!t.isIdentifier(node.callee.property)) return;

            const member = node.callee.property.name;
            if (member === 'snapshot' || member === 'fsync') {
                runeCounts[`$state.${member}`] = (runeCounts[`$state.${member}`] || 0) + 1;
            }
        },
    });

    // Inject tracking code into $effect callbacks
    trackedPositions.sort((a, b) => b.start - a.start);

    for (const {start, end, name} of trackedPositions) {
        const bodyStart = scriptStart + start;
        // Find the opening brace of the callback
        const callText = code.slice(scriptStart + start, scriptStart + end);
        const fnMatch = callText.match(/^\$effect(?:\.pre)?\s*\(\s*(?:async\s*)?\(\s*\)\s*(?::\s*\w+\s*)?=>\s*\{/);
        if (!fnMatch) continue;

        const bodyOffset = scriptStart + start + (fnMatch[0]?.length || 0);
        const effectKey = `effect_${runeCounts[name]}`;
        // Track effect execution at runtime with a snapshot of current state.
        // The runtime uses componentId to look up the component and capture
        // its state values at the moment the effect runs.
        const injectCode = `if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleEffect){window.__SVELTE_DEVTOOLS_RUNTIME__.handleEffect(${instanceRef(componentId)},'${effectKey}','${name}','${filename.replace(/'/g, "\\'")}')};`;

        s.appendLeft(bodyOffset, injectCode);
    }
}

function extractMotionDeclaration(decl: t.VariableDeclarator, offset: number, result: StateDeclaration[]): void {
    if (!t.isIdentifier(decl.id)) return;
    if (!t.isNewExpression(decl.init)) return;
    if (!t.isIdentifier(decl.init.callee)) return;

    const callee = decl.init.callee.name;
    if (!['Spring', 'Tween'].includes(callee)) return;

    const pos = decl.init.end;
    if (pos != null) {
        result.push({key: decl.id.name, injectPos: offset + pos, isClassInstance: true});
    }
}

export default svelteDevTools;
