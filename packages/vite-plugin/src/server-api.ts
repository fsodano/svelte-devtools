/**
 * Server-side API for the Svelte DevTools plugin.
 *
 * Provides HTTP endpoints at /__svelte-devtools/api/* that agents (both human
 * and AI) can query to inspect the state of a running Svelte application.
 *
 * Security (ADR-0009):
 *   1. Host header is validated before anything else runs (DNS-rebinding
 *      defense).
 *   2. Every request after the OPTIONS preflight requires the per-run bearer
 *      token, as a header or ?token= query parameter.
 *   3. CORS reflects only allow-listed origins — never a wildcard.
 *
 * For runtime data (components, timeline, remote) that lives in the browser,
 * the DevTools iframe client periodically POSTs its state to /api/sync.
 * The other endpoints serve from this cached state.
 */

import type { ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAuthorized } from './token.js';
import {
    isAllowedHost,
    isAllowedOrigin,
    sendForbiddenHost,
    sendUnauthorized,
} from './http-guard.js';
import { computeMigrationScores } from './registry.js';

// ============================================================================
// In-memory cache populated by the DevTools client via POST /api/sync
// ============================================================================

interface SnapshotInfo {
    id: string; parentId: string | null; branchId: string;
    timestamp: number; label: string;
}
interface BranchInfo {
    id: string; name: string; snapshotIds: string[]; color: string;
}
interface CachedState {
    components: unknown[];
    timeline: unknown[];
    remote: Record<string, unknown>;
    snapshots: SnapshotInfo[];
    branches: BranchInfo[];
    updatedAt: number;
}

let cachedState: CachedState = {
    components: [],
    timeline: [],
    remote: {},
    snapshots: [],
    branches: [],
    updatedAt: 0,
};

// ============================================================================
// Helpers
// ============================================================================

function json(req: IncomingMessage, res: ServerResponse, data: unknown, status = 200): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    // CORS: reflect an allow-listed Origin; never emit a wildcard (ADR-0009).
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: string) => (body += chunk));
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function isMethod(req: IncomingMessage, method: string): boolean {
    return (req.method || 'GET').toUpperCase() === method;
}

// ============================================================================
// Route handler
// ============================================================================

