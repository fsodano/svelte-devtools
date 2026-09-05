<script lang="ts">
  import { onMount } from 'svelte';
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';
  import { apiFetch } from '../lib/api.js';

  let { navigate }: { navigate?: (tab: string) => void } = $props();
  let routes = $state<number | null>(null);
  let agentReady = $state(false);
  let error = $state('');
  let loading = $state(true);
  const components = $derived(devtoolsStore.components);
  const stateCount = $derived(components.reduce((sum, c) => sum + Object.keys(c.state || {}).length, 0));
  const cards = $derived([
    { label: 'Components', value: components.length, tab: 'components', detail: 'Explore the component tree' },
    { label: 'State variables', value: stateCount, tab: 'components', detail: 'Inspect reactive values' },
    { label: 'Server requests', value: devtoolsStore.serverEvents.length, tab: 'network', detail: 'Follow request traces' },
    { label: 'Routes', value: routes === null ? '—' : routes, tab: 'router', detail: routes === 0 ? 'No SvelteKit routes found' : 'Explore your application' },
  ]);
  const tools = [
    { tab: 'components', icon: '{ }', label: 'Inspect components', detail: 'Find a component, inspect its props, and open its source.' },
    { tab: 'network', icon: '↗', label: 'Follow a request', detail: 'Inspect server traces and client network activity.' },
    { tab: 'graph', icon: '◇', label: 'Explore relationships', detail: 'See how components connect across your application.' },
    { tab: 'migration', icon: '↗', label: 'Check migration', detail: 'Review Svelte 4 patterns in transformed files.' },
  ];

  onMount(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const [statusRes, routesRes] = await Promise.all([
          apiFetch('/__svelte-devtools/api/', { signal: controller.signal }),
          apiFetch('/__svelte-devtools/api/routes', { signal: controller.signal }),
        ]);
        if (!statusRes.ok || !routesRes.ok) throw new Error('Could not read development server status.');
        const [status, routeData] = await Promise.all([statusRes.json(), routesRes.json()]);
        agentReady = status.capabilities?.runtimeData?.hasSynced === true;
        routes = Array.isArray(routeData.routes) ? routeData.routes.length : null;
        error = '';
      } catch (e) {
        if (!controller.signal.aborted) error = e instanceof Error ? e.message : 'Server unavailable';
      } finally { loading = false; }
    }
    void refresh();
    const interval = setInterval(refresh, 3000);
    return () => { controller.abort(); clearInterval(interval); };
  });
</script>

