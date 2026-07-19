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
      error?: { message: string; stack?: string };
    };
  } | null>(null);

  let filterType = $state<'all' | 'trace' | 'error'>('all');

  const filteredEvents = $derived(
    filterType === 'all'
      ? serverEvents
      : serverEvents.filter(e =>
          filterType === 'error' ? e.type === 'server:error' : e.type !== 'server:error'
        )
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
            <span class="url" title={evt.data.url}>{evt.data.url ?? '???'}</span>
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
    gap: 1px;
    background: var(--border-default);
  }

  .list {
    overflow-y: auto;
    background: var(--bg-surface);
  }

  .item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-2);
    align-items: center;
    width: 100%;
    padding: 8px var(--space-3);
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
    background: var(--bg-surface);
  }

  .detail {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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