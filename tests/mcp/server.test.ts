import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDevtoolsMcpServer, MAX_HTTP_RESPONSE_BYTES, MAX_TOOL_OUTPUT_BYTES } from '../../packages/mcp/src/index.js';

const clients: Client[] = [];
const servers: ReturnType<typeof createDevtoolsMcpServer>[] = [];
async function connect(options: { timeoutMs?: number } = {}) {
  const server = createDevtoolsMcpServer({ url: 'http://localhost:5173', token: 'test-secret', ...options });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  servers.push(server); clients.push(client);
  return client;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map(c => c.close()));
  await Promise.all(servers.splice(0).map(s => s.close()));
  vi.unstubAllGlobals();
});

describe('DevTools MCP', () => {
  it.each(['another-panel', undefined])('rejects unverified session targeting (%s)', async sessionId => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, sessionId, cachedAt: Date.now(), components: [] })));
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_components', arguments: { sessionId: 'requested-panel' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('SESSION_MISMATCH');
  });
  it('sends a session-targeted mutation and returns its live acknowledgement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, value: 42, recording: true }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await connect();
    const command = { sessionId: 'panel-a', componentId: 'counter:1', key: 'count', value: 42 };
    const result = await client.callTool({ name: 'svelte_set_state', arguments: command });
    expect(result.structuredContent).toEqual({ ok: true, value: 42, recording: true });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(command) });
  });

  it('reports an uncertain mutation outcome without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: false, error: 'OUTCOME_UNKNOWN: inspect before retrying' }, { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_set_state', arguments: { sessionId: 'panel-a', componentId: 'counter:1', key: 'count', value: 42 } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('OUTCOME_UNKNOWN');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('discovers eight inspection tools and acknowledged state mutation', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    expect(tools.filter(t => t.annotations?.readOnlyHint)).toHaveLength(8);
    expect(tools.find(t => t.name === 'svelte_set_state')?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
  });

  it('filters and paginates fresh runtime data with bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, cachedAt: Date.now(), components: [
      { id: 'a', name: 'Counter', state: { count: 2 } }, { id: 'b', name: 'Counter' }, { id: 'c', name: 'App' },
    ] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_components', arguments: { name: 'counter', offset: 1, limit: 1 } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ total: 2, offset: 1, components: [{ id: 'b' }] });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer test-secret' }, redirect: 'error' });
  });

  it.each([0, Date.now() - 60_000])('rejects missing or stale runtime data (%s)', async cachedAt => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, cachedAt, components: [] })));
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_components', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(cachedAt === 0 ? 'NO_RUNTIME_DATA' : 'STALE_RUNTIME_DATA');
  });

  it('reports an actionable auth failure without exposing the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_status', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('UNAUTHORIZED');
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });

  it('returns bounded source lines and encodes the filename as a query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, totalLines: 3, lines: [1, 2, 3] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_source', arguments: { file: 'a&b.svelte', startLine: 2, lineCount: 1 } });
    expect(result.structuredContent).toMatchObject({ lines: [2], totalLines: 3, startLine: 2 });
    expect(fetchMock.mock.calls[0][0].searchParams.get('file')).toBe('a&b.svelte');
  });

  it('validates tool arguments before sending HTTP requests', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_components', arguments: { limit: -1 } });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['file:///tmp/test', 'http://user:password@localhost:5173', 'http://localhost:5173/?token=secret'])('rejects invalid origins: %s', url => {
    expect(() => createDevtoolsMcpServer({ url, token: 'test' })).toThrow();
  });
});

