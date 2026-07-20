<script lang="ts">
  interface TimelineEntry {
    id: string;
    type: string;
    timestamp: number;
    duration?: number;
    data: unknown;
  }

  interface TraceData {
    componentId: string;
    componentName: string;
    stateKey: string;
    trigger: string;
    timestamp: number;
  }

  interface ServerTraceData {
    id: string;
    url: string;
    method: string;
    routeId: string | null;
    timings: { name: string; duration?: number }[];
    dataLoads: { routeId: string; loadFunction: string; duration: number }[];
    apiCalls: { url: string; method: string; status: number; duration: number }[];
    dbQueries: { query: string; duration: number }[];
    errors: { message: string }[];
    startTime: number;
    endTime?: number;
    duration?: number;
  }

  import JsonTree from "./JsonTree.svelte";
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte';

  // --- Store-derived reactive state ---
  let entries = $derived(devtoolsStore.timeline);
  let snapshots = $derived(devtoolsStore.timeTravel.snapshots);
  let currentSnapshotIndex = $derived(devtoolsStore.timeTravel.currentIndex);
  let canUndo = $derived(devtoolsStore.timeTravel.canUndo);
  let canRedo = $derived(devtoolsStore.timeTravel.canRedo);

  // --- Local UI state ---
  let isRecording = $state(true);
  let isPlaying = $state(false);
  let filter = $state<string>('all');
  let selectedEntry = $state<TimelineEntry | null>(null);

  // --- Derived helpers ---
  let isViewingHistorical = $derived(
    snapshots.length > 0 && currentSnapshotIndex < snapshots.length - 1
  );

  let snapshotCounter = $derived(
    snapshots.length > 0
      ? `Snapshot ${currentSnapshotIndex + 1} / ${snapshots.length}`
      : ''
  );

  // --- Auto-play: advance through snapshots on an interval ---
  $effect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if (canRedo) {
        devtoolsStore.timeTravel.redo();
      } else {
        isPlaying = false;
      }
    }, 1500);
    return () => clearInterval(interval);
  });

  // --- Toolbar action handlers ---
  function toggleRecording(): void {
    isRecording = !isRecording;
    if (isRecording) {
      devtoolsStore.timeTravel.capture();
    }
  }

  function togglePlay(): void {
    isPlaying = !isPlaying;
  }

  function handleUndo(): void {
    devtoolsStore.timeTravel.undo();
  }

  function handleRedo(): void {
    devtoolsStore.timeTravel.redo();
  }

  function handleClearSnapshots(): void {
    devtoolsStore.timeTravel.clear();
  }

  function handleRestoreLatest(): void {
    devtoolsStore.timeTravel.restore(snapshots.length - 1);
  }

  // --- Filter state & helpers (existing) ---
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'component', label: 'Components' },
    { id: 'state', label: 'State' },
    { id: 'effect', label: 'Effects' },
    { id: 'trace', label: 'Traces' },
    { id: 'server', label: 'Server' },
    { id: 'api', label: 'API' }
  ];

  function getFilteredEntries(): TimelineEntry[] {
    if (filter === 'all') return entries;
    if (filter === 'trace') return entries.filter(e => e.type === 'trace:trigger');
    if (filter === 'server') return entries.filter(e => e.type === 'server:trace');
    return entries.filter(e => e.type.includes(filter));
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  function formatDuration(duration: number | undefined): string {
    if (!duration) return '';
    return duration > 16 
      ? `<span style="color: #f48771">${duration.toFixed(1)}ms</span>`
      : `${duration.toFixed(1)}ms`;
  }

  function getTriggerInfo(data: unknown): string {
    if (!data) return '';
    const traceData = data as TraceData;
    if (traceData.trigger) {
      return `<span style="color: #ce9178">(${traceData.trigger})</span>`;
    }
    return '';
  }

  function formatEntryDetail(entry: TimelineEntry): string {
    const d = entry.data as Record<string, unknown> | undefined;
    if (!d) return '';

    switch (entry.type) {
      case 'component:mount': {
        const name = (d as { name?: string }).name || 'unknown';
        const filename = (d as { filename?: string }).filename || '';
        const state = (d as { state?: Record<string, unknown> }).state;
        const stateCount = state ? Object.keys(state).length : 0;
        const statePreview = state && stateCount > 0
          ? ` (${Object.entries(state).slice(0, 3).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}${stateCount > 3 ? '…' : ''})`
          : '';
        return `<span style="color: #9cdcfe">${name}</span>${filename ? ` <span style="color: #858585">${filename}</span>` : ''}${statePreview}`;
      }
      case 'component:unmount': {
        const name = (d as { name?: string }).name || d.id as string || 'unknown';
        return `<span style="color: #f48771">${name}</span>`;
      }
      case 'state:change': {
        const key = d.key as string || '?';
        const val = d.value;
        const prev = d.prevValue;
        const comp = d.componentName as string || '';
        const valStr = val !== undefined ? JSON.stringify(val) : 'undefined';
        const prevStr = prev !== undefined ? JSON.stringify(prev) : 'undefined';
        const compInfo = comp ? `<span style="color: #9cdcfe">${comp}</span>.` : '';
        return `${compInfo}<span style="color: #dcdcaa">${key}</span>: <span style="color: #858585">${prevStr}</span> → <span style="color: #4ec9b0">${valStr}</span>`;
      }
      case 'effect:run': {
        const name = (d as { effectName?: string }).effectName || 'anonymous';
        return `<span style="color: #c586c0">${name}</span>`;
      }
      default:
        return '';
    }
  }

  function getEventIcon(type: string): string {
    switch (type) {
      case 'component:mount': return '📦';
      case 'component:unmount': return '🗑️';
      case 'state:change': return '📝';
      case 'effect:run': return '⚡';
      case 'trace:trigger': return '🔍';
      case 'server:load': return '🖥️';
      case 'server:trace': return '🖥️';
      case 'api:call': return '🌐';
      case 'hydration': return '💧';
      default: return '•';
    }
  }

  function clearTimeline(): void {
    devtoolsStore.clearTimeline();
  }

  function formatTraceData(data: unknown): string {
    if (!data) return '';
    
    const traceData = data as TraceData;
    if (traceData.stateKey && traceData.trigger) {
      return `<span style="color: #9cdcfe">${traceData.stateKey}</span> ${getTriggerInfo(data)}`;
    }
    if (traceData.stateKey) {
      return `<span style="color: #9cdcfe">${traceData.stateKey}</span>`;
    }
    
    const serverTrace = data as ServerTraceData;
    if (serverTrace.url) {
      const methodColor = serverTrace.method === 'GET' ? '#4ec9b0' : '#dcdcaa';
      return `<span style="color: ${methodColor}">${serverTrace.method}</span> <span style="color: #9cdcfe">${serverTrace.url}</span>`;
    }
    
    return '';
  }
</script>

<div class="timeline">
  {#if snapshots.length > 0}
    <!-- ── Time-travel toolbar ── -->
    <div class="toolbar">
      <div class="toolbar-group">
        <!-- Record toggle -->
        <button
          class="tb-btn record-btn"
          class:recording={isRecording}
          onclick={toggleRecording}
          title={isRecording ? 'Recording on \u2014 click to stop' : 'Recording off \u2014 click to start'}
        >
          <svg viewBox="0 0 12 12" width="10" height="10">
            <circle cx="6" cy="6" r="4" fill="currentColor"/>
          </svg>
        </button>

        <!-- Undo -->
        <button
          class="tb-btn"
          onclick={handleUndo}
          disabled={!canUndo}
          title="Undo snapshot"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 7l3-3v2h5v3H8v2L5 7z"/>
          </svg>
        </button>

        <!-- Redo -->
        <button
          class="tb-btn"
          onclick={handleRedo}
          disabled={!canRedo}
          title="Redo snapshot"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 7L8 4v2H3v3h5v2l3-3z"/>
          </svg>
        </button>

        <!-- Snapshot counter -->
        <span class="counter">{snapshotCounter}</span>
      </div>

      <div class="toolbar-group">
        <!-- Play / Pause auto-play -->
        <button class="tb-btn" onclick={togglePlay} title={isPlaying ? 'Pause auto-play' : 'Play through snapshots'}>
          {#if isPlaying}
            <svg viewBox="0 0 16 16" width="12" height="12">
              <rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor"/>
              <rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor"/>
            </svg>
          {:else}
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path d="M5 3l8 5-8 5V3z" fill="currentColor"/>
            </svg>
          {/if}
        </button>

        <!-- Clear snapshots -->
        <button class="tb-btn clear-snapshots-btn" onclick={handleClearSnapshots} title="Clear all snapshots">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- ── Snapshot timeline dots ── -->
    <div class="dot-bar">
      {#each snapshots as snap, i (snap.id)}
        <button
          class="dot-wrap"
          class:active={currentSnapshotIndex === i}
          onclick={() => devtoolsStore.timeTravel.restore(i)}
          title={new Date(snap.timestamp).toLocaleString()}
        >
          <span class="dot"></span>
        </button>
      {/each}
    </div>

    <!-- ── "Viewing historical state" banner ── -->
    {#if isViewingHistorical}
      <div class="history-banner">
        <svg class="history-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="8" cy="8" r="6"/>
          <path d="M8 4.5V8l2.5 2.5"/>
        </svg>
        <span class="history-text">Viewing historical state</span>
        <button class="restore-btn" onclick={handleRestoreLatest}>Restore latest</button>
      </div>
    {/if}
  {/if}

  <!-- ── Filter header (existing) ── -->
  <header class="header">
    <div class="filters">
      {#each filters as f (f.id)}
        <button 
          class="filter-btn"
          class:active={filter === f.id}
          onclick={() => filter = f.id}
        >
          {f.label}
        </button>
      {/each}
    </div>
    <button class="clear-btn" onclick={clearTimeline}>Clear</button>
  </header>

  <div class="entries-split">
    <div class="entries-list">
      {#if getFilteredEntries().length > 0}
        {#each getFilteredEntries() as entry (entry.id)}
          <button
            class="entry-row"
            class:selected={selectedEntry?.id === entry.id}
            onclick={() => selectedEntry = entry}
          >
            <span class="icon">{getEventIcon(entry.type)}</span>
            <span class="entry-title">{entry.type}</span>
            <span class="time">{formatTime(entry.timestamp)}</span>
            {#if entry.duration}
              <span class="duration">{@html formatDuration(entry.duration)}</span>
            {/if}
          </button>
          {#if ['component:mount', 'state:change'].includes(entry.type)}
            <div class="entry-summary">
              <span class="detail-text">{@html formatEntryDetail(entry)}</span>
            </div>
          {/if}
        {/each}
      {:else}
        <div class="empty">No events recorded</div>
      {/if}
    </div>

    {#if selectedEntry}
      <div class="detail-panel">
        <header class="detail-header">
          <span class="detail-title">{selectedEntry.type}</span>
          <button class="detail-close" onclick={() => selectedEntry = null}>✕</button>
        </header>
        <div class="detail-meta">
          <div class="meta-row">
            <span class="meta-label">Time</span>
            <span class="meta-value">{new Date(selectedEntry.timestamp).toLocaleString()}</span>
          </div>
          {#if selectedEntry.duration}
            <div class="meta-row">
              <span class="meta-label">Duration</span>
              <span class="meta-value">{selectedEntry.duration.toFixed(2)}ms</span>
            </div>
          {/if}
        </div>
        <div class="detail-data">
          <h4 class="data-heading">Data</h4>
          <JsonTree value={selectedEntry.data} />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-surface);
  }

  /* ── Time-travel toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-inset);
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
    gap: var(--space-1);
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .tb-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tb-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .tb-btn:disabled:hover {
    background: transparent;
    color: var(--text-secondary);
  }

  .record-btn {
    color: var(--text-secondary);
  }

  .record-btn.recording {
    color: var(--error);
  }

  .record-btn.recording :global(svg) {
    animation: record-pulse 1.5s ease-in-out infinite;
  }

  @keyframes record-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .clear-snapshots-btn:hover {
    color: var(--text-error);
  }

  .counter {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-secondary);
    white-space: nowrap;
    margin-left: 6px;
    user-select: none;
  }

  /* ── Snapshot dots bar ── */
  .dot-bar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 5px var(--space-3);
    background: var(--bg-inset);
    border-bottom: 1px solid var(--border-default);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .dot-bar::-webkit-scrollbar {
    height: 3px;
  }

  .dot-bar::-webkit-scrollbar-track {
    background: transparent;
  }

  .dot-bar::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 2px;
  }

  .dot-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 50%;
    transition: background var(--transition-fast);
    flex-shrink: 0;
  }

  .dot-wrap:hover {
    background: var(--bg-hover);
  }

  .dot {
    display: block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-default);
    transition: background var(--transition-fast), transform var(--transition-fast);
  }

  .dot-wrap:hover .dot {
    background: var(--text-muted);
    transform: scale(1.15);
  }

  .dot-wrap.active .dot {
    background: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--svelte-brand-15);
  }

  .dot-wrap.active:hover .dot {
    transform: scale(1.15);
    box-shadow: 0 0 0 2.5px var(--svelte-brand-15);
  }

  /* ── Historical state banner ── */
  .history-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 5px var(--space-3);
    background: var(--bg-error);
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .history-icon {
    color: var(--warning);
    flex-shrink: 0;
  }

  .history-text {
    font-size: 11px;
    color: var(--warning);
    flex: 1;
  }

  .restore-btn {
    padding: 3px var(--space-3);
    border: 1px solid var(--border-default);
    background: var(--bg-elevated);
    color: var(--warning);
    border-radius: var(--radius-sm);
    font-size: 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .restore-btn:hover {
    background: var(--bg-hover);
    border-color: var(--warning);
  }

  /* ── Filter header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .filters {
    display: flex;
    gap: var(--space-1);
  }

  .filter-btn {
    padding: var(--space-1) var(--space-2);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 11px;
    border-radius: var(--radius-sm);
  }

  .filter-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .filter-btn.active {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .clear-btn {
    padding: var(--space-1) var(--space-3);
    border: none;
    background: var(--bg-error);
    color: var(--text-error);
    cursor: pointer;
    font-size: 11px;
    border-radius: var(--radius-sm);
  }

  .clear-btn:hover {
    background: var(--bg-error);
    filter: brightness(1.3);
  }

  /* ── Event entries split view ── */
  .entries-split {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .entries-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
  }

  .entry-row {
    display: grid;
    grid-template-columns: 24px 1fr auto auto;
    gap: var(--space-2);
    align-items: center;
    width: 100%;
    padding: 6px var(--space-2);
    border: none;
    background: transparent;
    border-bottom: 1px solid var(--border-default);
    font-size: 11px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    color: inherit;
  }

  .entry-row:hover {
    background: var(--bg-hover);
  }

  .entry-row.selected {
    background: var(--bg-elevated);
    border-left: 2px solid var(--accent-primary);
  }

  .entry-title {
    font-family: var(--font-mono);
    color: var(--syntax-key);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entry-summary {
    padding: 2px var(--space-2) 6px 32px;
    font-size: 10px;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-default);
  }

  /* ── Detail panel ── */
  .detail-panel {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border-default);
    background: var(--bg-surface);
    overflow-y: auto;
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-default);
  }

  .detail-title {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--syntax-key);
  }

  .detail-close {
    padding: 2px 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    border-radius: var(--radius-sm);
  }

  .detail-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .detail-meta {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-default);
    font-size: 11px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
  }

  .meta-label {
    color: var(--text-muted);
  }

  .meta-value {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .detail-data {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    overflow-y: auto;
  }

  .data-heading {
    margin: 0 0 var(--space-2);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }

  .icon {
    text-align: center;
  }

  .time {
    color: var(--text-secondary);
    font-size: 10px;
    white-space: nowrap;
  }

  .duration {
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .trace-info {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--syntax-string);
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    font-size: 12px;
  }
</style>
