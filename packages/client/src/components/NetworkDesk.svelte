<script lang="ts">
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';

  interface NetworkEntry {
    id: string;
    type: string;
    url?: string;
    method?: string;
    statusCode?: number;
    duration?: number;
    timestamp: number;
    routeId?: string;
    mockResponse?: boolean;
    mockRuleId?: string;
    mockRulePattern?: string;
    contentType?: string;
    responseSize?: number;
    error?: { message: string; stack?: string };
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: string;
    responseBody?: string;
  }

  interface MockRule {
    id: string; pattern: string; method: string;
    statusCode: number; body: string; enabled: boolean;
  }

  let entries = $state<NetworkEntry[]>([]);
  let mockRules = $state<MockRule[]>([]);
  let filter = $state<string>('all');
  let selectedEntry = $state<NetworkEntry | null>(null);
  let showRuleEditor = $state(false);
  let requestFilter = $state('');

  // New rule form
  let newPattern = $state('');
  let newMethod = $state('GET');
  let newStatusCode = $state(200);
  let newBody = $state('');

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const filters = [
    { id: 'all', label: 'All' }, { id: 'server:ssr', label: 'SSR' },
    { id: 'server:error', label: 'Errors' }, { id: 'client:request', label: 'Client' },
    { id: 'mock', label: 'Mocked' }
  ];

  // Poll server events
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    fetchServerEvents();
    pollTimer = setInterval(fetchServerEvents, 1000);
    // Sync any existing mock rules to the runtime on mount
    syncMockRules();
    return () => { if (pollTimer) clearInterval(pollTimer); };
  });

  async function fetchServerEvents() {
    try {
      const res = await fetch('/__svelte-devtools/server-events?last=50');
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.events) return;
      const existingIds = new Set(entries.map(e => e.id));
      const newEntries: NetworkEntry[] = (data.events as { id: string; type: string; timestamp: number; duration?: number; data?: Record<string, unknown> }[])
        .filter(e => !existingIds.has(e.id))
        .map(e => ({
          id: e.id, type: e.type, url: e.data?.url as string | undefined, method: e.data?.method as string | undefined,
          statusCode: e.data?.statusCode as number | undefined, duration: e.duration,
          timestamp: e.timestamp, routeId: e.data?.routeId as string | undefined,
          contentType: e.data?.contentType as string | undefined,
          responseSize: e.data?.responseSize as number | undefined,
          error: e.data?.error as { message: string; stack?: string } | undefined,
          requestBody: e.data?.requestBody as string | undefined,
          responseBody: e.data?.responsePreview as string | undefined,
          requestHeaders: e.data?.reqHeaders as Record<string, string> | undefined,
          responseHeaders: e.data?.resHeaders as Record<string, string> | undefined,
        }));
      if (newEntries.length > 0) {
        entries = [...entries, ...newEntries].slice(-500);
      }
    } catch {}
  }

  // Listen for client-side requests from the store
  $effect(() => {
    const tl = devtoolsStore.timeline;
    const clientReqs = tl.filter(e => (e.type as string) === 'client:request').slice(-50);
    for (const req of clientReqs) {
      const data = req.data as Record<string, unknown> || {};
      if (!entries.find(e => e.id === req.id)) {
        entries = [...entries, {
          id: req.id, type: req.type, url: data.url as string,
          method: data.method as string, statusCode: data.statusCode as number,
          duration: req.duration, timestamp: req.timestamp,
          requestHeaders: data.requestHeaders as Record<string, string> | undefined,
          responseHeaders: data.responseHeaders as Record<string, string> | undefined,
          requestBody: data.requestBody as string | undefined,
          responseBody: (data.responsePreview as string)?.slice(0, 500),
          contentType: data.contentType as string | undefined,
          responseSize: data.responseSize as number | undefined,
          mockResponse: data.mockResponse as boolean | undefined,
          mockRuleId: data.mockRuleId as string | undefined,
          mockRulePattern: data.mockRulePattern as string | undefined,
        }];
      }
    }
  });

  const filtered = $derived(
    filter === 'all' ? entries
    : filter === 'server:ssr' ? entries.filter(e => e.type === 'server:ssr' || e.type === 'server:request')
    : filter === 'server:error' ? entries.filter(e => e.type === 'server:error')
    : filter === 'client:request' ? entries.filter(e => (e.type as string) === 'client:request')
    : filter === 'mock' ? entries.filter(e => e.mockResponse)
    : entries
  );

  const searched = $derived(
    requestFilter ? filtered.filter(e =>
      e.url?.toLowerCase().includes(requestFilter.toLowerCase()) ||
      e.method?.toLowerCase().includes(requestFilter.toLowerCase()) ||
      e.routeId?.toLowerCase().includes(requestFilter.toLowerCase())
    ) : filtered
  );

  function getMethodColor(m: string): string {
    const colors: Record<string, string> = {
      GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b',
      PATCH: '#8b5cf6', DELETE: '#ef4444', HEAD: '#6b7280', OPTIONS: '#6b7280',
    };
    return colors[m] || '#6b7280';
  }

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'server:ssr': case 'server:request': return '🖥️';
      case 'server:error': return '❌';
      case 'client:request': return '🌐';
      default: return '•';
    }
  }

  function syncMockRules(): void {
    try {
      window.parent.postMessage({ type: 'svelte-devtools-set-mock-rules', rules: mockRules }, '*');
    } catch {}
  }

  function addRule() {
    if (!newPattern.trim()) return;
    mockRules = [...mockRules, {
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      pattern: newPattern, method: newMethod,
      statusCode: newStatusCode, body: newBody, enabled: true,
    }];
    newPattern = ''; newMethod = 'GET'; newStatusCode = 200; newBody = '';
    syncMockRules();
  }

  function toggleRule(id: string) {
    mockRules = mockRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    syncMockRules();
  }

  function deleteRule(id: string) {
    mockRules = mockRules.filter(r => r.id !== id);
    syncMockRules();
  }

  function clearEntries() { entries = []; selectedEntry = null; }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
