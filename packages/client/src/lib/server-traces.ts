export interface NetworkEntry {
  id: string; type: string; timestamp: number; duration?: number;
  url?: string; method?: string; statusCode?: number; routeId?: string;
  mockResponse?: boolean; mockRuleId?: string; mockRulePattern?: string;
  contentType?: string; responseSize?: number;
  error?: { message?: string; stack?: string; code?: string };
  requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string>;
  requestBody?: string; responseBody?: string; responseBodyTruncated?: boolean;
  requestBodyTruncated?: boolean;
  traceId?: string; spanId?: string; parentSpanId?: string;
  database?: string; operation?: string; statement?: string; statementTruncated?: boolean;
  rowCount?: number; status?: string;
}
export function serverEntries(payload: unknown): NetworkEntry[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { events?: unknown }).events)) {
    throw new Error('Unexpected server trace response');
  }
  return (payload as { events: Array<{ id: string; type: string; timestamp: number; duration?: number; data?: Record<string, unknown> }> }).events.slice(-1000).map(event => {
    const data = event.data ?? {};
    return { ...data, id: event.id, type: event.type, timestamp: event.timestamp, duration: event.duration,
      error: typeof data.error === 'string' ? { code: data.error } : data.error,
      requestHeaders: data.reqHeaders ?? data.requestHeaders,
      responseHeaders: data.resHeaders ?? data.responseHeaders,
      responseBody: data.responsePreview ?? data.responseBody,
    } as NetworkEntry;
  });
}
export function traceRows(entries: NetworkEntry[], selected: NetworkEntry) {
  const peers = selected.traceId ? entries.filter(entry => entry.traceId === selected.traceId) : [selected];
  if (!peers.some(entry => entry.id === selected.id)) peers.push(selected);
  const start = Math.min(...peers.map(entry => entry.timestamp));
  const end = Math.max(...peers.map(entry => entry.timestamp + Math.max(0, entry.duration ?? 0)));
  const total = Math.max(1, end - start);
  const bySpan = new Map(peers.filter(entry => entry.spanId).map(entry => [entry.spanId!, entry]));
  return peers.sort((a, b) => a.timestamp - b.timestamp).map(entry => {
    let parent = entry.parentSpanId; let depth = 0;
    const seen = new Set<string>();
    while (parent && bySpan.has(parent) && !seen.has(parent)) {
      seen.add(parent); depth++; parent = bySpan.get(parent)?.parentSpanId;
    }
    return { entry, depth: Math.min(depth, 8), offset: Math.max(0, entry.timestamp - start),
      left: Math.max(0, (entry.timestamp - start) / total * 100),
      width: Math.min(100, Math.max(0.5, (entry.duration ?? 0) / total * 100)),
      missingParent: !!entry.parentSpanId && !bySpan.has(entry.parentSpanId) };
  });
}

/** Poll one canonical bounded buffer at a time; disposal prevents stale UI updates. */
export function startServerTracePoll(
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  receive: (entries: NetworkEntry[]) => void,
  reportError: (message: string) => void,
): () => void {
  let disposed = false;
  let pending: AbortController | null = null;
  async function poll() {
    if (pending || disposed) return;
    pending = new AbortController();
    try {
      const response = await fetcher('/__svelte-devtools/api/server-events', { signal: pending.signal });
      if (!response.ok) throw new Error(`Server traces unavailable (HTTP ${response.status})`);
      const entries = serverEntries(await response.json());
      if (!disposed) { receive(entries); reportError(''); }
    } catch (error) {
      if (!disposed) reportError(error instanceof Error ? error.message : 'Server traces unavailable');
    } finally { pending = null; }
  }
  void poll();
  const timer = setInterval(() => void poll(), 1000);
  return () => { disposed = true; pending?.abort(); clearInterval(timer); };
}

/** Preserve useful precision for synchronous queries, including valid zero durations. */
export function formatTraceDuration(duration: number, type: string): string {
  if (type === 'server:sql' && duration > 0 && duration < 0.001) return '<0.001 ms';
  return `${duration.toFixed(type === 'server:sql' && duration > 0 && duration < 1 ? 3 : 1)} ms`;
}
