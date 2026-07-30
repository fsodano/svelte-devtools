import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ============================================================================
// Mock dependencies
// ============================================================================

vi.mock('../../packages/vite-plugin/src/server-events.js', () => ({
    getServerEvents: vi.fn((_opts?: { last?: number; sinceId?: string }) => []),
    clearServerEvents: vi.fn(),
}));

vi.mock('../../packages/vite-plugin/src/migration-analyzer.js', () => ({
    analyzeMigration: vi.fn(() => ({
        filename: 'test.svelte',
        maxScore: 0,
        actualScore: 0,
        percentage: 100,
        patterns: [],
    })),
}));

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(() => `// line 1\nconst a = 1;\n`) as unknown,
    existsSync: vi.fn(() => true) as unknown,
    readdirSync: vi.fn(() => ['+page.svelte', '+layout.svelte', '+page.ts', 'api', 'about']) as unknown,
    statSync: vi.fn(() => ({ isDirectory: () => false })) as unknown,
}));

vi.mock('node:path', () => ({
    resolve: vi.fn((...args: string[]) => args.filter(Boolean).join('/').replace(/\/+/g, '/')) as unknown,
    isAbsolute: vi.fn((p: string) => p.startsWith('/')) as unknown,
    join: vi.fn((...args: string[]) => args.filter(Boolean).join('/').replace(/\/+/g, '/')) as unknown,
    relative: vi.fn((_from: string, to: string) => {
        const rel = to.replace(_from, '');
        return rel.startsWith('/') ? rel.slice(1) : rel;
    }) as unknown,
}));

// ============================================================================
// Import the module under test (after mocks are set up)
// ============================================================================

import { handleApiRequest } from '../../packages/vite-plugin/src/server-api.js';
import { getServerEvents, clearServerEvents } from '../../packages/vite-plugin/src/server-events.js';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, isAbsolute, join, relative } from 'node:path';

// ============================================================================
// Helpers
// ============================================================================

function createMockReq(url = '/', method = 'GET', body?: string): IncomingMessage {
    const req = {
        url,
        method,
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
            if (body !== undefined) {
                if (event === 'data' && body) {
                    queueMicrotask(() => handler(body));
                } else if (event === 'end') {
                    queueMicrotask(() => handler());
                }
            }
            return req;
        }),
    } as unknown as IncomingMessage;
    return req;
}

function createMockRes(): ServerResponse & { body: string; statusCode: number } {
    const chunks: string[] = [];
    const res: Record<string, unknown> = {
        statusCode: 200,
        body: '',
        setHeader: vi.fn(),
        end: vi.fn((data: string) => {
            chunks.push(data);
            res.body = chunks.join('');
        }),
        getHeader: vi.fn(),
        on: vi.fn(),
    };
    return res as unknown as ServerResponse & { body: string; statusCode: number };
}

function parseRes(res: ServerResponse & { body: string }): unknown {
    return JSON.parse(res.body);
}

const mockServer = {} as ViteDevServer;

// ============================================================================
// Tests
// ============================================================================

