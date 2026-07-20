/**
 * Server-side API for the Svelte DevTools plugin.
 *
 * Provides HTTP endpoints at /__svelte-devtools/api/* that agents (both human
 * and AI) can query to inspect the state of a running Svelte application.
 *
 * For runtime data (components, timeline, remote) that lives in the browser,
 * the DevTools iframe client periodically POSTs its state to /api/sync.
 * The other endpoints serve from this cached state.
 */

import type { ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ============================================================================
// In-memory cache populated by the DevTools client via POST /api/sync
// ============================================================================

interface CachedState {
    components: unknown[];
    timeline: unknown[];
    remote: Record<string, unknown>;
    updatedAt: number;
}

let cachedState: CachedState = {
    components: [],
    timeline: [],
    remote: {},
    updatedAt: 0,
};

// ============================================================================
// Helpers
// ============================================================================

function json(res: ServerResponse, data: unknown, status = 200): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
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
    _server: ViteDevServer,
    pathname: string,
): Promise<void> {
    try {
        switch (pathname) {
            // ── Status ──
            case '/status':
            case '/':
            case '': {
                json(res, {
                    ok: true,
                    name: '@svelte-devtools/vite-plugin',
                    version: '0.0.1',
                    endpoints: [
                        '/__svelte-devtools/api/',
                        '/__svelte-devtools/api/components',
                        '/__svelte-devtools/api/timeline',
                        '/__svelte-devtools/api/remote',
                        '/__svelte-devtools/api/sync',
                    ],
                    note: 'server-events at /__svelte-devtools/server-events, migration at /__svelte-devtools/migration-score',
                });
                return;
            }

            // ── Components (from cached sync) ──
            case '/components': {
                json(res, {
                    ok: true,
                    count: cachedState.components.length,
                    components: cachedState.components,
                    cachedAt: cachedState.updatedAt,
                });
                return;
            }

            // ── Timeline (from cached sync) ──
            case '/timeline': {
                json(res, {
                    ok: true,
                    count: cachedState.timeline.length,
                    entries: cachedState.timeline,
                    cachedAt: cachedState.updatedAt,
                });
                return;
            }

            // ── Remote debugging API ──
            case '/remote': {
                json(res, {
                    ok: true,
                    ...cachedState.remote,
                    cachedAt: cachedState.updatedAt,
                });
                return;
            }

            // ── Sync (POST from DevTools client) ──
            case '/sync': {
                if (!isMethod(req, 'POST')) {
                    json(res, { error: 'Method not allowed, use POST' }, 405);
                    return;
                }
                const body = await readBody(req);
                const data = JSON.parse(body);
                if (data.components) cachedState.components = data.components;
                if (data.timeline) cachedState.timeline = data.timeline;
                if (data.remote) cachedState.remote = data.remote;
                cachedState.updatedAt = Date.now();
                json(res, { ok: true, cachedAt: cachedState.updatedAt });
                return;
            }

            default:
                json(res, { error: `Unknown API endpoint: ${pathname}` }, 404);
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, { error: msg }, 500);
    }
}