<div class="dashboard">
  <header class="dash-header">
    <div>
      <span class="eyebrow">YOUR DEVELOPMENT WORKSPACE</span>
      <h1>See what your app is doing.</h1>
      <p>Components, state, and requests. One place to understand your Svelte app.</p>
    </div>
    <span class="connection" class:connected={devtoolsStore.isConnected}>
      <span class="dot"></span>{devtoolsStore.isConnected ? 'Runtime connected' : 'Waiting for runtime'}
    </span>
  </header>

  <div class="metrics">
    {#each cards as card (card.label)}
      <button class="metric" onclick={() => navigate?.(card.tab)}>
        <span class="metric-label">{card.label}<span aria-hidden="true">↗</span></span>
        <strong>{card.value}</strong>
        <span class="metric-detail">{card.detail}</span>
      </button>
    {/each}
  </div>

  <div class="workspace-grid">
    <section class="section">
      <div class="section-heading"><h2>Start exploring</h2><span>TOOLS</span></div>
      <div class="tool-list">
        {#each tools as tool (tool.tab)}
          <button class="tool" onclick={() => navigate?.(tool.tab)}>
            <span class="tool-icon" aria-hidden="true">{tool.icon}</span>
            <span class="tool-copy"><strong>{tool.label}</strong><span>{tool.detail}</span></span>
            <span class="arrow" aria-hidden="true">→</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="section agent-section">
      <div class="section-heading"><h2>Work with your agent</h2><span class="mcp-badge">MCP</span></div>
      <p>Give your coding agent the same view of your application.</p>
      <div class="agent-status"><span class="dot" class:ready={agentReady}></span>{loading ? 'Checking runtime sync…' : agentReady ? 'Runtime data available' : 'Waiting for the first panel sync'}</div>
      <p class="agent-note">Connect <code>@fsodano/svelte-devtools-mcp</code> with your dev server URL and token. Start with <code>svelte_status</code>.</p>
      <div class="agent-footer"><span>9 agent tools</span><span>Freshness checks</span></div>
      <p class="fine-print">Keep this panel open. Agents can inspect your app and edit writable state in a selected browser session.</p>
      {#if error}<p class="error" role="status">{error}</p>{/if}
    </section>
  </div>

  <footer class="dash-footer"><span>Svelte 5 · Vite 8 · Development only</span><button onclick={() => navigate?.('settings')}>Customize your workspace <span aria-hidden="true">→</span></button></footer>
</div>

<style>
  .dashboard { padding: clamp(20px, 3vw, 36px); overflow-y: auto; height: 100%; }
  .dash-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 28px; }
  .eyebrow { font: 10px var(--font-mono); letter-spacing: 1.5px; color: var(--text-secondary); }
  h1 { margin: 10px 0 8px; font-size: clamp(21px, 2.6vw, 30px); font-weight: 650; letter-spacing: -1px; }
  p { margin: 0; font-size: 12px; line-height: 1.65; color: var(--text-secondary); }
  .connection { display: inline-flex; align-items: center; gap: 7px; padding: 7px 10px; white-space: nowrap; border: 1px solid var(--border-default); border-radius: 20px; font-size: 10px; color: var(--text-secondary); background: var(--bg-surface); }
  .connection.connected { color: var(--status-connected); }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 28px; }
  .metric { display: flex; flex-direction: column; text-align: left; padding: 18px; border: 1px solid var(--border-default); border-radius: 10px; background: var(--bg-surface); color: var(--text-primary); cursor: pointer; box-shadow: var(--shadow-sm); transition: border-color var(--transition-fast); }
  .metric:hover { border-color: var(--accent-primary); }
  .metric-label { display: flex; justify-content: space-between; width: 100%; color: var(--text-secondary); font-size: 11px; }
  .metric-label > span { color: var(--text-muted); }
  .metric strong { font: 500 32px var(--font-mono); letter-spacing: -1.5px; margin: 16px 0 10px; }
  .metric-detail { font-size: 10px; color: var(--text-secondary); line-height: 1.5; }
  .workspace-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; }
  .section-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  h2 { font-size: 13px; margin: 0; font-weight: 600; }
  .section-heading > span { font: 9px var(--font-mono); color: var(--text-muted); letter-spacing: 1px; }
  .tool-list { border: 1px solid var(--border-default); border-radius: 10px; overflow: hidden; }
  .tool { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px; border: 0; border-bottom: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-primary); text-align: left; cursor: pointer; }
  .tool:last-child { border-bottom: 0; }
  .tool:hover { background: var(--bg-hover); }
  .tool-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 7px; background: var(--bg-inset); color: var(--accent-primary); font: 16px var(--font-mono); flex-shrink: 0; }
  .tool-copy { display: flex; flex-direction: column; gap: 4px; }
  .tool-copy strong { font-size: 12px; font-weight: 550; }
  .tool-copy > span { font-size: 10px; line-height: 1.5; color: var(--text-secondary); }
  .arrow { margin-left: auto; color: var(--text-muted); }
  .agent-section { padding: 18px; border: 1px solid var(--border-default); border-radius: 10px; background: var(--bg-surface); }
  .section-heading .mcp-badge { background: var(--svelte-brand-10); color: var(--accent-primary); padding: 4px 6px; border-radius: 4px; }
  .agent-status { display: flex; gap: 7px; align-items: center; font-size: 11px; margin: 18px 0 12px; }
  .ready { color: var(--status-connected); }
  .agent-note { font-size: 11px; }
  code { font: 10px var(--font-mono); overflow-wrap: anywhere; color: var(--text-primary); }
  .agent-footer { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  .agent-footer span { font-size: 10px; padding: 4px 7px; border-radius: 4px; background: var(--bg-inset); color: var(--text-secondary); }
  .fine-print { font-size: 10px; }
  .error { color: var(--text-error); margin-top: 10px; }
  .dash-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-top: 26px; padding-top: 16px; border-top: 1px solid var(--border-default); font-size: 10px; color: var(--text-muted); }
  .dash-footer button { border: 0; background: none; color: var(--text-secondary); font-size: 10px; cursor: pointer; }
  @media (max-width: 750px) { .connection { display: none; } .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .workspace-grid { grid-template-columns: 1fr; } }
</style>
