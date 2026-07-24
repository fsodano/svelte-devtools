<script lang="ts">
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';

  let { navigate }: { navigate?: (tab: string) => void } = $props();

  const components = $derived(devtoolsStore.components);
  const snapshots = $derived(devtoolsStore.timeTravel.snapshots);
  const isConnected = $derived(devtoolsStore.isConnected);

  let svelteVersion = $state('?');
  let viteVersion = $state('?');
  let svelteKitVersion = $state('?');

  $effect(() => {
    try {
      const parentApi = (window.parent || window) as unknown as Record<string, unknown>;
      const devtools = parentApi.__SVELTE_DEVTOOLS__ as Record<string, unknown> | undefined;
      if (devtools?.versions) {
        const v = devtools.versions as Record<string, string>;
        svelteVersion = v.svelte || '?';
        viteVersion = v.vite || '?';
        svelteKitVersion = v.svelteKit || 'N/A';
      }
    } catch {}
  });

  const stats = $derived({
    componentCount: components.length,
    snapshotCount: snapshots.length,
    stateCount: components.reduce((sum, c) => sum + Object.keys(c.state || {}).length, 0),
    propsCount: components.reduce((sum, c) => sum + Object.keys(c.props || {}).length, 0),
    mountCount: devtoolsStore.timeline.filter(e => e.type === 'component:mount').length,
  });

  function go(tab: string) { navigate?.(tab); }
</script>

