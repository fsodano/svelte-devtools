<script lang="ts">
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';

  interface SvelteKitRoute {
    id: string;
    cleanedUrl: string;
    files: {
      page?: boolean; layout?: boolean; serverPage?: boolean;
      serverLoad?: boolean; endpoint?: boolean; error?: boolean;
    };
    routeGroup?: string;
    paramNames?: string[];
  }

  let routes = $state<SvelteKitRoute[]>([]);
  let loading = $state(true);
  let error = $state('');
  let filterText = $state('');
  let selectedRoute = $state<SvelteKitRoute | null>(null);

  $effect(() => {
    fetchRoutes();
  });

  async function fetchRoutes() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/__svelte-devtools/api/routes');
      if (!res.ok) { error = `API returned ${res.status}`; loading = false; return; }
      const data = await res.json();
      if (data.ok && Array.isArray(data.routes)) {
        routes = data.routes;
      } else {
        error = 'Unexpected API response';
      }
    } catch (e) {
      error = (e as Error).message;
    }
    loading = false;
  }

  const filtered = $derived(
    filterText
      ? routes.filter(r =>
          r.cleanedUrl.toLowerCase().includes(filterText.toLowerCase()) ||
          r.id.toLowerCase().includes(filterText.toLowerCase())
        )
      : routes
  );

  function navigateToRoute(route: SvelteKitRoute): void {
    // Use postMessage instead of direct window.top.location.href because in the
    // Vite DevTools popup context, window.top IS the popup, not the app frame.
    // The runtime's message listener (index.ts:559) picks this up and navigates.
    window.parent.postMessage({ type: 'svelte-devtools-navigate', url: route.cleanedUrl }, '*');
  }

  function getFileBadges(files: SvelteKitRoute['files']): { label: string; color: string }[] {
    const badges: { label: string; color: string }[] = [];
    if (files.page) badges.push({ label: 'page', color: '#22c55e' });
    if (files.layout) badges.push({ label: 'layout', color: '#3b82f6' });
    if (files.endpoint) badges.push({ label: 'api', color: '#f59e0b' });
    if (files.error) badges.push({ label: 'error', color: '#ef4444' });
    return badges;
  }

  // Determine active route from the first server event with a routeId
  let activeRouteId = $derived(
    (devtoolsStore.serverEvents as Array<{ data?: { routeId?: string } }>).find(e => e.data?.routeId)?.data?.routeId || null
  );
</script>

<div class="router-panel">
  <div class="router-header">
    <span class="router-title">Router Hub</span>
    <div class="router-actions">
      <span class="route-count">{routes.length} route{routes.length !== 1 ? 's' : ''}</span>
      <button class="refresh-btn" onclick={fetchRoutes} disabled={loading}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 8a6 6 0 0 1 11.5-3.5M14 8a6 6 0 0 1-11.5 3.5"/><path d="M14 2v3.5H10.5M2 14v-3.5h3.5"/></svg>
      </button>
    </div>
  </div>

  <div class="router-search">
    <input type="text" bind:value={filterText} placeholder="Filter routes..." class="search-input" />
  </div>

  <div class="router-list">
    {#if loading}
      <div class="empty-state">Scanning routes...</div>
    {:else if error}
      <div class="empty-state error-state">{error}</div>
    {:else if filtered.length === 0 && !loading}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
        <span>{routes.length === 0 ? 'No routes detected' : 'No routes match filter'}</span>
        {#if routes.length === 0}
          <span class="empty-hint">Is this a SvelteKit app with a src/routes directory?</span>
        {/if}
      </div>
    {:else}
      {#each filtered as route (route.id)}
        <div class="route-card" class:active={route.cleanedUrl === activeRouteId}>
          <div class="route-path" onclick={() => selectedRoute = route}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            <span class="path-text">{route.cleanedUrl}</span>
            {#if route.paramNames && route.paramNames.length > 0}
              <span class="param-indicator">:{route.paramNames.join(', :')}</span>
            {/if}
          </div>
          <div class="route-badges">
            {#each getFileBadges(route.files) as badge}
              <span class="file-badge" style="background: {badge.color}">{badge.label}</span>
            {/each}
            {#if route.routeGroup}
              <span class="file-badge group-badge">{route.routeGroup}</span>
            {/if}
            {#if activeRouteId === route.cleanedUrl}
              <span class="file-badge active-badge">active</span>
            {/if}
            <button class="visit-btn" onclick={(e) => { e.stopPropagation(); navigateToRoute(route); }} title="Navigate to this route">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>



<style>
  .router-panel { display: flex; flex-direction: column; height: 100%; }
  .router-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); flex-shrink: 0; }
  .router-title { font-size: 12px; font-weight: 600; }
  .router-actions { display: flex; align-items: center; gap: var(--space-2); }
  .route-count { font-size: 10px; color: var(--text-muted); }
  .refresh-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); }
  .refresh-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .router-search { padding: var(--space-1) var(--space-3); border-bottom: 1px solid var(--border-default); }
  .search-input { width: 100%; padding: var(--space-1) var(--space-2); font-size: 11px; background: var(--bg-inset); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--radius-sm); box-sizing: border-box; }
  .router-list { flex: 1; overflow-y: auto; min-height: 0; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); height: 150px; color: var(--text-muted); font-size: 12px; padding: var(--space-3); text-align: center; }
  .empty-state.error-state { color: var(--status-error); }
  .empty-hint { font-size: 10px; opacity: 0.7; }
  .route-card { padding: var(--space-1) var(--space-3); border-bottom: 1px solid var(--border-subtle); cursor: pointer; }
  .route-card:hover { background: var(--bg-hover); }
  .route-card.active { background: var(--svelte-brand-10); border-left: 2px solid var(--accent-primary); }
  .route-path { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) 0; color: var(--text-primary); font-size: 12px; }
  .path-text { font-family: var(--font-mono); }
  .param-indicator { font-size: 10px; color: var(--warning); font-family: var(--font-mono); }
  .route-badges { display: flex; gap: 3px; padding-left: 22px; padding-bottom: var(--space-1); flex-wrap: wrap; }
  .file-badge { display: inline-block; padding: 0 5px; border-radius: 3px; color: white; font-size: 9px; font-weight: 700; line-height: 16px; }
  .group-badge { background: rgba(139, 92, 246, 0.2) !important; color: #8b5cf6 !important; }
  .active-badge { background: rgba(52, 199, 89, 0.2) !important; color: #34c759 !important; }
  .visit-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); margin-left: auto; }
  .visit-btn:hover { background: var(--bg-hover); color: var(--accent-primary); }

</style>