describe('handleApiRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        delete (globalThis as Record<string, unknown>)['__SVELTE_DEVTOOLS_REGISTRY__'];
    });

    // ── Status ──

    describe('status endpoint', () => {
        it.each(['/', '/status', ''])('returns ok for pathname "%s"', async (pathname) => {
            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, pathname);

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({
                ok: true,
                name: '@svelte-devtools/vite-plugin',
                version: '0.0.1',
            });
            expect(body.endpoints).toBeInstanceOf(Array);
            expect((body.endpoints as string[]).length).toBeGreaterThan(0);
        });
    });

    // ── Components ──

    describe('components endpoint', () => {
        it('returns components from cached state', async () => {
            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/components');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true, count: 0, components: [] });
            expect(body).toHaveProperty('cachedAt');
        });
    });

    // ── Timeline ──

    describe('timeline endpoint', () => {
        it('returns timeline entries from cached state', async () => {
            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/timeline');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true, count: 0, entries: [] });
            expect(body).toHaveProperty('cachedAt');
        });
    });

    // ── Remote ──

    describe('remote endpoint', () => {
        it('returns remote data from cached state', async () => {
            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/remote');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true });
            expect(body).toHaveProperty('cachedAt');
        });
    });

    // ── Server Events ──

    describe('server-events endpoint', () => {
        it('GET returns events from getServerEvents', async () => {
            const mockEvents = [{ id: 'evt-1', type: 'test', timestamp: 1000, data: {} }];
            vi.mocked(getServerEvents).mockReturnValueOnce(mockEvents);

            const req = createMockReq('/__svelte-devtools/api/server-events', 'GET');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toEqual({ ok: true, events: mockEvents });
            expect(getServerEvents).toHaveBeenCalledOnce();
        });

        it('GET passes last and sinceId query params', async () => {
            const req = createMockReq('/__svelte-devtools/api/server-events?last=5&sinceId=evt-10', 'GET');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(getServerEvents).toHaveBeenCalledWith({ last: 5, sinceId: 'evt-10' });
        });

        it('DELETE calls clearServerEvents and returns ok', async () => {
            const req = createMockReq('/__svelte-devtools/api/server-events', 'DELETE');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(200);
            expect(parseRes(res)).toEqual({ ok: true });
            expect(clearServerEvents).toHaveBeenCalledOnce();
        });

        it('returns 405 for non-GET and non-DELETE methods', async () => {
            const req = createMockReq('/__svelte-devtools/api/server-events', 'PUT');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(405);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ error: 'Method not allowed' });
        });
    });

    // ── Migration ──

    describe('migration endpoint', () => {
        it('returns 100% overall when no registry entries exist', async () => {
            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/migration');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({
                ok: true,
                overall: 100,
                totalFiles: 0,
                perFile: [],
            });
        });

        it('computes average score from registry entries', async () => {
            const registry = new Map<string, { migrationResult: { filename: string; percentage: number } }>();
            registry.set('a', { migrationResult: { filename: 'a.svelte', percentage: 80 } });
            registry.set('b', { migrationResult: { filename: 'b.svelte', percentage: 60 } });
            (globalThis as Record<string, unknown>)['__SVELTE_DEVTOOLS_REGISTRY__'] = registry;

            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/migration');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({
                ok: true,
                overall: 70, // Math.round((80 + 60) / 2)
                totalFiles: 2,
                perFile: [
                    { filename: 'a.svelte', percentage: 80 },
                    { filename: 'b.svelte', percentage: 60 },
                ],
            });
        });

        it('handles entries without migrationResult', async () => {
            const registry = new Map<string, { migrationResult?: unknown }>();
            registry.set('a', { migrationResult: { filename: 'a.svelte', percentage: 90 } });
            registry.set('b', {});
            (globalThis as Record<string, unknown>)['__SVELTE_DEVTOOLS_REGISTRY__'] = registry;

            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/migration');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ overall: 90, totalFiles: 1 });
        });
    });

    // ── Snapshots ──

    describe('snapshots endpoint', () => {
        it('returns snapshot and branch data from cached state', async () => {
            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/snapshots');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true, snapshots: [], branches: [], count: 0 });
            expect(body).toHaveProperty('cachedAt');
        });
    });

    // ── Set State ──

    describe('set-state endpoint', () => {
        it('returns 405 for non-POST methods', async () => {
            const req = createMockReq('/', 'GET');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/set-state');

            expect(res.statusCode).toBe(405);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ error: 'Method not allowed, use POST' });
        });

        it('returns 400 when componentId or key is missing', async () => {
            // Missing key
            const req1 = createMockReq('/', 'POST', JSON.stringify({ componentId: 'c1' }));
            const res1 = createMockRes();
            await handleApiRequest(req1, res1, mockServer, '/set-state');
            expect(res1.statusCode).toBe(400);
            expect(parseRes(res1)).toMatchObject({ error: 'Missing componentId or key' });

            // Missing componentId
            const req2 = createMockReq('/', 'POST', JSON.stringify({ key: 'count' }));
            const res2 = createMockRes();
            await handleApiRequest(req2, res2, mockServer, '/set-state');
            expect(res2.statusCode).toBe(400);
        });

        it('updates component state on POST', async () => {
            // First sync a component with initial state
            const syncBody = {
                components: [{ id: 'comp-1', name: 'Counter', state: { count: 0 } }],
            };
            const syncReq = createMockReq('/', 'POST', JSON.stringify(syncBody));
            const syncRes = createMockRes();
            await handleApiRequest(syncReq, syncRes, mockServer, '/sync');
            expect(syncRes.statusCode).toBe(200);

            // Now set-state to update count
            const setReq = createMockReq('/', 'POST', JSON.stringify({
                componentId: 'comp-1',
                key: 'count',
                value: 42,
            }));
            const setRes = createMockRes();
            await handleApiRequest(setReq, setRes, mockServer, '/set-state');
            expect(setRes.statusCode).toBe(200);
            expect(parseRes(setRes)).toEqual({
                ok: true,
                componentId: 'comp-1',
                key: 'count',
                value: 42,
            });

            // Verify via components endpoint
            const getReq = createMockReq();
            const getRes = createMockRes();
            await handleApiRequest(getReq, getRes, mockServer, '/components');
            const components = (parseRes(getRes) as Record<string, unknown>).components as Array<Record<string, unknown>>;
            expect(components).toHaveLength(1);
            expect(components[0].id).toBe('comp-1');
            expect((components[0].state as Record<string, unknown>).count).toBe(42);
        });
    });

    // ── Source ──

    describe('source endpoint', () => {
        it('returns 400 when ?file= param is missing', async () => {
            const req = createMockReq('/__svelte-devtools/api/source');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(400);
            expect(parseRes(res)).toMatchObject({ error: 'Missing ?file= param' });
        });

        it('reads and returns file content for a valid relative path', async () => {
            (isAbsolute as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
            (resolve as ReturnType<typeof vi.fn>).mockReturnValueOnce('/svelte-dev-extension/src/App.svelte');

            const req = createMockReq('/__svelte-devtools/api/source?file=src/App.svelte');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true, file: '/svelte-dev-extension/src/App.svelte', totalLines: 3 });
            expect(body).toHaveProperty('lines');
            expect((body as { lines: Array<{ line: number; text: string }> }).lines).toHaveLength(3);
        });

        it('returns 403 when file is outside the project', async () => {
            (isAbsolute as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

            const req = createMockReq('/__svelte-devtools/api/source?file=/etc/passwd');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(403);
            expect(parseRes(res)).toMatchObject({ error: 'File outside project' });
        });

        it('returns 404 when file cannot be read', async () => {
            (readFileSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('ENOENT: no such file'); });
            (isAbsolute as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
            (resolve as ReturnType<typeof vi.fn>).mockReturnValueOnce('/svelte-dev-extension/missing.svelte');

            const req = createMockReq('/__svelte-devtools/api/source?file=missing.svelte');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(404);
            expect(parseRes(res)).toMatchObject({ error: 'Cannot read file: ENOENT: no such file' });
        });
    });

    // ── Sync ──

    describe('sync endpoint', () => {
        it('returns 405 for non-POST methods', async () => {
            const req = createMockReq('/', 'PUT');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/sync');

            expect(res.statusCode).toBe(405);
            expect(parseRes(res)).toMatchObject({ error: 'Method not allowed, use POST' });
        });

        it('stores components, timeline, remote, snapshots, and branches', async () => {
            const now = Date.now();
            const payload = {
                components: [{ id: 'c1', name: 'App' }],
                timeline: [{ id: 't1', type: 'mount', timestamp: now }],
                remote: { url: 'http://localhost:5173' },
                snapshots: [{ id: 's1', parentId: null, branchId: 'b1', timestamp: now, label: 'initial' }],
                branches: [{ id: 'b1', name: 'main', snapshotIds: ['s1'], color: '#ff0000' }],
            };

            const syncReq = createMockReq('/', 'POST', JSON.stringify(payload));
            const syncRes = createMockRes();
            await handleApiRequest(syncReq, syncRes, mockServer, '/sync');

            expect(syncRes.statusCode).toBe(200);
            const syncBody = parseRes(syncRes) as Record<string, unknown>;
            expect(syncBody).toMatchObject({ ok: true });
            expect(syncBody).toHaveProperty('cachedAt');

            // Verify components
            const compReq = createMockReq();
            const compRes = createMockRes();
            await handleApiRequest(compReq, compRes, mockServer, '/components');
            const compBody = parseRes(compRes) as Record<string, unknown>;
            expect((compBody.components as Array<unknown>)).toHaveLength(1);
            expect((compBody.components as Array<Record<string, unknown>>)[0].id).toBe('c1');

            // Verify timeline
            const timeReq = createMockReq();
            const timeRes = createMockRes();
            await handleApiRequest(timeReq, timeRes, mockServer, '/timeline');
            const timeBody = parseRes(timeRes) as Record<string, unknown>;
            expect((timeBody.entries as Array<unknown>)).toHaveLength(1);

            // Verify remote
            const remoteReq = createMockReq();
            const remoteRes = createMockRes();
            await handleApiRequest(remoteReq, remoteRes, mockServer, '/remote');
            const remoteBody = parseRes(remoteRes) as Record<string, unknown>;
            expect(remoteBody).toMatchObject({ ok: true, url: 'http://localhost:5173' });

            // Verify snapshots
            const snapReq = createMockReq();
            const snapRes = createMockRes();
            await handleApiRequest(snapReq, snapRes, mockServer, '/snapshots');
            const snapBody = parseRes(snapRes) as Record<string, unknown>;
            expect((snapBody.snapshots as Array<unknown>)).toHaveLength(1);
            expect((snapBody.branches as Array<unknown>)).toHaveLength(1);
        });

        it('partially updates state when only some fields are provided', async () => {
            const payload = { components: [{ id: 'c2', name: 'Partial' }] };

            const syncReq = createMockReq('/', 'POST', JSON.stringify(payload));
            const syncRes = createMockRes();
            await handleApiRequest(syncReq, syncRes, mockServer, '/sync');

            expect(syncRes.statusCode).toBe(200);

            // Components should be updated
            const compReq = createMockReq();
            const compRes = createMockRes();
            await handleApiRequest(compReq, compRes, mockServer, '/components');
            const body = parseRes(compRes) as Record<string, unknown>;
            expect((body.components as Array<unknown>)).toHaveLength(1);
        });
    });

    // ── Routes ──

    describe('routes endpoint', () => {
        it('returns SvelteKit routes when routes directory exists', async () => {
            (existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
            (readdirSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(['+page.svelte', '+layout.svelte', '+page.ts']);
            (statSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => ({
                isDirectory: () => !path.includes('.'),
            }));

            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/routes');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true });
            expect(body.routes).toBeInstanceOf(Array);
        });

        it('returns empty routes array when routes directory is missing', async () => {
            (existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/routes');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toEqual({ ok: true, routes: [] });
        });


    });

    // ── Unknown endpoint ──

    describe('unknown endpoint', () => {
        it('returns 404 for unknown pathname', async () => {
            const req = createMockReq('/__svelte-devtools/api/nonexistent');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/nonexistent');

            expect(res.statusCode).toBe(404);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ error: 'Unknown API endpoint: /nonexistent' });
        });
    });

    // ── Error handling ──

    describe('error handling', () => {
        it('catches errors and returns 500', async () => {
            vi.mocked(getServerEvents).mockImplementationOnce(() => {
                throw new Error('Internal failure');
            });

            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(500);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ error: 'Internal failure' });
        });

        it('handles non-Error thrown values', async () => {
            vi.mocked(getServerEvents).mockImplementationOnce(() => {
                // eslint-disable-next-line @typescript-eslint/no-throw-literal
                throw 'string error';
            });

            const req = createMockReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(500);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ error: 'string error' });
        });
    });
});