</script>

<div class="network-panel">
  <div class="network-header">
    <div class="header-left">
      <span class="panel-title">Network</span>
      <div class="header-tabs">
        <button class="header-tab" class:active={!showRuleEditor} onclick={() => showRuleEditor = false}>Requests</button>
        <button class="header-tab" class:active={showRuleEditor} onclick={() => showRuleEditor = true}>Mock Rules</button>
      </div>
    </div>
    <button class="clear-btn" onclick={clearEntries} disabled={entries.length === 0}>Clear</button>
  </div>

  {#if !showRuleEditor}
    <div class="split">
      <div class="list">
        <div class="toolbar">
          <input type="text" bind:value={requestFilter} placeholder="Filter by URL, method, route..." class="search-input" />
          <div class="filters">
            {#each filters as f (f.id)}
              <button class="filter-btn" class:active={filter === f.id} onclick={() => filter = f.id}>{f.label}</button>
            {/each}
          </div>
        </div>
        <div class="entries-list">
          {#if searched.length === 0}
            <div class="empty-state">
              <span>No network requests yet</span>
              {#if filter === 'server:ssr' || filter === 'all'}
                <span class="empty-hint">Navigate to a SvelteKit page or make API calls to see requests here</span>
              {:else if filter === 'client:request'}
                <span class="empty-hint">Client-side fetch calls will appear here</span>
              {:else}
                <span class="empty-hint">No entries match the current filter</span>
              {/if}
            </div>
          {:else}
            {#each [...searched].reverse() as entry (entry.id)}
              <button class="entry-row" class:selected={selectedEntry?.id === entry.id} onclick={() => selectedEntry = entry}>
                {#if entry.mockResponse}
                  <span class="mock-badge">M</span>
                {/if}
                <span class="type-icon">{getTypeIcon(entry.type)}</span>
                {#if entry.method}
                  <span class="method-badge" style="background: {getMethodColor(entry.method)}">{entry.method}</span>
                {:else}
                  <span class="method-badge" style="background:#6b7280">{entry.type.includes('error') ? 'ERR' : 'SSR'}</span>
                {/if}
                <span class="status-code" class:error={entry.statusCode && entry.statusCode >= 400}>
                  {entry.statusCode || '...'}
                </span>
                <span class="request-url" title={entry.url}>{entry.url ? entry.url.slice(0, 60) : entry.routeId || entry.type}</span>
                <span class="entry-time">{formatTime(entry.timestamp)}</span>
                {#if entry.duration}
                  <span class="duration">{entry.duration.toFixed(1)}ms</span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      </div>

      <div class="detail-scroll">
        {#if selectedEntry}
          <div class="detail">
            <div class="detail-header">
              <span class="detail-title">{selectedEntry.type}</span>
              <button class="detail-close" onclick={() => selectedEntry = null}>✕</button>
            </div>
            {#if selectedEntry.url}
              <div class="detail-row"><span class="label">URL</span><span class="value mono">{selectedEntry.url}</span></div>
            {/if}
            {#if selectedEntry.mockResponse}
              <div class="detail-row"><span class="label">Mocked</span><span class="value mock-badge-inline">Rule: {selectedEntry.mockRulePattern || selectedEntry.mockRuleId || 'yes'}</span></div>
            {/if}
            <div class="detail-row"><span class="label">Method</span><span class="value method-badge" style="background:{selectedEntry.method ? getMethodColor(selectedEntry.method) : '#6b7280'}">{selectedEntry.method || '—'}</span></div>
            <div class="detail-row"><span class="label">Status</span><span class="value status-badge" class:error={selectedEntry.statusCode ? selectedEntry.statusCode >= 400 : false}>{selectedEntry.statusCode || '—'}</span></div>
            {#if selectedEntry.routeId !== undefined}
              <div class="detail-row"><span class="label">Route</span><span class="value mono">{selectedEntry.routeId || '(root)'}</span></div>
            {/if}
            <div class="detail-row"><span class="label">Time</span><span class="value">{new Date(selectedEntry.timestamp).toLocaleString()}</span></div>
            {#if selectedEntry.duration}
              <div class="detail-row"><span class="label">Duration</span><span class="value">{selectedEntry.duration.toFixed(1)}ms</span></div>
            {/if}
            {#if selectedEntry.contentType}
              <div class="detail-row"><span class="label">Type</span><span class="value">{selectedEntry.contentType}</span></div>
            {/if}
            {#if selectedEntry.responseSize != null}
              <div class="detail-row"><span class="label">Size</span><span class="value">{selectedEntry.responseSize} bytes</span></div>
            {/if}

            {#if selectedEntry.requestBody}
              <div class="section-label">Request Body</div>
              <pre class="code-block">{selectedEntry.requestBody}</pre>
            {/if}

            {#if selectedEntry.responseBody}
              <div class="section-label">Response Body</div>
              <pre class="code-block">{selectedEntry.responseBody}</pre>
            {/if}

            {#if selectedEntry.requestHeaders}
              <div class="section-label">Request Headers</div>
              <div class="headers-block">
                {#each Object.entries(selectedEntry.requestHeaders).filter(([_, v]) => v) as [key, val]}
                  <div class="header-row"><span class="h-key">{key}</span><span class="h-val">{val}</span></div>
                {/each}
              </div>
            {/if}

            {#if selectedEntry.responseHeaders}
              <div class="section-label">Response Headers</div>
              <div class="headers-block">
                {#each Object.entries(selectedEntry.responseHeaders).filter(([_, v]) => v) as [key, val]}
                  <div class="header-row"><span class="h-key">{key}</span><span class="h-val">{val}</span></div>
                {/each}
              </div>
            {/if}

            {#if selectedEntry.error}
              <div class="detail-row"><span class="label">Error</span><span class="value error-text">{selectedEntry.error.message}</span></div>
              {#if selectedEntry.error.stack}
                <pre class="code-block stack">{selectedEntry.error.stack}</pre>
              {/if}
            {/if}
          </div>
        {:else}
          <div class="detail-empty">Select a request to inspect details.</div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="rule-editor">
      <div class="rule-form">
        <h3 class="rule-form-title">New Mock Rule</h3>
        <input type="text" bind:value={newPattern} placeholder="URL regex pattern (e.g. /api/.*)" class="rule-input" />
        <div class="rule-form-row">
          <select bind:value={newMethod}>
            {#each methods as m}<option value={m}>{m}</option>{/each}
          </select>
          <input type="number" bind:value={newStatusCode} placeholder="Status" min="100" max="599" class="rule-input-narrow" />
        </div>
        <textarea bind:value={newBody} placeholder="Response body (JSON)" class="rule-body" rows="3"></textarea>
        <button class="add-rule-btn" onclick={addRule} disabled={!newPattern.trim()}>Add Rule</button>
      </div>
      <div class="rules-list">
        {#if mockRules.length === 0}
          <div class="empty-state"><span>No mock rules defined</span></div>
        {:else}
          {#each mockRules as rule (rule.id)}
            <div class="rule-card" class:disabled={!rule.enabled}>
              <div class="rule-info">
                <span class="rule-method">{rule.method}</span>
                <span class="rule-pattern">{rule.pattern}</span>
                <span class="rule-status">→ {rule.statusCode}</span>
              </div>
              <div class="rule-actions">
                <button class="icon-btn" onclick={() => toggleRule(rule.id)} title={rule.enabled ? 'Disable' : 'Enable'}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    {#if rule.enabled}
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    {:else}
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M2 2l20 20"/>
                    {/if}
                  </svg>
                </button>
                <button class="icon-btn danger" onclick={() => deleteRule(rule.id)} title="Delete">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
              {#if rule.body}
                <pre class="rule-body-preview">{rule.body.substring(0, 100)}</pre>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .network-panel { display: flex; flex-direction: column; height: 100%; }
  .network-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); flex-shrink: 0; }
  .header-left { display: flex; align-items: center; gap: var(--space-3); }
  .panel-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .header-tabs { display: flex; gap: var(--space-1); }
  .header-tab { padding: var(--space-1) var(--space-2); border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 11px; border-radius: var(--radius-sm); }
  .header-tab.active { background: var(--bg-hover); color: var(--text-primary); }
  .clear-btn { padding: var(--space-1) var(--space-2); border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); font-size: 11px; border-radius: var(--radius-sm); cursor: pointer; }
  .clear-btn:disabled { opacity: 0.4; cursor: default; }
  .toolbar { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); }
  .search-input { width: 100%; padding: var(--space-1) var(--space-2); font-size: 11px; background: var(--bg-inset); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--radius-sm); box-sizing: border-box; }
  .filters { display: flex; gap: var(--space-1); }
  .filter-btn { padding: 2px var(--space-2); border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px; border-radius: var(--radius-sm); }
  .filter-btn.active { background: var(--bg-hover); color: var(--text-primary); }
  .split { display: flex; flex: 1; min-height: 0; }
  .list { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .entries-list { flex: 1; overflow-y: auto; min-height: 0; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); height: 150px; color: var(--text-muted); font-size: 12px; padding: var(--space-3); text-align: center; }
  .empty-hint { font-size: 10px; opacity: 0.7; }
  .entry-row { display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-1) var(--space-3); border: none; background: transparent; color: var(--text-primary); font-size: 11px; cursor: pointer; text-align: left; border-bottom: 1px solid var(--border-subtle); }
  .entry-row:hover { background: var(--bg-hover); }
  .entry-row.selected { background: var(--svelte-brand-10); }
  .mock-badge { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 3px; background: var(--warning); color: #fff; font-size: 8px; font-weight: 700; flex-shrink: 0; }
  .type-icon { width: 16px; text-align: center; flex-shrink: 0; }
  .method-badge { display: inline-block; padding: 1px 5px; border-radius: 3px; color: white; font-size: 9px; font-weight: 700; flex-shrink: 0; min-width: 32px; text-align: center; }
  .status-code { font-family: var(--font-mono); font-size: 10px; min-width: 32px; color: var(--text-secondary); }
  .status-code.error { color: var(--status-error); }
  .request-url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 10px; }
  .entry-time { font-size: 9px; color: var(--text-muted); flex-shrink: 0; }
  .duration { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); flex-shrink: 0; min-width: 40px; text-align: right; }

  /* ── Detail side panel ── */
  .detail-scroll { width: 320px; flex-shrink: 0; overflow-y: auto; border-left: 1px solid var(--border-default); background: var(--bg-surface); }
  .detail-empty { display: flex; align-items: center; justify-content: center; height: 150px; color: var(--text-muted); font-size: 12px; }
  .detail { padding: var(--space-2) var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
  .detail-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-1) 0; border-bottom: 1px solid var(--border-default); }
  .detail-title { font-size: 12px; font-weight: 600; font-family: var(--font-mono); }
  .detail-close { border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 14px; }
  .detail-close:hover { color: var(--text-primary); }
  .detail-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
  .label { color: var(--text-muted); flex-shrink: 0; margin-right: var(--space-2); }
  .value { color: var(--text-primary); word-break: break-all; text-align: right; }
  .value.mono { font-family: var(--font-mono); font-size: 10px; }
  .status-badge { font-family: var(--font-mono); font-size: 11px; font-weight: 500; }
  .status-badge.error { color: var(--status-error); }
  .mock-badge-inline { font-family: var(--font-mono); font-size: 10px; background: rgba(255, 152, 0, 0.15); color: var(--warning); padding: 1px 6px; border-radius: var(--radius-sm); }
  .section-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: var(--space-1); }
  .code-block { margin: 0; padding: var(--space-2); font-family: var(--font-mono); font-size: 10px; background: var(--bg-inset); border-radius: var(--radius-sm); overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 150px; }
  .code-block.stack { max-height: 100px; }
  .headers-block { display: flex; flex-direction: column; gap: 2px; padding: var(--space-1) var(--space-2); background: var(--bg-inset); border-radius: var(--radius-sm); }
  .header-row { display: flex; gap: var(--space-2); font-size: 10px; font-family: var(--font-mono); }
  .h-key { color: var(--syntax-key); flex-shrink: 0; }
  .h-val { color: var(--text-secondary); word-break: break-all; }
  .error-text { color: var(--status-error); font-family: var(--font-mono); font-size: 10px; }

  .rule-editor { flex: 1; overflow-y: auto; padding: var(--space-3); }
  .rule-form { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); background: var(--bg-inset); border-radius: var(--radius-md); margin-bottom: var(--space-3); }
  .rule-form-title { margin: 0; font-size: 12px; font-weight: 600; }
  .rule-form-row { display: flex; gap: var(--space-2); }
  .rule-form-row select, .rule-input-narrow { padding: var(--space-1) var(--space-2); font-size: 11px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--radius-sm); }
  .rule-input-narrow { width: 100px; }
  .rule-input, .rule-body { padding: var(--space-1) var(--space-2); font-size: 11px; font-family: var(--font-mono); background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--radius-sm); }
  .add-rule-btn { padding: var(--space-1) var(--space-3); background: var(--accent-primary); color: white; border: none; border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; align-self: flex-start; }
  .add-rule-btn:disabled { opacity: 0.5; cursor: default; }
  .rules-list { display: flex; flex-direction: column; gap: var(--space-2); }
  .rule-card { padding: var(--space-2); background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm); }
  .rule-card.disabled { opacity: 0.5; }
  .rule-info { display: flex; align-items: center; gap: var(--space-2); font-size: 11px; }
  .rule-method { font-family: var(--font-mono); font-weight: 600; min-width: 36px; }
  .rule-pattern { font-family: var(--font-mono); color: var(--text-secondary); font-size: 10px; flex: 1; }
  .rule-status { color: var(--text-muted); font-size: 10px; }
  .rule-actions { display: flex; gap: var(--space-1); }
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: transparent; cursor: pointer; color: var(--text-muted); border-radius: var(--radius-sm); }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .icon-btn.danger:hover { color: var(--status-error); background: var(--bg-error); }
  .rule-body-preview { margin: var(--space-1) 0 0; padding: var(--space-1); font-family: var(--font-mono); font-size: 9px; background: var(--bg-inset); border-radius: var(--radius-sm); overflow: hidden; text-overflow: ellipsis; white-space: pre-wrap; max-height: 40px; color: var(--text-muted); }
</style>