describe('MCP bounded transport and output', () => {
  it('rejects oversized streaming HTTP bodies and cancels the reader before JSON parsing', async () => {
    const cancelled = vi.fn();
    let chunks = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { chunks++; controller.enqueue(new Uint8Array(1024 * 1024).fill(32)); },
      cancel: cancelled,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_components', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('HTTP_RESPONSE_TOO_LARGE');
    expect(JSON.stringify(result.content)).toContain('includeState=false');
    expect(cancelled).toHaveBeenCalledOnce();
    expect(chunks).toBeLessThanOrEqual(MAX_HTTP_RESPONSE_BYTES / (1024 * 1024) + 2);
  });

  it('cancels an HTTP body that never produces data when the request deadline expires', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ cancel }))));
    const client = await connect({ timeoutMs: 25 });
    const result = await client.callTool({ name: 'svelte_status', arguments: {} });
    expect(result.isError).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects oversized declared Content-Length without reading the body', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { 'content-length': String(MAX_HTTP_RESPONSE_BYTES + 1) } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_status', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('HTTP_RESPONSE_TOO_LARGE');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('caps combined text and structured output for a single huge state value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, cachedAt: Date.now(), components: [{ id: 'one', name: 'Large', state: { value: 'x'.repeat(MAX_TOOL_OUTPUT_BYTES / 2) } }] })));
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_components', arguments: { id: 'one' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('RESULT_TOO_LARGE');
    expect(result.structuredContent).toBeUndefined();
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(MAX_TOOL_OUTPUT_BYTES);
  });

  it('forwards session, filters, and pagination without paginating the server page twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, cachedAt: Date.now(), sessionId: 'panel-b', total: 1000, offset: 200, count: 1, components: [{ id: 'card:201', name: 'Card' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await connect();
    const result = await client.callTool({ name: 'svelte_components', arguments: { sessionId: 'panel-b', name: 'Card', offset: 200, limit: 1, includeState: false } });
    expect(result.structuredContent).toMatchObject({ sessionId: 'panel-b', total: 1000, offset: 200, components: [{ id: 'card:201' }] });
    expect(Object.fromEntries(fetchMock.mock.calls[0][0].searchParams)).toMatchObject({ sessionId: 'panel-b', name: 'Card', offset: '200', limit: '1', includeState: 'false' });
  });

  it.each(['svelte_timeline', 'svelte_snapshots'])('preserves server pagination and session for %s', async name => {
    const key = name === 'svelte_timeline' ? 'entries' : 'snapshots';
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, cachedAt: Date.now(), sessionId: 'panel-b', total: 1000, offset: 10, [key]: [{ id: 'event:11' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await connect();
    const result = await client.callTool({ name, arguments: { sessionId: 'panel-b', offset: 10, limit: 1 } });
    expect(result.structuredContent).toMatchObject({ total: 1000, offset: 10, [key]: [{ id: 'event:11' }] });
    expect(Object.fromEntries(fetchMock.mock.calls[0][0].searchParams)).toMatchObject({ sessionId: 'panel-b', offset: '10', limit: '1' });
  });

  it('discovers a bounded metadata page from 1000 components with large state', async () => {
    const components = Array.from({ length: 1000 }, (_, index) => ({ id: `card:${index}`, name: 'Card', filename: '/src/Card.svelte', state: { body: 'x'.repeat(64 * 1024) }, props: { item: index } }));
    let httpBytes = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      const page = components.slice(Number(url.searchParams.get('offset')), Number(url.searchParams.get('offset')) + Number(url.searchParams.get('limit')));
      const metadata = url.searchParams.get('includeState') === 'false' ? page.map(({ id, name, filename }) => ({ id, name, filename })) : page;
      const body = JSON.stringify({ ok: true, cachedAt: Date.now(), total: components.length, offset: 100, components: metadata });
      httpBytes = new TextEncoder().encode(body).byteLength;
      return new Response(body, { headers: { 'content-type': 'application/json' } });
    }));
    const client = await connect();
    const started = performance.now();
    const result = await client.callTool({ name: 'svelte_components', arguments: { includeState: false, offset: 100, limit: 100 } });
    const elapsedMs = performance.now() - started;
    const outputBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    expect(result.isError).not.toBe(true);
    expect((result.structuredContent as any).components).toHaveLength(100);
    expect((result.structuredContent as any).total).toBe(1000);
    expect((result.structuredContent as any).components[0]).not.toHaveProperty('state');
    expect(httpBytes).toBeLessThan(10_000);
    expect(outputBytes).toBeLessThan(20_000);
    console.info(`MCP metadata benchmark: 1000 components, 64KiB state each; page100 HTTP=${httpBytes}B output=${outputBytes}B elapsed=${elapsedMs.toFixed(2)}ms (in-memory mocked paginated API).`);
  });
});
