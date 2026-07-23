<script lang="ts">
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte';

  const serverEvents = $derived(
    devtoolsStore.serverEvents as Array<{
      id: string;
      type: string;
      timestamp: number;
      duration?: number;
      data: {
        url?: string;
        method?: string;
        routeId?: string | null;
        statusCode?: number;
        contentType?: string;
        responseSize?: number;
        requestBody?: string;
        responsePreview?: string;
        reqHeaders?: Record<string, string | undefined>;
        resHeaders?: Record<string, string>;
        error?: { message: string; stack?: string };
      };
    }>
  );

  let selected = $state<{
    id: string;
    type: string;
    timestamp: number;
    duration?: number;
    data: {
      url?: string;
      method?: string;
      routeId?: string | null;
      statusCode?: number;
      contentType?: string;
      responseSize?: number;
      requestBody?: string;
      responsePreview?: string;
      reqHeaders?: Record<string, string | undefined>;
      resHeaders?: Record<string, string>;
      error?: { message: string; stack?: string };
    };
  } | null>(null);

  let filterType = $state<'all' | 'trace' | 'error'>('all');

  const filteredEvents = $derived(
    (filterType === 'all'
      ? serverEvents
      : serverEvents.filter(e =>
          filterType === 'error' ? e.type === 'server:error' : e.type !== 'server:error'
        )
    ).slice().reverse()
  );

  async function refresh(): Promise<void> {
    try {
      const res = await fetch('/__svelte-devtools/server-events?last=50');
      if (res.ok) devtoolsStore.setServerEvents(await res.json());
    } catch { /* noop */ }
  }

  async function clearAll(): Promise<void> {
    try {
      await fetch('/__svelte-devtools/server-events', { method: 'DELETE' });
    } catch { /* noop */ }
  }

  function fmtDuration(ms?: number): string {
    if (ms === undefined) return '';
    return ms > 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  }

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }

  function fmtISOTimestamp(ts: number): string {
    const d = new Date(ts);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }
</script>

