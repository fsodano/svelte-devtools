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
import {parse} from 'svelte/compiler';
import type {ComponentMeta, StateDeclaration, SvelteDevToolsPluginOptions} from '@svelte-devtools/types';
import {DOCK_CONFIG, RPC_METHODS, RPC_TYPES} from '@svelte-devtools/types';
import type {DevToolsNodeContext} from '@vitejs/devtools-kit';
import {analyzeMigration} from './migration-analyzer.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEVTOOLS_PREFIX = '/__svelte-devtools';
const GLOBAL_KEY = '__svelte_devtools_addEvent__';
const COMPONENT_REGISTRY = new Map<string, ComponentMeta>();
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
    const {exclude = [/node_modules/], include = [/\.svelte$/], enableStateInspection = true} = options;
    let root = process.cwd();
    let config: ResolvedConfig;

    // Vite 8: use createFilter for include/exclude matching
    const filter = createFilter(include, exclude);

    const plugin: Plugin & { devtools: { setup: (ctx: DevToolsNodeContext) => void } } = {
        name: 'svelte-devtools',
        // apply: 'serve' is the default for devtools plugins — no need to set explicitly
        apply: 'serve',
        enforce: 'pre',

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

                const hasSvelteKit = resolvedConfig.plugins.some(
                    (p: { name?: string }) => p?.name === 'vite-plugin-sveltekit'
                );
                if (hasSvelteKit && isDebug) {
                    console.info(
                        '[Svelte DevTools] SvelteKit detected — add to src/hooks.server.ts:\n' +
                        '  import { dev } from \'$app/environment\';\n' +
                        '  import { svelteDevToolsHandle, noopHandle } from \'@svelte-devtools/vite-plugin/sveltekit\';\n' +
                        '  export const handle = dev ? svelteDevToolsHandle() : noopHandle();'
                    );
                }
        },

        configureServer(server: ViteDevServer) {
            viteServer = server;
            let clientPath: string;
            try {
                clientPath = path.resolve(path.dirname(require.resolve('@svelte-devtools/vite-plugin/package.json')), '../client/dist');
            } catch {
                clientPath = path.resolve(__dirname, '../../client/dist');
            }

            const distPath = path.resolve(__dirname, '../../../dist');
            let runtimePath: string;
            try {
                runtimePath = path.resolve(path.dirname(require.resolve('@svelte-devtools/runtime/package.json')), '../runtime/dist');
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

            (globalThis as Record<string, unknown>).__SVELTE_DEVTOOLS_INJECT_PATH__ = viteDevtoolsInjectPath;

            (globalThis as Record<string, unknown>)[GLOBAL_KEY] = (event: unknown) => {
                import('./server-events.js').then(({ addServerEvent }) => addServerEvent(event as Parameters<typeof addServerEvent>[0]));
            };

            const markSeenTimestamps = new Map<string, number>();
            (globalThis as Record<string, unknown>)['__svelte_devtools_markSeen__'] = (key: string) => {
                markSeenTimestamps.set(key, Date.now());
            };
            setInterval(() => {
                const cutoff = Date.now() - 300_000;
                for (const [k, ts] of markSeenTimestamps) {
                    if (ts < cutoff) markSeenTimestamps.delete(k);
                }
            }, 60_000);

            server.middlewares.use((req, res, next) => {
                const url = req.url?.split('?')[0] || '';
                if (
                    url.startsWith('/__svelte-devtools') ||
                    url.startsWith('/@') ||
                    url.startsWith('/node_modules') ||
                    /\.(js|css|woff2?|map|ico|svg|png|jpg|webp|avif|ttf|eot)(\?|$)/.test(url)
                ) {
                    next();
                    return;
                }
                const startTime = Date.now();
                const reqKey = `${req.method}:${url}`;

                const reqBodyPreview = '';

                const originalEnd = res.end.bind(res);
                let bodyChunks: Buffer[] = [];
                const perfStart = performance.now();
                res.end = function (this: typeof res, ...args: unknown[]) {
                    const chunk = args[0];
                    if (chunk instanceof Buffer || typeof chunk === 'string') {
                        bodyChunks.push(Buffer.from(chunk));
                    }
                    return originalEnd(chunk as never, args[1] as never, args[2] as never);
                } as typeof res.end;

                res.on('finish', () => {
                    const duration = performance.now() - perfStart;
                    if (markSeenTimestamps.has(reqKey)) {
                        markSeenTimestamps.delete(reqKey);
                        return;
                    }
                    if (/\.(svelte|js|ts|css|json|ico|svg|png|woff2?)$/.test(url)) return;
                    const body = Buffer.concat(bodyChunks).toString('utf-8');
                    const contentType = (res.getHeader('content-type') as string) || '';
                    const isJson = contentType.includes('json');
                    import('./server-events.js').then(({ addServerEvent }) => {
                        addServerEvent({
                            id: `srv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                            type: res.statusCode >= 400 ? 'server:error' : 'server:ssr',
                            timestamp: startTime,
                            duration,
                            data: {
                                url,
                                method: req.method || 'GET',
                                statusCode: res.statusCode,
                                requestBody: reqBodyPreview || undefined,
                                _handler: 'generic',
                                contentType,
                                responseSize: body.length,
                                responsePreview: isJson ? body.slice(0, 2000) : body.slice(0, 500),
                                reqHeaders: {
                                    'content-type': req.headers['content-type'],
                                    'user-agent': req.headers['user-agent'],
                                    'accept': req.headers['accept'],
                                    'referer': req.headers['referer'],
                                    'content-length': req.headers['content-length'],
                                    'cookie': req.headers['cookie'] ? '[present]' : undefined,
                                },
                                resHeaders: Object.fromEntries(
                                    Object.entries(res.getHeaders()).map(([k, v]) => [k, String(v)])
                                ),
                            }
                        });
                    });
                });
                next();
            });

            server.middlewares.use('/__svelte-devtools/server-events', async (req, res, _next) => {
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
                        res.end(JSON.stringify(getServerEvents({last, sinceId})));
                    } else if (method === 'DELETE') {
                        const {clearServerEvents} = await import('./server-events.js');
                        clearServerEvents();
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
                        const filePath = path.resolve(root, file);
                        launchEditor(`${filePath}:${line || 1}:${column || 0}`);
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ok: true}));
                    } catch (e) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({error: 'Invalid JSON body'}));
                    }
                });
            });

            server.middlewares.use('/__svelte-devtools/migration-score', async (req, res, _next) => {
                if (req.method !== 'GET') {
                    res.statusCode = 405;
                    res.end(JSON.stringify({error: 'Method not allowed'}));
                    return;
                }
                const results = Array.from(COMPONENT_REGISTRY.values())
                    .filter(m => m.migrationResult)
                    .map(m => m.migrationResult!);
                const total = results.length;
                const avgScore = total > 0
                    ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / total)
                    : 100;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({overall: avgScore, totalFiles: total, perFile: results}));
            });

            // ── API endpoints (Connect strips /__svelte-devtools/api prefix) ──
            server.middlewares.use('/__svelte-devtools/api', async (req, res, _next) => {
                const pathname = req.url?.split('?')[0] || '/';
                const { handleApiRequest } = await import('./server-api.js');
                await handleApiRequest(req, res, server, pathname);
            });

            server.middlewares.use(DEVTOOLS_PREFIX, (req, res, next) => {
                const url = req.url?.split('?')[0] || '';
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
                launchEditor(`${path.resolve(root, data.file)}:${data.line || 1}`);
            });
        },

        transformIndexHtml(html: string) {
            const runtimeScript = `<script type="module" src="${DEVTOOLS_PREFIX}/svelte-runtime.js"></script>`;
            return html.replace('</head>', `${runtimeScript}</head>`);
        },


        devtools: {
            setup(ctx: DevToolsNodeContext) {
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
                        const results = Array.from(COMPONENT_REGISTRY.values())
                            .filter(m => m.migrationResult)
                            .map(m => m.migrationResult!);
                        const total = results.length;
                        const avgScore = total > 0
                            ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / total)
                            : 100;
                        return { overall: avgScore, totalFiles: total, perFile: results };
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
                injectStateInspection(s, code, id, componentId, runeCounts, propKeys);
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

function injectComponentMetadata(s: MagicString, code: string, componentId: string, componentName: string, filename: string, propKeys?: string[]): void {
    const propKeysJson = JSON.stringify(propKeys || []);
    const registryInj = `if(typeof window!=='undefined'){window.__SVELTE_DEVTOOLS_REGISTRY__||=new Map();window.__SVELTE_DEVTOOLS_REGISTRY__.set('${componentId}',{id:'${componentId}',name:'${componentName}',filename:'${filename}',propKeys:${propKeysJson}})}`;
    const runtimeInj = `if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__){window.__SVELTE_DEVTOOLS_RUNTIME__.registerComponent('${componentId}','${componentName}','${filename}');}`;

    const combinedInj = registryInj + runtimeInj;

    const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(code);
    if (match) s.appendLeft(match.index + match[0].indexOf('>') + 1, combinedInj);
    else s.prepend(`<script>${combinedInj}</script>`);

    const search = code.replace(/<(script|style)[^>]*>([\s\S]*?)<\/\1>/gi, (m, _, c) => m.replace(c, ' '.repeat(c.length)));
    const tagRegex = /<([a-zA-Z0-9-:]+)/g;
    let m: RegExpExecArray | null;
    while ((m = tagRegex.exec(search)) !== null) {
        const tn = m[1].toLowerCase();
        if (['script', 'style', 'title', 'meta', 'link', 'base'].includes(tn) || tn.startsWith('svelte:')) continue;
        s.appendLeft(m.index + m[0].length, ` data-svelte-devtools-id="${componentId}" data-svelte-component="${componentName}"`);
        break;
    }
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
    const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(code);
    if (!match) return {scriptContent: '', scriptStart: 0};
    return {
        scriptStart: match.index + match[0].indexOf(match[1]),
        scriptContent: match[1]
    };
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
        return `;if(typeof window!=='undefined'){var _q=window.__SVELTE_DEVTOOLS_QUEUE__=window.__SVELTE_DEVTOOLS_QUEUE__||[];var _fn=function(r){r._registerState('${componentId}','${d.key}',function(v){var s=${d.key};if(s&&v&&typeof v==='object'){var _val=v.current!==void 0?v.current:(v.target!==void 0?v.target:v);if(typeof s.set==='function'){s.set(_val,{hard:true})}else{if(v.target!==void 0)s.target=v.target;if(v.current!==void 0)s.current=v.current}}})};if(window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__._registerState){_fn(window.__SVELTE_DEVTOOLS_RUNTIME__)}else{_q.push(_fn)}};{$effect(()=>{const s=${d.key};if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleState){window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('${componentId}','${d.key}','update',{current:s?.current,target:s?.target,stiffness:s?.stiffness,damping:s?.damping})}})}`;
    }
    // Skip setter for $derived — assigning to a const throws in Svelte 5 SSR.
    // Skip setter for const $derived — assigning to a const throws.
    const skipSetter = d.callee === '$derived' && d.isConst;
    const setterReg = skipSetter
        ? ''
        : `;if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__._registerState){window.__SVELTE_DEVTOOLS_RUNTIME__._registerState('${componentId}','${d.key}',(v)=>{${d.key}=v})}`;
    return `${setterReg};$inspect(${d.key}).with((t,...v)=>{if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleState){window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('${componentId}','${d.key}',t,v[0])}})`;
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

    if (t.isIdentifier(decl.id)) {
        result.push({ key: decl.id.name, injectPos: offset + pos, isClassInstance: false, callee, isConst });
        return;
    }

    if (t.isObjectPattern(decl.id)) {
        for (const prop of decl.id.properties) {
            if (t.isObjectProperty(prop)) {
                if (t.isIdentifier(prop.key)) {
                    const actualName = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name;
                    result.push({ key: actualName, injectPos: offset + pos, isClassInstance: false, callee, isConst });
                    if (callee === '$props' && propKeys) {
                        propKeys.push(actualName);
                    }
                }
            } else if (t.isRestElement(prop)) {
                if (t.isIdentifier(prop.argument)) {
                    result.push({ key: prop.argument.name, injectPos: offset + pos, isClassInstance: false });
                }
            }
        }

        // Detect $bindable() in default values for $props() destructuring
        if (callee === '$props') {
            for (const prop of decl.id.properties) {
                if (t.isObjectProperty(prop) && t.isAssignmentPattern(prop.value)) {
                    const right = prop.value.right;
                    if (t.isCallExpression(right) && t.isIdentifier(right.callee) && right.callee.name === '$bindable') {
                        runeCounts['$bindable'] = (runeCounts['$bindable'] || 0) + 1;
                    }
                }
            }
        }

        return;
    }

    if (t.isArrayPattern(decl.id)) {
        for (const element of decl.id.elements) {
            if (t.isIdentifier(element)) {
                result.push({ key: element.name, injectPos: offset + pos, isClassInstance: false });
            } else if (t.isRestElement(element)) {
                if (t.isIdentifier(element.argument)) {
                    result.push({ key: element.argument.name, injectPos: offset + pos, isClassInstance: false });
                }
            } else if (t.isAssignmentPattern(element)) {
                if (t.isIdentifier(element.left)) {
                    result.push({ key: element.left.name, injectPos: offset + pos, isClassInstance: false });
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
        const injectCode = `if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleEffect){window.__SVELTE_DEVTOOLS_RUNTIME__.handleEffect('${componentId}','${effectKey}','${name}','${filename.replace(/'/g, "\\'")}')};`;

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
