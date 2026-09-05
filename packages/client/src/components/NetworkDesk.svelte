<script lang="ts">
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';
  import SplitPane from './SplitPane.svelte';
  import { untrack } from 'svelte';
  import { apiFetch } from '../lib/api.js';
  import { NetworkHistory } from '../lib/network-history.js';

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
    responseBodyTruncated?: boolean;
  }

  interface MockRule {
    id: string; pattern: string; method: string;
    statusCode: number; body: string; enabled: boolean; headers?: Record<string, string>;
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
  let newContentType = $state('application/json');
  let editingRuleId = $state<string | null>(null);
  let ruleError = $state('');
  let draftHint = $state('');
  const history = new NetworkHistory<NetworkEntry>();

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const filters = [
    { id: 'all', label: 'All' }, { id: 'server:ssr', label: 'SSR' },
    { id: 'server:error', label: 'Errors' }, { id: 'client:request', label: 'Client' },
    { id: 'mock', label: 'Mocked' }
  ];

  // Poll server events
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollInFlight = false;

  $effect(() => {
    fetchServerEvents();
    pollTimer = setInterval(fetchServerEvents, 1000);
    window.parent.postMessage({ type: 'svelte-devtools-get-mock-rules' }, window.location.origin);
    return () => { if (pollTimer) clearInterval(pollTimer); };
  });

  async function fetchServerEvents() {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      const res = await apiFetch('/__svelte-devtools/server-events?last=50');
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.events) return;
      const newEntries: NetworkEntry[] = (data.events as { id: string; type: string; timestamp: number; duration?: number; data?: Record<string, unknown> }[])
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
      entries = history.ingest('server', newEntries);
    } catch {} finally { pollInFlight = false; }
  }

  // Listen for client-side requests from the store
  $effect(() => {
    const tl = devtoolsStore.timeline;
    const clientReqs = tl.filter(e => (e.type as string) === 'client:request').slice(-50);
    untrack(() => {
      entries = history.ingest('client', clientReqs.map(req => {
        const data = req.data as Record<string, unknown> || {};
        return {
            id: req.id, type: req.type, url: data.url as string,
            method: data.method as string, statusCode: data.statusCode as number,
            duration: req.duration, timestamp: req.timestamp,
            requestHeaders: data.requestHeaders as Record<string, string> | undefined,
            responseHeaders: data.responseHeaders as Record<string, string> | undefined,
            requestBody: data.requestBody as string | undefined,
            responseBody: data.responsePreview as string | undefined,
            responseBodyTruncated: data.responseBodyTruncated === true,
            contentType: data.contentType as string | undefined,
            responseSize: data.responseSize as number | undefined,
            mockResponse: data.mockResponse as boolean | undefined,
            mockRuleId: data.mockRuleId as string | undefined,
            mockRulePattern: data.mockRulePattern as string | undefined,
        };
      }));
    });
  });

  const filtered = $derived(
    filter === 'all' ? entries
    : filter === 'server:ssr' ? entries.filter(e => e.type === 'server:ssr' || e.type === 'server:request')
    : filter === 'server:error' ? entries.filter(e => e.type === 'server:error' || (e.statusCode ?? 200) >= 400 || e.statusCode === 0)
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
      window.parent.postMessage({ type: 'svelte-devtools-set-mock-rules', rules: $state.snapshot(mockRules) }, window.location.origin);
    } catch {}
  }

  function receiveRules(event: MessageEvent) {
    if (event.origin === window.location.origin && event.data?.type === 'svelte-devtools-mock-rules') {
      mockRules = event.data.rules;
    }
  }

  function resetDraft() {
    editingRuleId = null; newPattern = ''; newMethod = 'GET'; newStatusCode = 200;
    newBody = ''; newContentType = 'application/json'; ruleError = ''; draftHint = '';
  }

  function mockRequest(entry: NetworkEntry) {
    resetDraft();
    newPattern = '^' + (entry.url || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
    newMethod = entry.method || 'GET';
    newStatusCode = entry.statusCode && entry.statusCode >= 200 ? entry.statusCode : 200;
    newBody = entry.responseBody || '';
    newContentType = entry.responseHeaders?.['content-type'] || entry.contentType || 'application/json';
    draftHint = entry.responseBodyTruncated
      ? 'This response preview is incomplete. Replace it with a complete response body before saving.'
      : 'Prefilled from this request. Review the response body before saving.';
    showRuleEditor = true;
  }

  function editRule(rule: MockRule) {
    editingRuleId = rule.id; newPattern = rule.pattern; newMethod = rule.method;
    newStatusCode = rule.statusCode; newBody = rule.body;
    newContentType = rule.headers?.['content-type'] || ''; ruleError = ''; draftHint = '';
  }

  function addRule() {
    ruleError = '';
    if (!newPattern.trim()) { ruleError = 'Enter a URL pattern.'; return; }
    try { new RegExp(newPattern); } catch { ruleError = 'Enter a valid regular expression.'; return; }
    if (!Number.isInteger(newStatusCode) || newStatusCode < 200 || newStatusCode > 599) {
      ruleError = 'Use a response status from 200 to 599.'; return;
    }
    if ([204, 205, 304].includes(newStatusCode) && newBody.trim()) {
      ruleError = 'This status requires an empty response body.'; return;
    }
    if (newBody.trim() && /(?:application\/json|\+json)(?:;|$)/i.test(newContentType)) {
      try { JSON.parse(newBody); } catch { ruleError = 'Enter complete, valid JSON for this response body.'; return; }
    }
    const rule: MockRule = {
      id: editingRuleId || crypto.randomUUID(), pattern: newPattern, method: newMethod,
      statusCode: newStatusCode, body: newBody,
      headers: newContentType ? { 'content-type': newContentType } : {},
      enabled: mockRules.find(r => r.id === editingRuleId)?.enabled ?? true,
    };
    mockRules = editingRuleId ? mockRules.map(r => r.id === editingRuleId ? rule : r) : [...mockRules, rule];
    syncMockRules();
    resetDraft();
  }

  function toggleRule(id: string) {
    mockRules = mockRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    syncMockRules();
  }

  function deleteRule(id: string) {
    mockRules = mockRules.filter(r => r.id !== id);
    syncMockRules();
  }

  function clearEntries() { entries = history.clear(); selectedEntry = null; }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
</script>

<svelte:window onmessage={receiveRules} />

<div class="network-panel">
  <div class="network-header">
    <div class="header-left">
      <span class="panel-title">Network</span>
      <div class="header-tabs">
        <button class="header-tab" class:active={!showRuleEditor} onclick={() => showRuleEditor = false}>Requests</button>
        <button class="header-tab" class:active={showRuleEditor} onclick={() => showRuleEditor = true}>Mock Rules <span class="rule-count">{mockRules.filter(r => r.enabled).length}</span></button>
      </div>
    </div>
    <button class="clear-btn" onclick={clearEntries} disabled={entries.length === 0}>Clear</button>
  </div>

  {#if !showRuleEditor}
    <SplitPane label="Resize network request panels">
      {#snippet first()}
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

      {/snippet}
      {#snippet second()}
      <div class="detail-scroll">
        {#if selectedEntry}
          <div class="detail">
            <div class="detail-header">
              <span class="detail-title">{selectedEntry.type}</span>
              {#if selectedEntry.type === 'client:request' && selectedEntry.url}
                <button class="create-mock-btn" onclick={() => mockRequest(selectedEntry!)}>Mock this request</button>
              {/if}
              <button aria-label="Close request details" class="detail-close" onclick={() => selectedEntry = null}>✕</button>
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
                {#each Object.entries(selectedEntry.requestHeaders).filter(([_, v]) => v) as [key, val] (key)}
                  <div class="header-row"><span class="h-key">{key}</span><span class="h-val">{val}</span></div>
                {/each}
              </div>
            {/if}

            {#if selectedEntry.responseHeaders}
              <div class="section-label">Response Headers</div>
              <div class="headers-block">
                {#each Object.entries(selectedEntry.responseHeaders).filter(([_, v]) => v) as [key, val] (key)}
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
      {/snippet}
    </SplitPane>
  {:else}
    <div class="rule-editor">
      <div class="rule-form">
        <h3 class="rule-form-title">{editingRuleId ? 'Edit mock rule' : 'New mock rule'}</h3>
        <p class="rule-hint">Mock browser fetch and XHR requests. Rules run in list order; the first match wins. Rules last until the app reloads.</p>
        {#if draftHint}<p class="draft-hint">{draftHint}</p>{/if}
        <label for="mock-pattern">URL pattern (regular expression)</label>
        <input id="mock-pattern" type="text" bind:value={newPattern} placeholder="URL regex pattern (e.g. /api/.*)" class="rule-input" />
        <div class="rule-form-row">
          <select aria-label="Request method" bind:value={newMethod}>
            {#each methods as m (m)}<option value={m}>{m}</option>{/each}
          </select>
          <input aria-label="Response status" type="number" bind:value={newStatusCode} placeholder="Status" min="200" max="599" class="rule-input-narrow" />
        </div>
        <label for="mock-content-type">Content type</label>
        <input id="mock-content-type" class="rule-input" bind:value={newContentType} placeholder="application/json" />
        <label for="mock-body">Response body</label>
        <textarea id="mock-body" bind:value={newBody} placeholder="Response body (JSON)" class="rule-body" rows="8"></textarea>
        {#if ruleError}<p class="rule-error" role="alert">{ruleError}</p>{/if}
        <div class="rule-form-row">
          <button class="add-rule-btn" onclick={addRule} disabled={!newPattern.trim()}>{editingRuleId ? 'Save changes' : 'Enable mock rule'}</button>
          <button class="clear-btn" onclick={resetDraft}>Reset</button>
        </div>
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
                <button class="clear-btn" onclick={() => editRule(rule)}>Edit</button>
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
  .create-mock-btn { margin-left: auto; border: 1px solid var(--svelte-brand); background: var(--svelte-brand-10); color: var(--text-primary); border-radius: var(--radius-sm); padding: 5px 9px; cursor: pointer; font-size: 11px; white-space: nowrap; }
  .rule-count { padding: 1px 5px; border-radius: 8px; background: var(--bg-inset); font-variant-numeric: tabular-nums; }
  .rule-hint, .draft-hint { color: var(--text-muted); font-size: 11px; line-height: 1.6; margin: 0; }
  .draft-hint { padding: 8px; background: var(--svelte-brand-10); border-radius: var(--radius-sm); color: var(--text-secondary); }
  .rule-error { color: var(--error, #ef4444); font-size: 11px; }
  .rule-form label { font-size: 11px; color: var(--text-secondary); }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--svelte-brand); outline-offset: 2px; }

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
  .list { height: 100%; display: flex; flex-direction: column; flex: 1; min-width: 0; }
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
  .detail-scroll { height: 100%; min-width: 0; overflow: auto; }
  .detail-empty { display: flex; align-items: center; justify-content: center; height: 150px; color: var(--text-muted); font-size: 12px; }
  .detail { padding: var(--space-2) var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
  .detail-header { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between; padding: var(--space-1) 0; border-bottom: 1px solid var(--border-default); }
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
  .header-row { display: flex; flex-wrap: wrap; overflow-wrap: anywhere; gap: var(--space-2); font-size: 10px; font-family: var(--font-mono); }
  .h-key { color: var(--syntax-key); flex-shrink: 0; }
  .h-val { color: var(--text-secondary); word-break: break-all; }
  .error-text { color: var(--status-error); font-family: var(--font-mono); font-size: 10px; }

  .rule-editor { flex: 1; overflow-y: auto; padding: var(--space-3); }
  .rule-form { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); background: var(--bg-inset); border-radius: var(--radius-md); margin-bottom: var(--space-3); }
  .rule-form-title { margin: 0; font-size: 12px; font-weight: 600; }
  .rule-form-row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
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
  .rule-pattern { overflow-wrap: anywhere; min-width: 0; font-family: var(--font-mono); color: var(--text-secondary); font-size: 10px; flex: 1; }
  .rule-status { color: var(--text-muted); font-size: 10px; }
  .rule-actions { display: flex; gap: var(--space-1); }
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: transparent; cursor: pointer; color: var(--text-muted); border-radius: var(--radius-sm); }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .icon-btn.danger:hover { color: var(--status-error); background: var(--bg-error); }
  .rule-body-preview { margin: var(--space-1) 0 0; padding: var(--space-1); font-family: var(--font-mono); font-size: 9px; background: var(--bg-inset); border-radius: var(--radius-sm); overflow: hidden; text-overflow: ellipsis; white-space: pre-wrap; max-height: 40px; color: var(--text-muted); }
</style>
