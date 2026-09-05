import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ============================================================================
// Test fixtures
// ============================================================================

const TEST_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const AUTH_HEADER = { authorization: `Bearer ${TEST_TOKEN}` };

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

vi.mock('node:fs', async (importOriginal) => ({
    ...await importOriginal<typeof import('node:fs')>(),
    readFileSync: vi.fn(() => `// line 1\nconst a = 1;\n`) as unknown,
    existsSync: vi.fn(() => true) as unknown,
    readdirSync: vi.fn(() => ['+page.svelte', '+layout.svelte', '+page.ts', 'api', 'about']) as unknown,
    statSync: vi.fn(() => ({ isDirectory: () => false })) as unknown,
    // Canonicalize the way fs.realpathSync does: resolve `..` and `.` segments.
    realpathSync: vi.fn((p: string) => {
        const out: string[] = [];
        for (const part of p.split('/')) {
            if (part === '..') out.pop();
            else if (part !== '' && part !== '.') out.push(part);
        }
        return '/' + out.join('/');
    }) as unknown,
}));

vi.mock('node:path', async (importOriginal) => ({
    ...await importOriginal<typeof import('node:path')>(),
    resolve: vi.fn((...args: string[]) => args.filter(Boolean).join('/').replace(/\/+/g, '/')) as unknown,
    isAbsolute: vi.fn((p: string) => p.startsWith('/')) as unknown,
    join: vi.fn((...args: string[]) => args.filter(Boolean).join('/').replace(/\/+/g, '/')) as unknown,
    relative: vi.fn((_from: string, to: string) => {
        const rel = to.replace(_from, '');
        return rel.startsWith('/') ? rel.slice(1) : rel;
    }) as unknown,
    sep: '/',
}));

// ============================================================================
// Import the module under test (after mocks are set up)
// ============================================================================

import { handleApiRequest } from '../../packages/vite-plugin/src/server-api.js';
import { getServerEvents, clearServerEvents } from '../../packages/vite-plugin/src/server-events.js';
import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { resolve, isAbsolute, join, relative } from 'node:path';
import { resetDevtoolsToken } from '../../packages/vite-plugin/src/token.js';
import { configureHttpGuards } from '../../packages/vite-plugin/src/http-guard.js';
import { COMPONENT_REGISTRY, computeMigrationScores } from '../../packages/vite-plugin/src/registry.js';
import type { ComponentMeta } from '@fsodano/svelte-devtools-types';

// ============================================================================
// Helpers
// ============================================================================

function createMockReq(url = '/', method = 'GET', body?: string, headers: Record<string, string> = {}): IncomingMessage {
    const req = {
        url,
        method,
        headers: { host: 'localhost:5173', ...headers },
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

function authReq(url = '/', method = 'GET', body?: string, headers: Record<string, string> = {}): IncomingMessage {
    return createMockReq(url, method, body, { ...AUTH_HEADER, ...headers });
}

function createMockRes(): ServerResponse & { body: string; statusCode: number; headers: Record<string, string> } {
    const chunks: string[] = [];
    const headers: Record<string, string> = {};
    const res: Record<string, unknown> = {
        statusCode: 200,
        body: '',
        headers,
        setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }),
        getHeader: vi.fn((name: string) => headers[name]),
        end: vi.fn((data: string) => {
            chunks.push(data);
            res.body = chunks.join('');
        }),
        on: vi.fn(),
    };
    return res as unknown as ServerResponse & { body: string; statusCode: number; headers: Record<string, string> };
}

function parseRes(res: ServerResponse & { body: string }): unknown {
    return JSON.parse(res.body);
}

const mockServer = { config: { root: '/svelte-dev-extension' } } as unknown as ViteDevServer;

function seedRegistry(): void {
    COMPONENT_REGISTRY.set('svt-a', {
        id: 'svt-a', name: 'A', filename: 'a.svelte',
        migrationResult: {
            filename: 'a.svelte', maxScore: 10, actualScore: 8, percentage: 80, patterns: [],
        },
    });
    COMPONENT_REGISTRY.set('svt-b', {
        id: 'svt-b', name: 'B', filename: 'b.svelte',
        migrationResult: {
            filename: 'b.svelte', maxScore: 10, actualScore: 6, percentage: 60, patterns: [],
        },
    });
}