<div class="server-view">
  <header class="header">
    <span class="count">{serverEvents.length} requests</span>
    <div class="toolbar">
      <select class="filter-select" bind:value={filterType}>
        <option value="all">All</option>
        <option value="trace">Traces</option>
        <option value="error">Errors</option>
      </select>
      <button class="tool-btn" onclick={refresh}>Refresh</button>
      <button class="tool-btn" onclick={clearAll}>Clear</button>
    </div>
  </header>

  <div class="split">
    <div class="list">
      {#if filteredEvents.length > 0}
        {#each filteredEvents as evt (evt.id)}
          <button
            class="item"
            class:error={!!evt.data.error}
            class:selected={selected?.id === evt.id}
            onclick={() => selected = evt}
          >
            <span class="method" class:error={!!evt.data.error}>
              {evt.data.method ?? '???'}
            </span>
            <span class="status" class:error={(evt.data.statusCode ?? 0) >= 400}>
              {evt.data.statusCode ?? '—'}
            </span>
            <span class="url" title={evt.data.url}>{evt.data.url ?? '???'}</span>
            <span class="time">{fmtISOTimestamp(evt.timestamp)}</span>
            {#if evt.data.error}
              <span class="badge error">ERROR</span>
            {:else}
              <span class="duration" class:slow={(evt.duration || 0) > 500}>
                {fmtDuration(evt.duration)}
              </span>
            {/if}
          </button>
        {/each}
      {:else}
        <div class="empty">No server events recorded yet.</div>
      {/if}
    </div>

    <div class="detail-scroll">
      {#if selected}
        <div class="detail">
          <div class="detail-row">
            <span class="label">URL</span>
            <span class="value">{selected.data.url ?? '—'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Method</span>
            <span class="value">{selected.data.method ?? '—'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Status</span>
            <span class="value">
              <span class="status-badge" class:error={(selected.data.statusCode ?? 0) >= 400}>{selected.data.statusCode ?? '—'}</span>
            </span>
          </div>
          {#if selected.data.routeId !== undefined}
            <div class="detail-row">
              <span class="label">Route</span>
              <span class="value">{selected.data.routeId ?? '(layout/root)'}</span>
            </div>
          {/if}
          <div class="detail-row">
            <span class="label">Time</span>
            <span class="value">{fmtTime(selected.timestamp)}</span>
          </div>
          {#if selected.duration !== undefined}
          <div class="detail-row">
            <span class="label">Duration</span>
            <span class="value">{fmtDuration(selected.duration)}</span>
          </div>
          {/if}
          {#if selected.data.contentType}
            <div class="detail-row">
              <span class="label">Type</span>
              <span class="value">{selected.data.contentType}</span>
            </div>
          {/if}
          {#if selected.data.responseSize != null}
            <div class="detail-row">
              <span class="label">Size</span>
              <span class="value">{selected.data.responseSize} bytes</span>
            </div>
          {/if}

          {#if selected.data.requestBody}
            <div class="section-label">Request Body</div>
            <pre class="code-block">{selected.data.requestBody}</pre>
          {/if}

          {#if selected.data.responsePreview}
            <div class="section-label">Response Body</div>
            <pre class="code-block">{selected.data.responsePreview}</pre>
          {/if}

          {#if selected.data.reqHeaders}
            <div class="section-label">Request Headers</div>
            <div class="headers-block">
              {#each Object.entries(selected.data.reqHeaders).filter(([_, v]) => v) as [key, val]}
                <div class="header-row"><span class="header-key">{key}</span><span class="header-val">{val}</span></div>
              {/each}
            </div>
          {/if}

          {#if selected.data.resHeaders}
            <div class="section-label">Response Headers</div>
            <div class="headers-block">
              {#each Object.entries(selected.data.resHeaders).filter(([_, v]) => v) as [key, val]}
                <div class="header-row"><span class="header-key">{key}</span><span class="header-val">{val}</span></div>
              {/each}
            </div>
          {/if}

          {#if selected.data.error}
            <div class="detail-row">
              <span class="label">Error</span>
              <span class="value error-text">{selected.data.error.message}</span>
            </div>
            {#if selected.data.error.stack}
              <pre class="stack">{selected.data.error.stack}</pre>
            {/if}
          {/if}
        </div>
      {:else}
        <div class="empty">Select a request to inspect details.</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .server-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: var(--font-ui);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-default);
    background: var(--bg-surface);
    flex-shrink: 0;
  }

  .count {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .filter-select {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    font-size: 11px;
    cursor: pointer;
  }

  .tool-btn {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .tool-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    gap: 1px;
    background: var(--border-default);
  }

  .list {
    overflow-y: auto;
    min-height: 0;
    background: var(--bg-surface);
  }

  .item {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    gap: var(--space-2);
    align-items: center;
    width: 100%;
    padding: 6px var(--space-3);
    border: none;
    border-bottom: 1px solid var(--border-default);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    font-size: 11px;
    transition: background var(--transition-fast);
  }

  .item:hover {
    background: var(--bg-hover);
  }

  .item.selected {
    background: var(--svelte-brand-10);
  }

  .item.error {
    border-left: 3px solid var(--status-disconnected);
  }

  .method {
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    color: var(--text-muted);
    min-width: 40px;
  }

  .method.error {
    color: var(--status-disconnected);
  }

  .url {
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .duration {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
  }

  .duration.slow {
    color: var(--status-disconnected);
  }

  .badge {
    font-size: 9px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .badge.error {
    background: rgba(255, 58, 47, 0.15);
    color: var(--status-disconnected);
  }

  .detail-scroll {
    overflow-y: auto;
    min-height: 0;
    background: var(--bg-surface);
  }

  .detail {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
  }

  .detail-row {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: var(--space-2);
    align-items: baseline;
    font-size: 12px;
  }

  .label {
    color: var(--text-muted);
    font-weight: 500;
  }

  .value {
    color: var(--text-primary);
    font-family: var(--font-mono);
    word-break: break-word;
  }

  .error-text {
    color: var(--status-disconnected);
    font-weight: 600;
  }

  .response-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    align-items: flex-start;
  }

  .response-body {
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.3;
    background: var(--bg-inset);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
    max-width: 100%;
  }

  .response-block .response-body {
    width: 100%;
  }

  .status-badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 11px;
    background: rgba(76, 175, 80, 0.15);
    color: #4caf50;
  }
  .status-badge.error {
    background: rgba(244, 67, 54, 0.15);
    color: #f44336;
  }

  .section-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-top: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .code-block {
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.3;
    background: var(--bg-inset);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .headers-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .header-row {
    display: flex;
    gap: var(--space-2);
  }

  .header-key {
    color: var(--syntax-key);
    min-width: 120px;
    flex-shrink: 0;
  }

  .header-val {
    color: var(--text-secondary);
    word-break: break-all;
  }

  .stack {
    margin-top: var(--space-2);
    padding: var(--space-3);
    background: var(--bg-inset);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--status-disconnected);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 12px;
    padding: var(--space-6);
    text-align: center;
  }
</style>