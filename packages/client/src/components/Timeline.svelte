<script lang="ts">
  interface SnapshotNode {
    id: string; parentId: string | null; branchId: string;
    timestamp: number; label: string;
  }
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

  // --- Event entries state ---
  let entries = $derived(devtoolsStore.timeline);
  let filter = $state<string>('all');
  let selectedEntry = $state<TimelineEntry | null>(null);
  let detailWidth = $state(280);
  let isResizing = $state(false);

  // --- Snapshot detail state ---
  let selectedSnapshotIdx = $state<number | null>(null);
  let selectedSnapshotDetail = $derived(
    selectedSnapshotIdx !== null ? devtoolsStore.timeTravel.snapshots[selectedSnapshotIdx] : null
  );

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

  // --- Snapshot / branch state ---
  let snapshots = $derived(devtoolsStore.timeTravel.snapshots as unknown as SnapshotNode[]);
  let currentSnapshotIndex = $derived(devtoolsStore.timeTravel.currentIndex);
  let canUndo = $derived(devtoolsStore.timeTravel.canUndo);
  let canRedo = $derived(devtoolsStore.timeTravel.canRedo);
  let isPlaying = $state(false);

  let snapshotCounter = $derived(
    snapshots.length > 0
      ? `${currentSnapshotIndex + 1} / ${snapshots.length}`
      : ''
  );

  let isViewingHistorical = $derived(
    snapshots.length > 0 && currentSnapshotIndex < snapshots.length - 1
  );

  // --- Auto-play ---
  $effect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if (canRedo) devtoolsStore.timeTravel.redo();
      else isPlaying = false;
    }, 1500);
    return () => clearInterval(interval);
  });

  // --- Handlers ---
  function toggleRecording(): void {
    devtoolsStore.isRecording = !devtoolsStore.isRecording;
    if (devtoolsStore.isRecording) devtoolsStore.timeTravel.capture();
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

  function formatDuration(d: number | undefined): string {
    if (!d) return '';
    return d > 16
      ? `<span style="color: #f48771">${d.toFixed(1)}ms</span>`
      : `${d.toFixed(1)}ms`;
  }

  function formatEntryDetail(entry: TimelineEntry): string {
    const d = entry.data as Record<string, unknown> | undefined;
    if (!d) return '';
    switch (entry.type) {
      case 'component:mount': {
        const name = (d as { name?: string }).name || 'unknown';
        const filename = (d as { filename?: string }).filename || '';
        return `<span style="color: #9cdcfe">${name}</span>${filename ? ` <span style="color: #858585">${filename}</span>` : ''}`;
      }
      case 'component:unmount': {
        const name = (d as { name?: string }).name || (d.id as string) || 'unknown';
        return `<span style="color: #f48771">${name}</span>`;
      }
      case 'state:change': {
        const key = (d.key as string) || '?';
        const val = d.value; const prev = d.prevValue;
        const comp = (d.componentName as string) || '';
        const valStr = val !== undefined ? JSON.stringify(val) : 'undefined';
        const prevStr = prev !== undefined ? JSON.stringify(prev) : 'undefined';
        const ci = comp ? `<span style="color: #9cdcfe">${comp}</span>.` : '';
        return `${ci}<span style="color: #dcdcaa">${key}</span>: <span style="color: #858585">${prevStr}</span> → <span style="color: #4ec9b0">${valStr}</span>`;
      }
      case 'effect:run': {
        const name = (d as { effectName?: string }).effectName || 'anonymous';
        return `<span style="color: #c586c0">${name}</span>`;
      }
      case 'client:request': case 'server:request': case 'server:ssr': case 'server:trace': case 'server:error': {
        const method = (d as { method?: string }).method || 'GET';
        const url = (d as { url?: string }).url || '';
        const sc = (d as { statusCode?: number }).statusCode;
        const mc = method === 'GET' ? '#4ec9b0' : method === 'POST' ? '#dcdcaa' : '#ce9178';
        const ss = sc ? ` <span style="color:${sc >= 400 ? '#f48771' : '#6a9955'}">${sc}</span>` : '';
        return `<span style="color: ${mc}">${method}</span> <span style="color: #9cdcfe">${url}</span>${ss}`;
      }
      default: return '';
    }
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
              {#if entry.duration}<span class="duration">{@html formatDuration(entry.duration)}</span>{/if}
            </button>
            {#if ['component:mount','component:unmount','state:change','effect:run','server:ssr','server:request','server:error','client:request'].includes(entry.type)}
              <div class="entry-summary"><span class="detail-text">{@html formatEntryDetail(entry)}</span></div>
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

  <!-- ─── Right: branch tree ─── -->
  <div class="tl-branch">
    <div class="branch-header">
      <span class="bh-title">Snapshots</span>
      <span class="bh-count">{snapshotCounter}</span>
      <button class="tb-btn record-btn" class:recording={devtoolsStore.isRecording}
        onclick={toggleRecording}
        title={devtoolsStore.isRecording ? 'Recording on' : 'Recording off'}>
        <svg viewBox="0 0 12 12" width="10" height="10"><circle cx="6" cy="6" r="4" fill="currentColor"/></svg>
      </button>
    </div>

    {#if snapshots.length > 0}
      <div class="branch-toolbar">
        <button class="tb-btn" onclick={() => devtoolsStore.timeTravel.undo()} disabled={!canUndo} title="Undo">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l3-3v2h5v3H8v2L5 7z"/></svg>
        </button>
        <button class="tb-btn" onclick={() => devtoolsStore.timeTravel.redo()} disabled={!canRedo} title="Redo">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 7L8 4v2H3v3h5v2l3-3z"/></svg>
        </button>
        <button class="tb-btn" onclick={() => isPlaying = !isPlaying} title={isPlaying ? 'Pause' : 'Auto-play'}>
          {#if isPlaying}
            <svg viewBox="0 0 16 16" width="11" height="11"><rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor"/><rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor"/></svg>
          {:else}
            <svg viewBox="0 0 16 16" width="11" height="11"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
          {/if}
        </button>
        <button class="tb-btn" onclick={() => devtoolsStore.timeTravel.clear()} title="Clear all snapshots">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </button>
      </div>

      {#if snapshots.length > 0}
        <div class="hist-banner" class:hist-current={!isViewingHistorical}>
          <span class="hist-text">
            {isViewingHistorical ? 'Viewing old state' : 'Viewing current state'}
          </span>
        </div>
      {/if}
    {/if}

    <div class="snap-list">
      {#if snapshots.length === 0}
        <div class="empty-sm">No snapshots</div>
      {:else}
        {#each snapshots as snap, idx}
          <div class="snap-row" class:active={currentSnapshotIndex === idx}>
            <button class="snap-dot" class:active={currentSnapshotIndex === idx}
              onclick={() => { devtoolsStore.timeTravel.restore(idx, true); selectedSnapshotIdx = idx; }}
              title={new Date(snap.timestamp).toLocaleString()}>
              <span class="dot-fill"></span>
            </button>
            <div class="snap-info">
              <span class="snap-lbl"><span class="snap-num">#{idx + 1}</span> {snap.label || 'snapshot'}</span>
              <span class="snap-ts">{new Date(snap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  {#if selectedSnapshotDetail}
    <div class="sd-panel">
      <header class="detail-header">
        <span class="detail-title">Snapshot #{selectedSnapshotIdx! + 1}</span>
        <button class="detail-close" onclick={() => selectedSnapshotIdx = null}>✕</button>
      </header>
      <div class="detail-meta">
        <div class="meta-row"><span class="meta-label">Label</span><span class="meta-value">{selectedSnapshotDetail.label || 'snapshot'}</span></div>
        <div class="meta-row"><span class="meta-label">Time</span><span class="meta-value">{new Date(selectedSnapshotDetail.timestamp).toLocaleString()}</span></div>
        <div class="meta-row"><span class="meta-label">Components</span><span class="meta-value">{selectedSnapshotDetail.components.length}</span></div>
        <div class="meta-row"><span class="meta-label">Timeline</span><span class="meta-value">{selectedSnapshotDetail.timeline.length} entries</span></div>
      </div>
      <div class="sd-components">
        <h4 class="data-heading">Component State</h4>
        {#each selectedSnapshotDetail.components as comp}
          <div class="sd-comp">
            <span class="sd-comp-name">{comp.name}</span>
            {#each Object.entries(comp.state || {}) as [k, v]}
              <div class="sd-state-row">
                <span class="sd-key">{k}</span>
                <span class="sd-val">{JSON.stringify(v).substring(0, 60)}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
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
  .empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); font-size: 12px; }

  /* ─── Right side: branch tree ─── */
  .tl-branch {
    width: 200px; flex-shrink: 0;
    border-left: 1px solid var(--border-default);
    background: var(--bg-inset); display: flex; flex-direction: column;
  }

  .branch-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-default); flex-shrink: 0;
  }
  .bh-title { font-size: 11px; font-weight: 600; color: var(--text-primary); }
  .bh-count { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); }

  .branch-toolbar {
    display: flex; align-items: center; gap: 2px;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border-default); flex-shrink: 0;
  }

  .hist-banner {
    display: flex; align-items: center; gap: var(--space-2);
    padding: 4px var(--space-2); background: var(--bg-error);
    border-bottom: 1px solid var(--border-default); flex-shrink: 0;
  }
  .hist-text { font-size: 10px; flex: 1; color: var(--warning); }
  .hist-current .hist-text { color: var(--success); }
  .hist-current { background: rgba(52, 199, 89, 0.08); }

  .snap-list {
    flex: 1; overflow-y: auto; padding: var(--space-1) 0;
    display: flex; flex-direction: column;
  }

  .snap-row {
    display: flex; align-items: center; gap: var(--space-2);
    padding: 4px var(--space-3); min-height: 28px;
    transition: background 0.15s; cursor: pointer;
  }
  .snap-row:hover { background: var(--bg-hover); }
  .snap-row.active { background: var(--bg-elevated); }

  .snap-dot {
    display: flex; align-items: center; justify-content: center;
    width: 10px; height: 10px; padding: 0; flex-shrink: 0;
    border: 2px solid var(--accent-primary, #ff3e00);
    background: transparent; cursor: pointer; border-radius: 50%;
    transition: border-color 0.15s, transform 0.15s;
  }
  .snap-dot:hover { transform: scale(1.3); }
  .snap-dot.active { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 25%, transparent); }
  .dot-fill { display: block; width: 4px; height: 4px; border-radius: 50%; background: var(--accent-primary, #ff3e00); }
  .snap-dot.active .dot-fill { background: #ff3e00; }

  .snap-info { display: flex; flex-direction: column; min-width: 0; }
  .snap-lbl { font-size: 10px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .snap-num { color: var(--text-muted); font-family: var(--font-mono); margin-right: 3px; }
  .snap-ts { font-size: 8px; color: var(--text-muted); font-family: var(--font-mono); }

  .empty-sm { display: flex; align-items: center; justify-content: center; padding: var(--space-4); color: var(--text-muted); font-size: 11px; }

  /* ─── Snapshot detail panel (far right) ─── */
  .sd-panel { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border-default); background: var(--bg-surface); overflow-y: auto; }
  .sd-components { flex: 1; padding: var(--space-3); overflow-y: auto; }
  .sd-comp { margin-bottom: var(--space-3); }
  .sd-comp-name { font-size: 11px; font-weight: 600; color: var(--text-primary); display: block; margin-bottom: var(--space-1); }
  .sd-state-row { display: flex; gap: var(--space-2); padding: 1px 0; font-size: 10px; font-family: var(--font-mono); }
  .sd-key { color: var(--syntax-key); flex-shrink: 0; }
  .sd-val { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
