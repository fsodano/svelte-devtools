<script lang="ts">
  interface TimelineEntry {
    id: string; type: string; timestamp: number;
    duration?: number; data: unknown;
  }
  interface TraceData {
    componentId: string; componentName: string;
    stateKey: string; trigger: string; timestamp: number;
  }
  interface ServerRequestData {
    id: string; url: string; method: string; routeId: string | null;
    timings: { name: string; duration?: number }[];
    dataLoads: { routeId: string; loadFunction: string; duration: number }[];
    apiCalls: { url: string; method: string; status: number; duration: number }[];
    dbQueries: { query: string; duration: number }[];
    errors: { message: string }[];
    startTime: number; endTime?: number; duration?: number;
  }

  import JsonTree from "./JsonTree.svelte";
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte';
  import { formatEntryDetail } from './timeline-format.js';

  // --- Event entries state ---
  let entries = $derived(devtoolsStore.timeline);
  let filter = $state<string>('all');
  let selectedEntry = $state<TimelineEntry | null>(null);
  let detailWidth = $state(280);
  let isResizing = $state(false);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;
    const startX = e.clientX;
    const startW = detailWidth;
    function onMove(ev: MouseEvent) {
      if (!isResizing) return;
      detailWidth = Math.max(160, startW + (ev.clientX - startX));
    }
    function onUp() {
      isResizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }



  const filters = [
    { id: 'all', label: 'All' }, { id: 'component', label: 'Components' },
    { id: 'state', label: 'State' }, { id: 'effect', label: 'Effects' },
    { id: 'server', label: 'Server' }, { id: 'client', label: 'Client Requests' }
  ];

  function getFilteredEntries(): TimelineEntry[] {
    const filtered = filter === 'all' ? entries
      : filter === 'server' ? entries.filter(e => e.type.startsWith('server:'))
      : filter === 'client' ? entries.filter(e => e.type.startsWith('client:'))
      : entries.filter(e => e.type.includes(filter));
    return filtered.slice().reverse();
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  function getEventIcon(type: string): string {
    switch (type) {
      case 'component:mount': return '📦';
      case 'component:unmount': return '🗑️';
      case 'state:change': return '📝';
      case 'effect:run': return '⚡';
      case 'server:load': case 'server:ssr': case 'server:request': return '🖥️';
      case 'client:request': return '🌐';
      case 'hydration': return '💧';
      default: return '•';
    }
  }

  function clearTimeline(): void { devtoolsStore.clearTimeline(); }
</script>

<div class="timeline-layout">
  <!-- ─── Left: event entries ─── -->
  <div class="tl-main">
    <div class="toolbar">
      <div class="toolbar-group">
        <button class="tb-btn" onclick={clearTimeline} title="Clear all events">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </button>
      </div>
    </div>

    <header class="header">
      <div class="filters">
        {#each filters as f (f.id)}
          <button class="filter-btn" class:active={filter === f.id} onclick={() => filter = f.id}>{f.label}</button>
        {/each}
      </div>
      <button class="clear-btn" onclick={clearTimeline}>Clear events</button>
    </header>

    <div class="entries-split">
      <div class="entries-list">
        {#if getFilteredEntries().length > 0}
          {#each getFilteredEntries() as entry (entry.id)}
            <button class="entry-row" class:selected={selectedEntry?.id === entry.id}
              onclick={() => selectedEntry = entry}>
              <span class="icon">{getEventIcon(entry.type)}</span>
              <span class="entry-title">{entry.type}</span>
              <span class="time">{formatTime(entry.timestamp)}</span>
              {#if entry.duration}
                <span class="duration" style:color={entry.duration > 16 ? '#f48771' : null}>{entry.duration.toFixed(1)}ms</span>
              {/if}
            </button>
            {#if ['component:mount','component:unmount','state:change','effect:run','server:ssr','server:request','server:error','client:request'].includes(entry.type)}
              <div class="entry-summary"><span class="detail-text">
                {#each formatEntryDetail(entry) as seg, i (i)}
                  {#if seg.color}<span style="color: {seg.color}">{seg.text}</span>{:else}{seg.text}{/if}
                {/each}
              </span></div>
            {/if}
          {/each}
        {:else}
          <div class="empty">No events recorded</div>
        {/if}
      </div>

    {#if selectedEntry}
      <div class="tl-divider"
        role="separator" tabindex="0"
        class:resizing={isResizing}
        onmousedown={startResize}
      ></div>
      <div class="detail-panel" style="width: {detailWidth}px">
        <header class="detail-header">
          <span class="detail-title">{selectedEntry.type}</span>
          <button class="detail-close" onclick={() => selectedEntry = null}>✕</button>
        </header>
        <div class="detail-meta">
          <div class="meta-row"><span class="meta-label">Time</span><span class="meta-value">{new Date(selectedEntry.timestamp).toLocaleString()}</span></div>
          {#if selectedEntry.duration}<div class="meta-row"><span class="meta-label">Duration</span><span class="meta-value">{selectedEntry.duration.toFixed(2)}ms</span></div>{/if}
        </div>
        <div class="detail-data"><h4 class="data-heading">Data</h4><JsonTree value={selectedEntry.data} /></div>
      </div>
    {/if}
    </div><!-- /entries-split -->
  </div>

</div>

<style>
  .timeline-layout { display: flex; height: 100%; background: var(--bg-surface); }

  /* ─── Split: events list + detail panel side by side ─── */
  .entries-split { display: flex; flex: 1; min-height: 0; overflow: hidden; }

  /* ─── Resize divider ─── */
  .tl-divider { width: 4px; flex-shrink: 0; cursor: col-resize; background: transparent; transition: background 0.15s; position: relative; z-index: 1; }
  .tl-divider:hover, .tl-divider.resizing { background: var(--accent-primary, #ff3e00); }

  /* ─── Left side: events ─── */
  .tl-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }

  .toolbar {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--space-1) var(--space-2); background: var(--bg-inset);
    border-bottom: 1px solid var(--border-default); flex-shrink: 0;
  }
  .toolbar-group { display: flex; align-items: center; gap: 2px; }
  .tb-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 20px; padding: 0; border: none;
    background: transparent; color: var(--text-secondary); cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .tb-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .tb-btn:disabled { opacity: 0.35; cursor: default; }
  .tb-btn:disabled:hover { background: transparent; }
  .record-btn { color: var(--text-secondary); }
  .record-btn.recording { color: var(--error); }
  .record-btn.recording :global(svg) { animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .header {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); flex-shrink: 0;
  }
  .filters { display: flex; gap: var(--space-1); }
  .filter-btn {
    padding: var(--space-1) var(--space-2); border: none;
    background: transparent; color: var(--text-secondary);
    cursor: pointer; font-size: 11px; border-radius: var(--radius-sm);
  }
  .filter-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .filter-btn.active { background: var(--bg-elevated); color: var(--text-primary); }
  .clear-btn {
    padding: var(--space-1) var(--space-3); border: none;
    background: var(--bg-error); color: var(--text-error);
    cursor: pointer; font-size: 11px; border-radius: var(--radius-sm);
  }
  .clear-btn:hover { filter: brightness(1.3); }

  .entries-list { flex: 1; overflow-y: auto; padding: var(--space-2); }
  .entry-row {
    display: grid; grid-template-columns: 24px 1fr auto auto;
    gap: var(--space-2); align-items: center; width: 100%;
    padding: 6px var(--space-2); border: none; background: transparent;
    border-bottom: 1px solid var(--border-default); font-size: 11px;
    text-align: left; cursor: pointer; font-family: inherit; color: inherit;
  }
  .entry-row:hover { background: var(--bg-hover); }
  .entry-row.selected { background: var(--bg-elevated); border-left: 2px solid var(--accent-primary); }
  .entry-title { font-family: var(--font-mono); color: var(--syntax-key); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-summary { padding: 2px var(--space-2) 6px 32px; font-size: 10px; color: var(--text-secondary); border-bottom: 1px solid var(--border-default); }

  .detail-panel {
    flex-shrink: 0; display: flex; flex-direction: column;
    border-left: 1px solid var(--border-default); background: var(--bg-surface);
    overflow-y: auto;
  }
  .detail-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); }
  .detail-title { font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--syntax-key); }
  .detail-close { padding: 2px 6px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 14px; border-radius: var(--radius-sm); }
  .detail-close:hover { background: var(--bg-hover); color: var(--text-primary); }
  .detail-meta { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); font-size: 11px; }
  .meta-row { display: flex; justify-content: space-between; padding: 2px 0; }
  .meta-label { color: var(--text-muted); }
  .meta-value { color: var(--text-primary); font-family: var(--font-mono); font-size: 10px; }
  .detail-data { flex: 1; padding: var(--space-2) var(--space-3); overflow-y: auto; }
  .data-heading { margin: 0 0 var(--space-2); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
  .icon { text-align: center; }
  .time { color: var(--text-secondary); font-size: 10px; white-space: nowrap; }
  .duration { font-family: var(--font-mono); font-size: 10px; }
</style>