// ============================================================================
// Tests
// ============================================================================

describe('handleApiRequest', () => {
    beforeAll(() => {
        vi.stubEnv('SVELTE_DEVTOOLS_TOKEN', TEST_TOKEN);
        vi.stubEnv('SVELTE_DEVTOOLS_ALLOWED_ORIGINS', '');
        vi.stubEnv('SVELTE_DEVTOOLS_ALLOWED_HOSTS', '');
        configureHttpGuards({ allowedOrigins: [], allowedHosts: [] });
    });

    afterAll(() => {
        vi.unstubAllEnvs();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        resetDevtoolsToken();
        COMPONENT_REGISTRY.clear();
    });

    afterEach(() => {
        delete (globalThis as Record<string, unknown>)['__SVELTE_DEVTOOLS_REGISTRY__'];
    });

    it('discovers supported operations and explains cached runtime data', async () => {
        const res = createMockRes();
        await handleApiRequest(authReq('/'), res, mockServer, '/');
        const body = JSON.parse(res.body);
        expect(body.apiVersion).toBe(1);
        expect(body.capabilities.liveStateEditing).toBe(true);
        expect(body.capabilities.runtimeData).toMatchObject({
            requiresOpenPanel: true, transport: 'panel-sync',
        });
        expect(body.operations.setState).toMatchObject({ supported: true, acknowledgement: 'live-panel' });
        expect(body.operations.sync.internal).toBe(true);
        expect(body.operations.source.requiredQuery).toEqual(['file']);
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    // ── Authentication (ADR-0009) ──

    describe('authentication', () => {
        it('rejects an unauthenticated GET with 401 and no data', async () => {
            const req = createMockReq('/__svelte-devtools/api/components');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/components');

            expect(res.statusCode).toBe(401);
            expect(parseRes(res)).toEqual({ error: 'Unauthorized' });
        });

        it('rejects an unauthenticated mutating POST with 401', async () => {
            const req = createMockReq('/__svelte-devtools/api/sync', 'POST', JSON.stringify({ components: [] }));
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/sync');

            expect(res.statusCode).toBe(401);
            expect(parseRes(res)).toEqual({ error: 'Unauthorized' });
        });

        it('rejects a wrong bearer token with 401', async () => {
            const req = createMockReq('/', 'GET', undefined, { authorization: 'Bearer wrong-token' });
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/components');

            expect(res.statusCode).toBe(401);
        });

        it('accepts a valid ?token= query parameter (sendBeacon path)', async () => {
            const req = createMockReq(`/__svelte-devtools/api/sync?token=${TEST_TOKEN}`, 'POST', JSON.stringify({ components: [] }));
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/sync');

            expect(res.statusCode).toBe(200);
            expect(parseRes(res)).toMatchObject({ ok: true });
        });

        it('accepts a valid bearer token', async () => {
            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/components');

            expect(res.statusCode).toBe(200);
        });
    });

    // ── Host validation (ADR-0009) ──

    describe('host validation', () => {
        it('rejects a non-local Host header with 403 before any handler runs', async () => {
            const req = authReq('/__svelte-devtools/api/');
            req.headers.host = 'evil.example.com';
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/');

            expect(res.statusCode).toBe(403);
            expect(parseRes(res)).toEqual({ error: 'Forbidden host' });
        });

        it('accepts localhost and 127.0.0.1 hosts', async () => {
            for (const host of ['localhost:5173', '127.0.0.1:5173', '[::1]:5173', 'localhost']) {
                const req = authReq();
                req.headers.host = host;
                const res = createMockRes();
                await handleApiRequest(req, res, mockServer, '/components');
                expect(res.statusCode).toBe(200);
            }
        });
    });

    // ── CORS (ADR-0009) ──

    describe('CORS', () => {
        it('never emits a wildcard Access-Control-Allow-Origin', async () => {
            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/');

            expect(res.statusCode).toBe(200);
            expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
            expect(res.headers['Vary']).toBe('Origin');
        });

        it('reflects an allow-listed localhost origin', async () => {
            const req = authReq('/', 'GET', undefined, { origin: 'http://localhost:5173' });
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/');

            expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
            expect(res.headers['Vary']).toBe('Origin');
        });

        it('does not reflect a disallowed origin', async () => {
            const req = authReq('/', 'GET', undefined, { origin: 'http://evil.example.com' });
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/');

            expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
        });

        it('reflects an explicitly configured origin', async () => {
            configureHttpGuards({ allowedOrigins: ['http://myapp.local:5173'], allowedHosts: [] });
            try {
                const req = authReq('/', 'GET', undefined, { origin: 'http://myapp.local:5173' });
                const res = createMockRes();
                await handleApiRequest(req, res, mockServer, '/');

                expect(res.headers['Access-Control-Allow-Origin']).toBe('http://myapp.local:5173');
            } finally {
                configureHttpGuards({ allowedOrigins: [], allowedHosts: [] });
            }
        });

        it('answers CORS preflight for an allowed origin without auth', async () => {
            const req = createMockReq('/', 'OPTIONS', undefined, { origin: 'http://localhost:5173' });
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/');

            expect(res.statusCode).toBe(204);
            expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
            expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
            expect(res.headers['Access-Control-Allow-Headers']).toContain('Authorization');
        });
    });

    // ── Status ──

    describe('status endpoint', () => {
        it.each(['/', '/status', ''])('returns ok for pathname "%s"', async (pathname) => {
            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, pathname);

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({
                ok: true,
                name: '@fsodano/vite-plugin-svelte-devtools',
                version: '0.2.2',
            });
            expect(body.endpoints).toBeInstanceOf(Array);
            expect((body.endpoints as string[]).length).toBeGreaterThan(0);
        });
    });

    // ── Components ──

    describe('components endpoint', () => {
        it('returns components from cached state', async () => {
            const req = authReq();
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
            const req = authReq();
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
            const req = authReq();
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

            const req = authReq('/__svelte-devtools/api/server-events', 'GET');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toEqual({ ok: true, events: mockEvents });
            expect(getServerEvents).toHaveBeenCalledOnce();
        });

        it('GET passes last and sinceId query params', async () => {
            const req = authReq('/__svelte-devtools/api/server-events?last=5&sinceId=evt-10', 'GET');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(getServerEvents).toHaveBeenCalledWith({ last: 5, sinceId: 'evt-10' }, expect.any(Object));
        });

        it('DELETE calls clearServerEvents and returns ok', async () => {
            const req = authReq('/__svelte-devtools/api/server-events', 'DELETE');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(200);
            expect(parseRes(res)).toEqual({ ok: true });
            expect(clearServerEvents).toHaveBeenCalledOnce();
        });

        it('returns 405 for non-GET and non-DELETE methods', async () => {
            const req = authReq('/__svelte-devtools/api/server-events', 'PUT');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(405);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ error: 'Method not allowed' });
        });
    });

    // ── Migration (ADR-0010) ──

    describe('migration endpoint', () => {
        it('reports an honest empty registry: overall null, never 100', async () => {
            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/migration');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toEqual({ ok: true, overall: null, totalFiles: 0, perFile: [] });
        });

        it('reflects real entries from the shared component registry', async () => {
            seedRegistry();

            const req = authReq();
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

        it('ignores registry entries without a migrationResult', async () => {
            COMPONENT_REGISTRY.set('svt-c', { id: 'svt-c', name: 'C', filename: 'c.svelte' } as ComponentMeta);

            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/migration');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toEqual({ ok: true, overall: null, totalFiles: 0, perFile: [] });
        });

        it('matches the shared computeMigrationScores helper for the same registry state', async () => {
            seedRegistry();
            const expected = computeMigrationScores();

            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/migration');

            expect(res.statusCode).toBe(200);
            expect(parseRes(res)).toEqual({ ok: true, ...expected });
        });
    });

    // ── Snapshots ──

    describe('snapshots endpoint', () => {
        it('returns snapshot and branch data from cached state', async () => {
            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/snapshots');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true, snapshots: [], branches: [], count: 0 });
            expect(body).toHaveProperty('cachedAt');
        });
    });

    // ── Set State (ADR-0010, Option B) ──

    describe('set-state endpoint', () => {
        it('returns 405 for non-POST methods', async () => {
            const req = authReq('/', 'GET');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/set-state');

            expect(res.statusCode).toBe(405);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ error: 'Method not allowed, use POST' });
        });

        it('returns 400 when componentId or key is missing', async () => {
            // Missing key
            const req1 = authReq('/', 'POST', JSON.stringify({ componentId: 'c1' }));
            const res1 = createMockRes();
            await handleApiRequest(req1, res1, mockServer, '/set-state');
            expect(res1.statusCode).toBe(400);
            expect(parseRes(res1)).toMatchObject({ error: 'Missing sessionId, componentId, key, or value' });

            // Missing componentId
            const req2 = authReq('/', 'POST', JSON.stringify({ key: 'count' }));
            const res2 = createMockRes();
            await handleApiRequest(req2, res2, mockServer, '/set-state');
            expect(res2.statusCode).toBe(400);
        });

        it('rejects an unavailable session and never mutates the sync cache', async () => {
            // Sync a component with initial state
            const syncReq = authReq('/', 'POST', JSON.stringify({
                components: [{ id: 'comp-1', name: 'Counter', state: { count: 0 } }],
            }));
            const syncRes = createMockRes();
            await handleApiRequest(syncReq, syncRes, mockServer, '/sync');
            expect(syncRes.statusCode).toBe(200);

            // Attempt to edit live state
            const setReq = authReq('/', 'POST', JSON.stringify({
                sessionId: 'missing-panel',
                componentId: 'comp-1',
                key: 'count',
                value: 42,
            }));
            const setRes = createMockRes();
            await handleApiRequest(setReq, setRes, mockServer, '/set-state');

            expect(setRes.statusCode).toBe(409);
            expect(parseRes(setRes)).toMatchObject({ ok: false, error: expect.stringContaining('SESSION_UNAVAILABLE') });

            // The cache is untouched: count is still 0
            const getReq = authReq();
            const getRes = createMockRes();
            await handleApiRequest(getReq, getRes, mockServer, '/components');
            const components = (parseRes(getRes) as Record<string, unknown>).components as Array<Record<string, unknown>>;
            expect(components).toHaveLength(1);
            expect((components[0].state as Record<string, unknown>).count).toBe(0);
        });
    });

    // ── Source (ADR-0009 realpath canonicalization) ──

    describe('source endpoint', () => {
        it('returns 400 when ?file= param is missing', async () => {
            const req = authReq('/__svelte-devtools/api/source');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(400);
            expect(parseRes(res)).toMatchObject({ error: 'Missing ?file= param' });
        });

        it('reads and returns file content for a valid relative path inside the root', async () => {
            (isAbsolute as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
            (resolve as ReturnType<typeof vi.fn>).mockReturnValueOnce('/svelte-dev-extension/src/App.svelte');

            const req = authReq('/__svelte-devtools/api/source?file=src/App.svelte');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true, file: '/svelte-dev-extension/src/App.svelte', totalLines: 3 });
            expect(body).toHaveProperty('lines');
            expect((body as { lines: Array<{ line: number; text: string }> }).lines).toHaveLength(3);
        });

        it('returns 403 when file is outside the project root', async () => {
            (isAbsolute as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

            const req = authReq('/__svelte-devtools/api/source?file=/etc/passwd');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(403);
            expect(parseRes(res)).toMatchObject({ error: 'File outside project' });
        });

        it('returns 403 for traversal that would escape to a sibling directory', async () => {
            (isAbsolute as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
            (resolve as ReturnType<typeof vi.fn>).mockReturnValueOnce('/svelte-dev-extension/../svelte-dev-extension-evil/secret.txt');

            const req = authReq('/__svelte-devtools/api/source?file=../svelte-dev-extension-evil/secret.txt');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(403);
            expect(parseRes(res)).toMatchObject({ error: 'File outside project' });
        });

        it('returns 404 when the canonicalized file does not exist', async () => {
            vi.mocked(realpathSync).mockImplementationOnce(() => '/svelte-dev-extension');
            vi.mocked(realpathSync).mockImplementationOnce(() => { throw new Error('ENOENT: no such file'); });
            (isAbsolute as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
            (resolve as ReturnType<typeof vi.fn>).mockReturnValueOnce('/svelte-dev-extension/missing.svelte');

            const req = authReq('/__svelte-devtools/api/source?file=missing.svelte');
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/source');

            expect(res.statusCode).toBe(404);
            expect(parseRes(res)).toMatchObject({ error: 'File does not exist' });
        });
    });

    // ── Sync ──

    describe('sync endpoint', () => {
        it('returns 405 for non-POST methods', async () => {
            const req = authReq('/', 'PUT');
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

            const syncReq = authReq('/', 'POST', JSON.stringify(payload));
            const syncRes = createMockRes();
            await handleApiRequest(syncReq, syncRes, mockServer, '/sync');

            expect(syncRes.statusCode).toBe(200);
            const syncBody = parseRes(syncRes) as Record<string, unknown>;
            expect(syncBody).toMatchObject({ ok: true });
            expect(syncBody).toHaveProperty('cachedAt');

            // Verify components
            const compReq = authReq();
            const compRes = createMockRes();
            await handleApiRequest(compReq, compRes, mockServer, '/components');
            const compBody = parseRes(compRes) as Record<string, unknown>;
            expect((compBody.components as Array<unknown>)).toHaveLength(1);
            expect((compBody.components as Array<Record<string, unknown>>)[0].id).toBe('c1');

            // Verify timeline
            const timeReq = authReq();
            const timeRes = createMockRes();
            await handleApiRequest(timeReq, timeRes, mockServer, '/timeline');
            const timeBody = parseRes(timeRes) as Record<string, unknown>;
            expect((timeBody.entries as Array<unknown>)).toHaveLength(1);

            // Verify remote
            const remoteReq = authReq();
            const remoteRes = createMockRes();
            await handleApiRequest(remoteReq, remoteRes, mockServer, '/remote');
            const remoteBody = parseRes(remoteRes) as Record<string, unknown>;
            expect(remoteBody).toMatchObject({ ok: true, url: 'http://localhost:5173' });

            // Verify snapshots
            const snapReq = authReq();
            const snapRes = createMockRes();
            await handleApiRequest(snapReq, snapRes, mockServer, '/snapshots');
            const snapBody = parseRes(snapRes) as Record<string, unknown>;
            expect((snapBody.snapshots as Array<unknown>)).toHaveLength(1);
            expect((snapBody.branches as Array<unknown>)).toHaveLength(1);
        });

        it('partially updates state when only some fields are provided', async () => {
            const payload = { components: [{ id: 'c2', name: 'Partial' }] };

            const syncReq = authReq('/', 'POST', JSON.stringify(payload));
            const syncRes = createMockRes();
            await handleApiRequest(syncReq, syncRes, mockServer, '/sync');

            expect(syncRes.statusCode).toBe(200);

            // Components should be updated
            const compReq = authReq();
            const compRes = createMockRes();
            await handleApiRequest(compReq, compRes, mockServer, '/components');
            const body = parseRes(compRes) as Record<string, unknown>;
            expect((body.components as Array<unknown>)).toHaveLength(1);
        });
    });

    describe('session-scoped inspection and pagination', () => {
        it('keeps legacy anonymous syncs out of named panel caches and rejects invalid IDs', async () => {
            const sync = async (data: unknown) => {
                const res = createMockRes();
                await handleApiRequest(authReq('/', 'POST', JSON.stringify(data)), res, mockServer, '/sync');
                return res;
            };
            expect((await sync({ sessionId: 'named-panel', components: [{ id: 'owned' }] })).statusCode).toBe(200);
            expect((await sync({ components: [{ id: 'anonymous' }] })).statusCode).toBe(200);
            expect((await sync({ sessionId: '', components: [{ id: 'invalid' }] })).statusCode).toBe(400);
            const res = createMockRes();
            await handleApiRequest(authReq('/?sessionId=named-panel'), res, mockServer, '/components');
            expect(parseRes(res)).toMatchObject({ sessionId: 'named-panel', components: [{ id: 'owned' }] });
            const anonymous = createMockRes();
            await handleApiRequest(authReq('/'), anonymous, mockServer, '/components');
            expect(parseRes(anonymous)).toMatchObject({ sessionId: null, components: [{ id: 'anonymous' }] });
        });
        it('keeps two panel caches separate and returns metadata without large state', async () => {
            for (const [sessionId, value] of [['panel-one', 1], ['panel-two', 2]] as const) {
                const req = authReq('/', 'POST', JSON.stringify({ sessionId,
                    components: Array.from({ length: 1000 }, (_, index) => ({ id: `c${index}`, name: 'Counter', state: { count: value, large: 'x'.repeat(1000) }, props: { value } })),
                }));
                await handleApiRequest(req, createMockRes(), mockServer, '/sync');
            }
            const res = createMockRes();
            await handleApiRequest(authReq('/?sessionId=panel-one&offset=10&limit=2&includeState=false'), res, mockServer, '/components');
            expect(res.statusCode).toBe(200);
            expect(parseRes(res)).toMatchObject({ count: 2, total: 1000, offset: 10, sessionId: 'panel-one', components: [{ id: 'c10' }, { id: 'c11' }] });
            expect(res.body).not.toContain('large');
            expect(res.body).not.toContain('props');
            expect(res.body.length).toBeLessThan(1000);
            const one = createMockRes();
            await handleApiRequest(authReq('/?sessionId=panel-one&id=c0'), one, mockServer, '/components');
            expect((parseRes(one) as any).components[0].state.count).toBe(1);
            const two = createMockRes();
            await handleApiRequest(authReq('/?sessionId=panel-two&id=c0'), two, mockServer, '/components');
            expect((parseRes(two) as any).components[0].state.count).toBe(2);
        });
        it('rejects unknown sessions and invalid pagination', async () => {
            const missing = createMockRes();
            await handleApiRequest(authReq('/?sessionId=never-synced'), missing, mockServer, '/components');
            expect(missing.statusCode).toBe(409);
            const invalid = createMockRes();
            await handleApiRequest(authReq('/?limit=10000'), invalid, mockServer, '/components');
            expect(invalid.statusCode).toBe(400);
        });
    });

    // ── Routes ──

    describe('routes endpoint', () => {
        it('returns SvelteKit routes when routes directory exists', async () => {
            (existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
            (readdirSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(['+page.svelte', '+layout.svelte', '+page.ts'].map(name => ({ name, isFile: () => true, isDirectory: () => false })));
            (statSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => ({
                isDirectory: () => !path.includes('.'),
            }));

            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/routes');

            expect(res.statusCode, res.body).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true });
            expect(body.routes).toBeInstanceOf(Array);
        });

        it('returns empty routes array when routes directory is missing', async () => {
            (existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/routes');

            expect(res.statusCode).toBe(200);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ ok: true, count: 0, routes: [], configurationSource: 'default' });
        });
    });

    // ── Unknown endpoint ──

    describe('unknown endpoint', () => {
        it('returns 404 for unknown pathname', async () => {
            const req = authReq('/__svelte-devtools/api/nonexistent');
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

            const req = authReq();
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

            const req = authReq();
            const res = createMockRes();
            await handleApiRequest(req, res, mockServer, '/server-events');

            expect(res.statusCode).toBe(500);
            const body = parseRes(res) as Record<string, unknown>;
            expect(body).toMatchObject({ error: 'string error' });
        });
    });
});