<div class="dashboard">
  <header class="dash-header">
    <div class="dash-logo">
      <svg viewBox="0 0 107 128" width="32" height="38"><path d="M94.1566,22.8189c-10.4-14.8851-30.94-19.2971-45.7914-9.8348L22.2825,29.6078A29.9234,29.9234,0,0,0,8.7639,49.6506a31.5136,31.5136,0,0,0,3.1076,20.2318A30.0061,30.0061,0,0,0,7.3953,81.0653a31.8886,31.8886,0,0,0,5.4473,24.1157c10.4022,14.8865,30.9423,19.2966,45.7914,9.8348L84.7167,98.3921A29.9177,29.9177,0,0,0,98.2353,78.3493,31.5263,31.5263,0,0,0,95.13,58.117a30,30,0,0,0,4.4743-11.1824,31.88,31.88,0,0,0-5.4473-24.1157" fill="#FF3E00"/><path d="M45.8171,106.5815A20.7182,20.7182,0,0,1,23.58,98.3389a19.1739,19.1739,0,0,1-3.2766-14.5025,18.1886,18.1886,0,0,1,.6233-2.4357l.4912-1.4978,1.3363.9815a33.6443,33.6443,0,0,0,10.203,5.0978l.9694.2941-.0893.9675a5.8474,5.8474,0,0,0,1.052,3.8781,6.2389,6.2389,0,0,0,6.6952,2.485,5.7449,5.7449,0,0,0,1.6021-.7041L69.27,76.281a5.4306,5.4306,0,0,0,2.4506-3.631,5.7948,5.7948,0,0,0-.9875-4.3712,6.2436,6.2436,0,0,0-6.6978-2.4864,5.7427,5.7427,0,0,0-1.6.7036l-9.9532,6.3449a19.0329,19.0329,0,0,1-5.2965,2.3259,20.7181,20.7181,0,0,1-22.2368-8.2427,19.1725,19.1725,0,0,1-3.2766-14.5024,17.9885,17.9885,0,0,1,8.13-12.0513L55.8833,23.7472a19.0038,19.0038,0,0,1,5.3-2.3287A20.7182,20.7182,0,0,1,83.42,29.6611a19.1739,19.1739,0,0,1,3.2766,14.5025,18.4,18.4,0,0,1-.6233,2.4357l-.4912,1.4978-1.3356-.98a33.6175,33.6175,0,0,0-10.2037-5.1l-.9694-.2942.0893-.9675a5.8588,5.8588,0,0,0-1.052-3.878,6.2389,6.2389,0,0,0-6.6952-2.485,5.7449,5.7449,0,0,0-1.6021.7041L37.73,51.719a5.4218,5.4218,0,0,0-2.4487,3.63,5.7862,5.7862,0,0,0,.9856,4.3717,6.2437,6.2437,0,0,0,6.6978,2.4864,5.7652,5.7652,0,0,0,1.602-.7041l9.9519-6.3425a18.978,18.978,0,0,1,5.2959-2.3278,20.7181,20.7181,0,0,1,22.2368,8.2427,19.1725,19.1725,0,0,1,3.2766,14.5024,17.9977,17.9977,0,0,1-8.13,12.0532L51.1167,104.2528a19.0038,19.0038,0,0,1-5.3,2.3287" fill="#fff"/></svg>
      <div>
        <h1 class="dash-title">Svelte DevTools</h1>
        <p class="dash-subtitle">Debugging toolkit for Svelte 5</p>
      </div>
    </div>
  </header>

  <div class="dash-grid">
    <button class="dash-card status-card" onclick={() => go('components')}>
      <div class="card-header">
        <span class="status-dot" class:connected={isConnected}></span>
        <span class="card-title">Status</span>
      </div>
      <div class="card-body">
        <div class="stat-row">
          <span class="stat-label">Connection</span>
          <span class="stat-value" class:connected={isConnected}>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Recording</span>
          <span class="stat-value">{devtoolsStore.isRecording ? 'Active' : 'Paused'}</span>
        </div>
      </div>
    </button>

    <button class="dash-card" onclick={() => go('components')}>
      <div class="card-header">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        <span class="card-title">Components</span>
      </div>
      <div class="card-body">
        <div class="stat-row"><span class="stat-label">Registered</span><span class="stat-value">{stats.componentCount}</span></div>
        <div class="stat-row"><span class="stat-label">Mounts</span><span class="stat-value">{stats.mountCount}</span></div>
        <div class="stat-row"><span class="stat-label">State variables</span><span class="stat-value">{stats.stateCount}</span></div>
        <div class="stat-row"><span class="stat-label">Props</span><span class="stat-value">{stats.propsCount}</span></div>
      </div>
    </button>

    <button class="dash-card" onclick={() => go('timeline')}>
      <div class="card-header">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span class="card-title">Events Timeline</span>
      </div>
      <div class="card-body">
        <div class="stat-row"><span class="stat-label">Timeline events</span><span class="stat-value">{devtoolsStore.timeline.length}</span></div>
        <div class="stat-row"><span class="stat-label">Recording</span><span class="stat-value">{devtoolsStore.isRecording ? 'Active' : 'Paused'}</span></div>
      </div>
    </button>

    <button class="dash-card" onclick={() => go('time-travel')}>
      <div class="card-header">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span class="card-title">Time Travel</span>
      </div>
      <div class="card-body">
        <div class="stat-row"><span class="stat-label">Snapshots</span><span class="stat-value">{stats.snapshotCount}</span></div>
        <div class="stat-row"><span class="stat-label">State changes tracked</span><span class="stat-value">{stats.stateCount}</span></div>
      </div>
    </button>

    <button class="dash-card" onclick={() => go('network')}>
      <div class="card-header">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33"/><path d="M4.6 15a1.65 1.65 0 0 1-.33 1.82l-.06.06a2 2 0 0 0 2.83 2.83l.06-.06a1.65 1.65 0 0 1 1.82-.33"/><path d="M12 2v4"/><path d="M12 18v4"/></svg>
        <span class="card-title">Network</span>
      </div>
      <div class="card-body">
        <div class="stat-row"><span class="stat-label">Server traces</span><span class="stat-value">—</span></div>
        <div class="stat-row"><span class="stat-label">Mock rules</span><span class="stat-value">0</span></div>
      </div>
    </button>

    <button class="dash-card" onclick={() => go('router')}>
      <div class="card-header">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
        <span class="card-title">Router</span>
      </div>
      <div class="card-body">
        <div class="stat-row"><span class="stat-label">Routes</span><span class="stat-value">—</span></div>
      </div>
    </button>

    <button class="dash-card" onclick={() => go('graph')}>
      <div class="card-header">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><line x1="5" y1="6" x2="19" y2="6"/><line x1="7" y1="7" x2="12" y2="16"/><line x1="17" y1="7" x2="12" y2="16"/></svg>
        <span class="card-title">Component Graph</span>
      </div>
      <div class="card-body">
        <div class="stat-row"><span class="stat-label">Components</span><span class="stat-value">{stats.componentCount}</span></div>
      </div>
    </button>

    <button class="dash-card" onclick={() => go('migration')}>
      <div class="card-header">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        <span class="card-title">Migration Score</span>
      </div>
      <div class="card-body">
        <div class="stat-row"><span class="stat-label">Scanned files</span><span class="stat-value">—</span></div>
      </div>
    </button>
  </div>

  {#if !isConnected}
    <div class="dash-tip">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 22v-4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M22 12h-4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      <span>No Svelte application detected. Open a Svelte page in the browser to begin debugging.</span>
    </div>
  {/if}
</div>

<style>
  .dashboard { padding: var(--space-4); overflow-y: auto; height: 100%; }
  .dash-header { margin-bottom: var(--space-5); }
  .dash-logo { display: flex; align-items: center; gap: var(--space-3); }
  .dash-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--text-primary); }
  .dash-subtitle { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
  .dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-3); }
  .dash-card { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-lg); overflow: hidden; cursor: pointer; }
  .card-header { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3); border-bottom: 1px solid var(--border-default); color: var(--text-secondary); font-size: 12px; }
  .card-title { font-weight: 600; color: var(--text-primary); }
  .card-body { padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
  .stat-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
  .stat-label { color: var(--text-muted); }
  .stat-value { color: var(--text-primary); font-weight: 500; }
  .stat-value.connected { color: var(--status-connected); }
  .stat-value.mono { font-family: var(--font-mono); font-size: 11px; }
  .status-card { border-left: 3px solid var(--status-disconnected); }
  .status-card:has(.connected) { border-left-color: var(--status-connected); }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--status-disconnected); flex-shrink: 0; }
  .status-dot.connected { background: var(--status-connected); box-shadow: 0 0 4px var(--status-connected); }
  .dash-tip { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); padding: var(--space-3); background: var(--bg-error); border-radius: var(--radius-md); font-size: 12px; color: var(--text-error); }
</style>
