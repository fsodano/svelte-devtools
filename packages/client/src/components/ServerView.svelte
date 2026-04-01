<script lang="ts">
  interface ServerLoad {
    route: string;
    data: Record<string, unknown>;
    duration: number;
    timestamp: number;
  }

  interface ApiCall {
    url: string;
    method: string;
    status: number;
    duration: number;
    timestamp: number;
  }

  interface ServerTrace {
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

  let activeTab = $state<'loads' | 'api' | 'database' | 'traces'>('loads');
  let serverLoads = $state<ServerLoad[]>([]);
  let apiCalls = $state<ApiCall[]>([]);
  let serverTraces = $state<ServerTrace[]>([]);
  let selectedLoad = $state<ServerLoad | null>(null);

  function formatDuration(ms: number): string {
    return ms > 1000 
      ? `${(ms / 1000).toFixed(2)}s` 
      : `${ms.toFixed(0)}ms`;
  }

  function formatData(data: Record<string, unknown>): string {
    return JSON.stringify(data, null, 2);
  }

  function getStatusColor(status: number): string {
    if (status >= 200 && status < 300) return '#4ec9b0';
    if (status >= 300 && status < 400) return '#dcdcaa';
    if (status >= 400) return '#f48771';
    return '#858585';
  }
</script>

<div class="server-view">
  <nav class="tabs">
    <button 
      class="tab"
      class:active={activeTab === 'loads'}
      onclick={() => activeTab = 'loads'}
    >
      Server Loads ({serverLoads.length})
    </button>
    <button 
      class="tab"
      class:active={activeTab === 'api'}
      onclick={() => activeTab = 'api'}
    >
      API Calls ({apiCalls.length})
    </button>
    <button 
      class="tab"
      class:active={activeTab === 'traces'}
      onclick={() => activeTab = 'traces'}
    >
      Server Traces ({serverTraces.length})
    </button>
    <button 
      class="tab"
      class:active={activeTab === 'database'}
      onclick={() => activeTab = 'database'}
    >
      Database
    </button>
  </nav>

  <div class="content">
    {#if activeTab === 'loads'}
      <div class="split">
        <div class="list">
          {#if serverLoads.length > 0}
            {#each serverLoads as load (load.route + load.timestamp)}
              <button 
                class="item"
                class:selected={selectedLoad === load}
                onclick={() => selectedLoad = load}
              >
                <span class="route">{load.route}</span>
                <span class="duration" class:slow={load.duration > 1000}>
                  {formatDuration(load.duration)}
                </span>
              </button>
            {/each}
          {:else}
            <div class="empty">No server loads recorded</div>
          {/if}
        </div>

        {#if selectedLoad}
          <div class="detail">
            <h3>{selectedLoad.route}</h3>
            <p class="meta">
              Duration: <span class:slow={selectedLoad.duration > 1000}>
                {formatDuration(selectedLoad.duration)}
              </span>
            </p>
            <pre class="data">{formatData(selectedLoad.data)}</pre>
          </div>
        {:else}
          <div class="empty">Select a server load to view details</div>
        {/if}
      </div>
    {:else if activeTab === 'api'}
      <div class="list">
        {#if apiCalls.length > 0}
          {#each apiCalls as call (call.url + call.timestamp)}
            <div class="item api-item">
              <span class="method" style="color: {call.method === 'GET' ? '#4ec9b0' : '#dcdcaa'}">
                {call.method}
              </span>
              <span class="url">{call.url}</span>
              <span class="status" style="color: {getStatusColor(call.status)}">
                {call.status}
              </span>
              <span class="duration" class:slow={call.duration > 500}>
                {formatDuration(call.duration)}
              </span>
            </div>
          {/each}
        {:else}
          <div class="empty">No API calls recorded</div>
        {/if}
      </div>
    {:else if activeTab === 'traces'}
      <div class="split">
        <div class="list">
          {#if serverTraces.length > 0}
            {#each serverTraces as trace (trace.id)}
              <button 
                class="item"
                class:selected={selectedLoad !== null && selectedLoad?.url === trace.url}
                onclick={() => selectedLoad = { route: trace.url, data: {}, duration: trace.duration || 0, timestamp: trace.startTime }}
              >
                <span class="route">{trace.method} {trace.url}</span>
                <span class="duration" class:slow={trace.duration && trace.duration > 1000}>
                  {formatDuration(trace.duration || 0)}
                </span>
              </button>
            {/each}
          {:else}
            <div class="empty">No server traces recorded</div>
          {/if}
        </div>

        {#if selectedLoad}
          <div class="detail">
            <h3>{selectedLoad.route}</h3>
            <p class="meta">
              Duration: <span class:slow={(selectedLoad as ServerLoad).duration > 1000}>
                {formatDuration((selectedLoad as ServerLoad).duration)}
              </span>
            </p>
            <pre class="data">{formatData(selectedLoad.data)}</pre>
          </div>
        {:else}
          <div class="empty">Select a server trace to view details</div>
        {/if}
      </div>
    {:else if activeTab === 'database'}
      <div class="empty">
        <p>Database tracing requires server-side instrumentation.</p>
        <p>Add the SvelteKit DevTools handle to your hooks.server.ts:</p>
        <pre class="code">import &#123; sveltekitDevtools &#125; from 'svelte-devtools/server';

export const handle = sveltekitDevtools();</pre>
      </div>
    {/if}
  </div>
</div>

<style>
  .server-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #252526;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #333;
    padding: 0 8px;
  }

  .tab {
    padding: 12px 16px;
    border: none;
    background: transparent;
    color: #858585;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }

  .tab:hover {
    color: #cccccc;
  }

  .tab.active {
    color: #ffffff;
    border-bottom: 2px solid #007acc;
  }

  .content {
    flex: 1;
    overflow: hidden;
  }

  .split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 100%;
    gap: 1px;
    background: #333;
  }

  .list {
    overflow-y: auto;
    background: #252526;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 12px;
    border: none;
    border-bottom: 1px solid #333;
    background: transparent;
    color: #cccccc;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
  }

  .item:hover {
    background: #2a2d2e;
  }

  .item.selected {
    background: #094771;
  }

  .api-item {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 12px;
  }

  .method {
    font-weight: 600;
    font-size: 11px;
    min-width: 40px;
  }

  .url {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status {
    font-weight: 600;
    font-size: 11px;
  }

  .route {
    font-family: 'Monaco', 'Menlo', monospace;
    color: #9cdcfe;
  }

  .duration {
    font-size: 11px;
    color: #858585;
  }

  .duration.slow {
    color: #f48771;
    font-weight: 600;
  }

  .detail {
    padding: 16px;
    background: #1e1e1e;
    overflow-y: auto;
  }

  .detail h3 {
    margin-bottom: 12px;
    color: #cccccc;
    font-size: 14px;
  }

  .meta {
    color: #858585;
    font-size: 12px;
    margin-bottom: 16px;
  }

  .data {
    background: #252526;
    padding: 12px;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 11px;
    color: #d4d4d4;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #858585;
    font-size: 12px;
    padding: 32px;
    text-align: center;
  }

  .code {
    margin-top: 16px;
    background: #1e1e1e;
    padding: 16px;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 11px;
    color: #d4d4d4;
    text-align: left;
    overflow-x: auto;
  }
</style>
