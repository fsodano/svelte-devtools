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
import { getCommandBroker } from './command-broker.js';

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
    sessionId: string | null;
    components: unknown[];
    timeline: unknown[];
    remote: Record<string, unknown>;
    snapshots: SnapshotInfo[];
    branches: BranchInfo[];
    updatedAt: number;
}

function emptyCache(sessionId: string | null = null): CachedState {
    return { sessionId, components: [], timeline: [], remote: {}, snapshots: [], branches: [], updatedAt: 0 };
}
const serverCaches = new WeakMap<object, { latest: CachedState; anonymous: CachedState; sessions: Map<string, CachedState> }>();
function getCaches(server: object) {
    let caches = serverCaches.get(server);
    if (!caches) { const anonymous = emptyCache(); caches = { latest: anonymous, anonymous, sessions: new Map() }; serverCaches.set(server, caches); }
    return caches;
}

// ============================================================================
// Helpers
// ============================================================================

function json(req: IncomingMessage, res: ServerResponse, data: unknown, status = 200): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
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

        const caches = getCaches(server);
        const query = new URLSearchParams((req.url || '').split('?')[1]);
        const sessionQuery = query.get('sessionId');
        const runtimePaths = ['/components', '/timeline', '/snapshots', '/remote'];
        if (sessionQuery && runtimePaths.includes(pathname) && !caches.sessions.has(sessionQuery)) {
            json(req, res, { ok: false, error: 'NO_SESSION_DATA: this panel has not synced yet.' }, 409); return;
        }
        const offset = Number(query.get('offset') ?? 0);
        const limit = query.has('limit') ? Number(query.get('limit')) : undefined;
        if (runtimePaths.includes(pathname) && (!Number.isInteger(offset) || offset < 0 || (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)))) {
            json(req, res, { error: 'offset must be a nonnegative integer; limit must be 1–500.' }, 400); return;
        }
        let cachedState = sessionQuery && runtimePaths.includes(pathname) ? caches.sessions.get(sessionQuery)! : caches.latest;
        switch (pathname) {
            // ── Status ──
            case '/status':
            case '/':
            case '': {
                json(req, res, {
                    ok: true,
                    name: '@fsodano/vite-plugin-svelte-devtools',
                    version: '0.1.1',
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
                    apiVersion: 1,
                    capabilities: {
                        componentInspection: true,
                        sourceLookup: true,
                        serverTracing: true,
                        liveStateEditing: true,
                        sessions: getCommandBroker(server).listSessions(),
                        runtimeData: {
                            transport: 'panel-sync',
                            requiresOpenPanel: true,
                            cachedAt: cachedState.updatedAt,
                    sessionId: cachedState.sessionId,
                            ageMs: cachedState.updatedAt === 0 ? null : Math.max(0, Date.now() - cachedState.updatedAt),
                            hasSynced: cachedState.updatedAt !== 0,
                            note: 'Open the app and authorize and open the Svelte panel. Runtime endpoints return the last panel sync, not a live runtime query. An old cache does not prove the app is still connected.',
                        },
                    },
                    operations: {
                        status: { method: 'GET', path: '/__svelte-devtools/api/' },
                        components: { method: 'GET', path: '/__svelte-devtools/api/components', source: 'panel-cache' },
                        timeline: { method: 'GET', path: '/__svelte-devtools/api/timeline', source: 'panel-cache' },
                        snapshots: { method: 'GET', path: '/__svelte-devtools/api/snapshots', source: 'panel-cache' },
                        remote: { method: 'GET', path: '/__svelte-devtools/api/remote', source: 'panel-cache' },
                        routes: { method: 'GET', path: '/__svelte-devtools/api/routes', source: 'filesystem' },
                        source: { method: 'GET', path: '/__svelte-devtools/api/source', requiredQuery: ['file'] },
                        migration: { method: 'GET', path: '/__svelte-devtools/api/migration', source: 'transform-registry' },
                        serverEvents: { method: 'GET', path: '/__svelte-devtools/api/server-events', optionalQuery: ['last', 'sinceId'] },
                        clearServerEvents: { method: 'DELETE', path: '/__svelte-devtools/api/server-events' },
                        setState: { method: 'POST', path: '/__svelte-devtools/api/set-state', supported: true, requiredFields: ['sessionId', 'componentId', 'key', 'value'], acknowledgement: 'live-panel' },
                        sync: { method: 'POST', path: '/__svelte-devtools/api/sync', internal: true },
                    },
                });
                return;
            }

            // ── Components (from cached sync) ──
            case '/components': {
                const matched = (cachedState.components as Array<Record<string, unknown>>).filter(c =>
                    (!query.has('id') || c.id === query.get('id')) &&
                    (!query.has('name') || String(c.name).toLowerCase().includes(query.get('name')!.toLowerCase())));
                const page = matched.slice(offset, limit === undefined ? undefined : offset + limit);
                const components = query.get('includeState') === 'false'
                    ? page.map(({ id, name, filename, parentId }) => ({ id, name, filename, parentId })) : page;
                json(req, res, { ok: true, count: components.length, total: matched.length, offset,
                    components, cachedAt: cachedState.updatedAt, sessionId: cachedState.sessionId });
                return;
            }

            // ── Timeline (from cached sync) ──
            case '/timeline': {
                const matched = (cachedState.timeline as Array<Record<string, unknown>>).filter(e => !query.has('type') || e.type === query.get('type'));
                const entries = matched.slice(offset, limit === undefined ? undefined : offset + limit);
                json(req, res, { ok: true, count: entries.length, total: matched.length, offset,
                    entries, cachedAt: cachedState.updatedAt, sessionId: cachedState.sessionId });
                return;
            }

            // ── Remote debugging API ──
            case '/remote': {
                json(req, res, {
                    ok: true,
                    ...cachedState.remote,
                    cachedAt: cachedState.updatedAt,
                    sessionId: cachedState.sessionId,
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
                const snapshots = cachedState.snapshots.slice(offset, limit === undefined ? undefined : offset + limit);
                json(req, res, { ok: true, count: snapshots.length, total: cachedState.snapshots.length, offset,
                    snapshots, branches: cachedState.branches, cachedAt: cachedState.updatedAt, sessionId: cachedState.sessionId });
                return;
            }

            // Commands require an explicit live panel session. The cache is never mutated here.
            case '/set-state': {
                if (!isMethod(req, 'POST')) { json(req, res, { error: 'Method not allowed, use POST' }, 405); return; }
                let data;
                try { data = JSON.parse(await readBody(req)); }
                catch { json(req, res, { error: 'Invalid JSON' }, 400); return; }
                if (!data || typeof data.sessionId !== 'string' || !data.sessionId ||
                    typeof data.componentId !== 'string' || !data.componentId ||
                    typeof data.key !== 'string' || !data.key || !Object.prototype.hasOwnProperty.call(data, 'value')) {
                    json(req, res, { error: 'Missing sessionId, componentId, key, or value' }, 400); return;
                }
                const result = await getCommandBroker(server).submit({
                    sessionId: data.sessionId, componentId: data.componentId, key: data.key, value: data.value,
                });
                json(req, res, result, result.ok ? 200 : 409);
                return;
            }
            case '/commands': {
                if (!isMethod(req, 'GET')) { json(req, res, { error: 'Method not allowed, use GET' }, 405); return; }
                const query = new URLSearchParams((req.url || '').split('?')[1]);
                const sessionId = query.get('sessionId');
                if (!sessionId || sessionId.length > 128) { json(req, res, { error: 'Invalid sessionId' }, 400); return; }
                const commands = getCommandBroker(server).poll(sessionId, (query.get('url') || '').slice(0, 2048));
                json(req, res, { ok: true, commands });
                return;
            }
            case '/commands/result': {
                if (!isMethod(req, 'POST')) { json(req, res, { error: 'Method not allowed, use POST' }, 405); return; }
                let data;
                try { data = JSON.parse(await readBody(req)); }
                catch { json(req, res, { error: 'Invalid JSON' }, 400); return; }
                if (!data || typeof data.sessionId !== 'string' || typeof data.id !== 'string' ||
                    typeof data.result?.ok !== 'boolean') { json(req, res, { error: 'Invalid acknowledgement' }, 400); return; }
                const accepted = getCommandBroker(server).acknowledge(data.sessionId, data.id, data.result);
                json(req, res, { ok: accepted }, accepted ? 200 : 409);
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
                if (!data || typeof data !== 'object' || Array.isArray(data) || (Object.prototype.hasOwnProperty.call(data, 'sessionId') &&
                    (typeof data.sessionId !== 'string' || !data.sessionId || data.sessionId.length > 128))) {
                    json(req, res, { error: 'Invalid sync sessionId' }, 400); return;
                }
                cachedState = caches.anonymous;
                if (typeof data.sessionId === 'string') {
                    cachedState = caches.sessions.get(data.sessionId) ?? emptyCache(data.sessionId);
                    if (!caches.sessions.has(data.sessionId) && caches.sessions.size >= 64) {
                        caches.sessions.delete(caches.sessions.keys().next().value!);
                    }
                    caches.sessions.set(data.sessionId, cachedState);
                }
                caches.latest = cachedState;
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
                const { scanRoutes, resolveRouteDirectory } = await import('./route-scanner.js');
                const root = server.config?.root ?? process.cwd();
                const directory = resolveRouteDirectory(root, server.config?.plugins ?? []);
                const routes = scanRoutes(directory.routesDir);
                json(req, res, { ok: true, count: routes.length, routes, ...directory });
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
