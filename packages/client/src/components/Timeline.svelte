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

  let entries = $state<TimelineEntry[]>([]);
  let filter = $state<string>('all');

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
    entries = [];
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

  <div class="entries">
    {#if getFilteredEntries().length > 0}
      {#each getFilteredEntries() as entry (entry.id)}
        <div class="entry">
          <span class="icon">{getEventIcon(entry.type)}</span>
          <span class="type">{entry.type}</span>
          <span class="time">{formatTime(entry.timestamp)}</span>
          {#if entry.type === 'trace:trigger'}
            <span class="trace-info">{@html formatTraceData(entry.data)}</span>
          {/if}
           {#if entry.duration}
             <span class="duration">{@html formatDuration(entry.duration)}</span>
           {/if}
           {#if entry.type === 'server:trace'}
             <span class="trace-info">{@html formatTraceData(entry.data)}</span>
           {/if}
         </div>
      {/each}
    {:else}
      <div class="empty">No events recorded</div>
    {/if}
  </div>
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #252526;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #333;
  }

  .filters {
    display: flex;
    gap: 4px;
  }

  .filter-btn {
    padding: 4px 8px;
    border: none;
    background: transparent;
    color: #858585;
    cursor: pointer;
    font-size: 11px;
    border-radius: 3px;
  }

  .filter-btn:hover {
    background: #2a2d2e;
    color: #cccccc;
  }

  .filter-btn.active {
    background: #37373d;
    color: #ffffff;
  }

  .clear-btn {
    padding: 4px 12px;
    border: none;
    background: #5a1d1d;
    color: #f48771;
    cursor: pointer;
    font-size: 11px;
    border-radius: 3px;
  }

  .clear-btn:hover {
    background: #7a2d2d;
  }

  .entries {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .entry {
    display: grid;
    grid-template-columns: 24px 1fr auto auto;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid #333;
    font-size: 11px;
  }

  .entry:hover {
    background: #2a2d2e;
  }

  .icon {
    text-align: center;
  }

  .type {
    font-family: 'Monaco', 'Menlo', monospace;
    color: #9cdcfe;
  }

  .time {
    color: #858585;
    font-size: 10px;
  }

  .duration {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 10px;
  }

  .trace-info {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 10px;
    color: #ce9178;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #858585;
    font-size: 12px;
  }
</style>