export async function handleApiRequest(
    req: IncomingMessage,
    res: ServerResponse,
    server: ViteDevServer,
    pathname: string,
): Promise<void> {
    try {
        // Layer 1: Host validation. Fails before any handler runs,
        // authenticated or not, so DNS rebinding cannot reach the API.
        if (!isAllowedHost(req.headers.host)) {
            sendForbiddenHost(res);
            return;
        }

        // CORS preflight for cross-origin agents. Deliberately unauthenticated:
        // the browser cannot attach the Authorization header to a preflight.
        if (isMethod(req, 'OPTIONS')) {
            const origin = req.headers.origin;
            if (origin && isAllowedOrigin(origin)) {
                res.statusCode = 204;
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                res.setHeader('Access-Control-Max-Age', '600');
                res.setHeader('Vary', 'Origin');
                res.end();
            } else {
                json(req, res, { error: 'Forbidden origin' }, 403);
            }
            return;
        }

        // Layer 2: per-run bearer token on every method and path.
        if (!isAuthorized(req)) {
            sendUnauthorized(res);
            return;
        }

        switch (pathname) {
            // ── Status ──
            case '/status':
            case '/':
            case '': {
                json(req, res, {
                    ok: true,
                    name: '@fsodano/vite-plugin-svelte-devtools',
                    version: '0.0.1',
                    endpoints: [
                        '/__svelte-devtools/api/',
                        '/__svelte-devtools/api/components',
                        '/__svelte-devtools/api/timeline',
                        '/__svelte-devtools/api/server-events',
                        '/__svelte-devtools/api/migration',
                        '/__svelte-devtools/api/source',
                        '/__svelte-devtools/api/snapshots',
                        '/__svelte-devtools/api/set-state',
                        '/__svelte-devtools/api/remote',
                        '/__svelte-devtools/api/sync',
                        '/__svelte-devtools/api/routes',
                    ],
                    legacyEndpoints: '/__svelte-devtools/server-events, /__svelte-devtools/migration-score',
                    auth: 'Bearer token (header) or ?token= (query)',
                });
                return;
            }

            // ── Components (from cached sync) ──
            case '/components': {
                json(req, res, {
                    ok: true,
                    count: cachedState.components.length,
                    components: cachedState.components,
                    cachedAt: cachedState.updatedAt,
                });
                return;
            }

            // ── Timeline (from cached sync) ──
            case '/timeline': {
                json(req, res, {
                    ok: true,
                    count: cachedState.timeline.length,
                    entries: cachedState.timeline,
                    cachedAt: cachedState.updatedAt,
                });
                return;
            }

            // ── Remote debugging API ──
            case '/remote': {
                json(req, res, {
                    ok: true,
                    ...cachedState.remote,
                    cachedAt: cachedState.updatedAt,
                });
                return;
            }

            // ── Server events (from existing server-events module) ──
            case '/server-events': {
                const { getServerEvents, clearServerEvents } = await import('./server-events.js');
                if (req.method === 'GET') {
                    const rawUrl = req.url || '';
                    const params = new URLSearchParams(rawUrl.includes('?') ? rawUrl.split('?')[1] : '');
                    const last = parseInt(params.get('last') || '', 10) || undefined;
                    const sinceId = params.get('sinceId') || undefined;
                    json(req, res, { ok: true, events: getServerEvents({ last, sinceId }) });
                } else if (req.method === 'DELETE') {
                    clearServerEvents();
                    json(req, res, { ok: true });
                } else {
                    json(req, res, { error: 'Method not allowed' }, 405);
                }
                return;
            }

            // ── Migration score from the live build-time registry (ADR-0010) ──
            case '/migration': {
                json(req, res, { ok: true, ...computeMigrationScores() });
                return;
            }

            // ── Snapshot tree (branch visualization) ──
            case '/snapshots': {
                json(req, res, {
                    ok: true,
                    snapshots: cachedState.snapshots,
                    branches: cachedState.branches,
                    count: cachedState.snapshots.length,
                    cachedAt: cachedState.updatedAt,
                });
                return;
            }

            // ── Set component state ──
            // Option B (ADR-0010): live state editing requires a runtime
            // channel that does not exist. Return 501 instead of mutating the
            // sync cache, so an agent can never mistake a cache write for a
            // live edit.
            case '/set-state': {
                if (!isMethod(req, 'POST')) {
                    json(req, res, { error: 'Method not allowed, use POST' }, 405);
                    return;
                }
                const body = await readBody(req);
                const data = JSON.parse(body);
                const { componentId, key } = data;
                if (!componentId || !key) {
                    json(req, res, { error: 'Missing componentId or key' }, 400);
                    return;
                }
                json(req, res, {
                    error: 'NOT_IMPLEMENTED',
                    message: 'Live state editing is not implemented. POST /api/set-state cannot write to the running app; refusing to report a cache-only write as a live edit.',
                }, 501);
                return;
            }

            // ── Source file lookup (canonicalized to the Vite config root) ──
            case '/source': {
                const rawUrl = req.url || '';
                const params = new URLSearchParams(rawUrl.includes('?') ? rawUrl.split('?')[1] : '');
                const file = params.get('file');
                if (!file) { json(req, res, { error: 'Missing ?file= param' }, 400); return; }
                try {
                    const { readFileSync, realpathSync } = await import('node:fs');
                    const { resolve, isAbsolute, sep } = await import('node:path');
                    const root = server.config?.root ?? process.cwd();
                    const rootReal = realpathSync(root);
                    // Resolve relative to the Vite config root, then canonicalize
                    // with realpath so symlink and `..` escapes are caught.
                    const resolved = isAbsolute(file) ? file : resolve(root, file);
                    let real: string;
                    try {
                        real = realpathSync(resolved);
                    } catch {
                        json(req, res, { error: 'File does not exist' }, 404);
                        return;
                    }
                    const insideRoot = real === rootReal || real.startsWith(rootReal + sep);
                    if (!insideRoot) {
                        json(req, res, { error: 'File outside project' }, 403);
                        return;
                    }
                    const code = readFileSync(real, 'utf-8');
                    const lines = code.split('\n').map((l: string, i: number) => ({ line: i + 1, text: l }));
                    json(req, res, { ok: true, file: real, lines, totalLines: lines.length });
                } catch (e) {
                    json(req, res, { error: `Cannot read file: ${e instanceof Error ? e.message : String(e)}` }, 404);
                }
                return;
            }

            // ── Sync (POST from DevTools client) ──
            case '/sync': {
                if (!isMethod(req, 'POST')) {
                    json(req, res, { error: 'Method not allowed, use POST' }, 405);
                    return;
                }
                const body = await readBody(req);
                const data = JSON.parse(body);
                if (data.components) cachedState.components = data.components;
                if (data.timeline) cachedState.timeline = data.timeline;
                if (data.remote) cachedState.remote = data.remote;
                if (data.snapshots) cachedState.snapshots = data.snapshots;
                if (data.branches) cachedState.branches = data.branches;
                cachedState.updatedAt = Date.now();
                json(req, res, { ok: true, cachedAt: cachedState.updatedAt });
                return;
            }

            // ── SvelteKit routes from filesystem ──
            case '/routes': {
                const { readdirSync, statSync, existsSync } = await import('node:fs');
                const { join, relative, resolve } = await import('node:path');
                const root = server.config?.root ?? process.cwd();
                const routesDir = join(root, 'src', 'routes');
                const svelteKitRoutes: Array<{
                    id: string; cleanedUrl: string; files: Record<string, boolean>;
                    routeGroup?: string; paramNames?: string[];
                }> = [];
                if (existsSync(routesDir)) {
                    function scanDir(dir: string, prefix: string): void {
                        let entries: string[];
                        try { entries = readdirSync(dir); } catch { return; }
                        for (const entry of entries.sort()) {
                            const fullPath = join(dir, entry);
                            const stat = statSync(fullPath);
                            if (stat.isDirectory()) {
                                if (entry.startsWith('(') && entry.endsWith(')')) {
                                    // Route group — transparent to URL
                                    scanDir(fullPath, prefix);
                                } else {
                                    scanDir(fullPath, prefix + '/' + entry.replace(/\[\.\.\./g, '*').replace(/\[/g, ':').replace(/\]/g, ''));
                                }
                            } else if (entry.endsWith('.svelte') || entry.endsWith('.ts') || entry.endsWith('.js')) {
                                const base = entry.replace(/\.(svelte|ts|js)$/, '');
                                if (base.startsWith('+')) {
                                    const relPath = relative(routesDir, fullPath);
                                    const urlPath = prefix || '/' || '';
                                    let routeId = svelteKitRoutes.find(r => r.cleanedUrl === urlPath);
                                    if (!routeId) {
                                        routeId = {
                                            id: urlPath || '/',
                                            cleanedUrl: urlPath || '/',
                                            files: {},
                                            routeGroup: prefix.includes('(') ? prefix.match(/\((\w+)\)/)?.[1] : undefined,
                                            paramNames: urlPath.match(/:(\w+)/g)?.map(p => p.slice(1)) || [],
                                        };
                                        svelteKitRoutes.push(routeId);
                                    }
                                    const fileKey = base.slice(1); // +page → page, +layout → layout, etc.
                                    routeId.files[fileKey] = true;
                                }
                            }
                        }
                    }
                    scanDir(routesDir, '');
                }
                json(req, res, { ok: true, routes: svelteKitRoutes });
                return;
            }

            default:
                json(req, res, { error: `Unknown API endpoint: ${pathname}` }, 404);
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(req, res, { error: msg }, 500);
    }
}
