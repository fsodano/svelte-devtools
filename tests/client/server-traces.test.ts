import { describe, expect, it, vi } from 'vitest';
import { serverEntries, traceRows, startServerTracePoll, formatTraceDuration } from '../../packages/client/src/lib/server-traces.js';
import { NetworkHistory } from '../../packages/client/src/lib/network-history.js';

describe('production server trace adapter', () => {
  it('reads canonical envelopes, HTTP previews and opt-in SQL fields without inventing captured data', () => {
    const rows = serverEntries({ ok: true, events: [
      { id: 'http', type: 'server:ssr', timestamp: 100, duration: 20, data: { traceId: 't', spanId: 'p', reqHeaders: { accept: 'text/html' }, responsePreview: 'partial', responseBodyTruncated: true } },
      { id: 'sql', type: 'server:sql', timestamp: 105, duration: 2, data: { traceId: 't', spanId: 'q', parentSpanId: 'p', operation: 'all', rowCount: 0, status: 'error', error: 'SQLITE_ERROR' } },
    ] });
    expect(rows[0].requestHeaders).toEqual({ accept: 'text/html' });
    expect(rows[0].responseBody).toBe('partial');
    expect(rows[0].responseBodyTruncated).toBe(true);
    expect(rows[1].statement).toBeUndefined();
    expect(rows[1].rowCount).toBe(0);
    expect(rows[1].error?.code).toBe('SQLITE_ERROR');
    const waterfall = traceRows(rows, rows[1]);
    expect(waterfall.map(row => [row.entry.id, row.depth, row.offset, row.width])).toEqual([['http', 0, 0, 100], ['sql', 1, 5, 10]]);
  });

  it('never correlates concurrent requests by URL and reports an evicted parent', () => {
    const rows = serverEntries({ events: [
      { id: 'a', type: 'server:ssr', timestamp: 100, duration: 5, data: { url: '/same', traceId: 'first', spanId: 'root' } },
      { id: 'b', type: 'server:sql', timestamp: 101, duration: 0, data: { url: '/same', traceId: 'second', parentSpanId: 'missing' } },
    ] });
    const waterfall = traceRows(rows, rows[1]);
    expect(waterfall).toHaveLength(1);
    expect(waterfall[0].missingParent).toBe(true);
    expect(Number.isFinite(waterfall[0].width)).toBe(true);
  });

  it('handles malformed response shape explicitly and bounds the server buffer to 1000', () => {
    expect(() => serverEntries([])).toThrow('Unexpected server trace response');
    const events = Array.from({ length: 1500 }, (_, index) => ({ id: String(index), type: 'server:sql', timestamp: index, data: {} }));
    const rows = serverEntries({ events });
    expect(rows).toHaveLength(1000);
    expect(rows[0].id).toBe('500');
    const history = new NetworkHistory(500, 1000);
    history.ingest('server', rows);
    expect(history.entries).toHaveLength(500);
    history.clear();
    history.ingest('server', rows);
    expect(history.entries).toEqual([]);
    expect(history.dismissedCount).toBe(1000);
    history.ingest('server', []);
    expect(history.dismissedCount).toBe(0);
  });

  it('does not loop on malformed parent cycles', () => {
    const rows = serverEntries({ events: [
      { id: 'a', type: 'server:sql', timestamp: 0, data: { traceId: 't', spanId: 'a', parentSpanId: 'b' } },
      { id: 'b', type: 'server:sql', timestamp: 0, data: { traceId: 't', spanId: 'b', parentSpanId: 'a' } },
    ] });
    expect(traceRows(rows, rows[0])).toHaveLength(2);
  });
});


describe('production server polling lifecycle', () => {
  it('uses the canonical endpoint, prevents overlap and ignores late responses after disposal', async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (response: Response) => void;
      const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(done => { resolve = done; }));
      const receive = vi.fn(); const errors = vi.fn();
      const stop = startServerTracePoll(fetcher, receive, errors);
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe('/__svelte-devtools/api/server-events');
      const signal = fetcher.mock.calls[0][1].signal!;
      stop();
      expect(signal.aborted).toBe(true);
      resolve(new Response(JSON.stringify({ events: [] })));
      await vi.advanceTimersByTimeAsync(5000);
      expect(receive).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('reports failed responses and recovers on the next poll', async () => {
    vi.useFakeTimers();
    let stop = () => {};
    try {
      const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }))
        .mockResolvedValue(new Response(JSON.stringify({ events: [] })));
      const receive = vi.fn(); const errors = vi.fn();
      stop = startServerTracePoll(fetcher, receive, errors);
      await vi.advanceTimersByTimeAsync(0);
      expect(errors).toHaveBeenCalledWith('Server traces unavailable (HTTP 401)');
      await vi.advanceTimersByTimeAsync(1000);
      expect(receive).toHaveBeenCalledWith([]);
      expect(errors).toHaveBeenLastCalledWith('');
    } finally { stop(); vi.useRealTimers(); }
  });
});


it('formats sub-millisecond SQL durations without treating zero as missing', () => {
  expect(formatTraceDuration(0.023, 'server:sql')).toBe('0.023 ms');
  expect(formatTraceDuration(0.0001, 'server:sql')).toBe('<0.001 ms');
  expect(formatTraceDuration(0, 'server:sql')).toBe('0.0 ms');
  expect(formatTraceDuration(1, 'server:sql')).toBe('1.0 ms');
  expect(formatTraceDuration(12.34, 'server:ssr')).toBe('12.3 ms');
});


it.each([100, 99])('places a later-arriving parent before its child when parent starts at %i', parentStart => {
  const rows = serverEntries({ events: [
    { id: 'child', type: 'server:sql', timestamp: 100, data: { traceId: 't', spanId: 'child', parentSpanId: 'parent' } },
    { id: 'parent', type: 'server:ssr', timestamp: parentStart, data: { traceId: 't', spanId: 'parent' } },
    { id: 'sibling', type: 'server:sql', timestamp: 100, data: { traceId: 't', spanId: 'sibling', parentSpanId: 'parent' } },
    { id: 'later', type: 'server:request', timestamp: 101, data: { traceId: 't', spanId: 'later' } },
  ] });
  expect(traceRows(rows, rows[0]).map(row => row.entry.id)).toEqual(['parent', 'child', 'sibling', 'later']);
});
