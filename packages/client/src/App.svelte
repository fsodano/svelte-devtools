<script lang="ts">
  import Sidebar from "./components/Sidebar.svelte";
  import Dashboard from "./components/Dashboard.svelte";
  import ComponentTree from "./components/ComponentTree.svelte";
  import ComponentDetail from "./components/ComponentDetail.svelte";
  import Timeline from "./components/Timeline.svelte";
  import TimeTravelConsole from "./components/TimeTravelConsole.svelte";
  import ComponentGraph from "./components/ComponentGraph.svelte";
  import NetworkDesk from "./components/NetworkDesk.svelte";
  import RouterHub from "./components/RouterHub.svelte";
  import Assets from "./components/Assets.svelte";
  import MigrationScore from "./components/MigrationScore.svelte";
  import Settings from "./components/Settings.svelte";
  import { devtoolsStore } from "./lib/stores/devtools-store.svelte";

  let activeTab = $state("info");
  let selectedComponent = $state<string | null>(null);

  const components = $derived(devtoolsStore.components);
  const isConnected = $derived(devtoolsStore.isConnected);

  const isDebug = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__SVELTE_DEVTOOLS_DEBUG__;
</script>

<div class="panel">
  <header class="status-bar">
    <div class="status-left">
      <span class="brand">
        <svg class="brand-icon" viewBox="0 0 98.1 118" width="12" height="15" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path fill="#FF3E00" d="M91.8,15.6C80.9-0.1,59.2-4.7,43.6,5.2L16.1,22.8C8.6,27.5,3.4,35.2,1.9,43.9c-1.3,7.3-0.2,14.8,3.3,21.3c-2.4,3.6-4,7.6-4.7,11.8c-1.6,8.9,0.5,18.1,5.7,25.4c11,15.7,32.6,20.3,48.2,10.4l27.5-17.5c7.5-4.7,12.7-12.4,14.2-21.1c1.3-7.3,0.2-14.8-3.3-21.3c2.4-3.6,4-7.6,4.7-11.8C99.2,32.1,97.1,22.9,91.8,15.6"/>
          <path fill="#FFFFFF" d="M40.9,103.9c-8.9,2.3-18.2-1.2-23.4-8.7c-3.2-4.4-4.4-9.9-3.5-15.3c0.2-0.9,0.4-1.7,0.6-2.6l0.5-1.6l1.4,1c3.3,2.4,6.9,4.2,10.8,5.4l1,0.3l-0.1,1c-0.1,1.4,0.3,2.9,1.1,4.1c1.6,2.3,4.4,3.4,7.1,2.7c0.6-0.2,1.2-0.4,1.7-0.7L65.5,72c1.4-0.9,2.3-2.2,2.6-3.8c0.3-1.6-0.1-3.3-1-4.6c-1.6-2.3-4.4-3.3-7.1-2.6c-0.6,0.2-1.2,0.4-1.7,0.7l-10.5,6.7c-1.7,1.1-3.6,1.9-5.6,2.4c-8.9,2.3-18.2-1.2-23.4-8.7c-3.1-4.4-4.4-9.9-3.4-15.3c0.9-5.2,4.1-9.9,8.6-12.7l27.5-17.5c1.7-1.1,3.6-1.9,5.6-2.5c8.9-2.3,18.2,1.2,23.4,8.7c3.2,4.4,4.4,9.9,3.5,15.3c-0.2,0.9-0.4,1.7-0.7,2.6l-0.5,1.6l-1.4-1c-3.3-2.4-6.9-4.2-10.8-5.4l-1-0.3l0.1-1c0.1-1.4-0.3-2.9-1.1-4.1c-1.6-2.3-4.4-3.3-7.1-2.6c-0.6,0.2-1.2,0.4-1.7,0.7L32.4,46.1c-1.4,0.9-2.3,2.2-2.6,3.8s0.1,3.3,1,4.6c1.6,2.3,4.4,3.3,7.1,2.6c0.6-0.2,1.2-0.4,1.7-0.7l10.5-6.7c1.7-1.1,3.6-1.9,5.6-2.5c8.9-2.3,18.2,1.2,23.4,8.7c3.2,4.4,4.4,9.9,3.5,15.3c-0.9,5.2-4.1,9.9-8.6,12.7l-27.5,17.5C44.8,102.5,42.9,103.3,40.9,103.9"/>
        </svg>
        Svelte DevTools
      </span>
    </div>
    <div class="status-right">
      <span class="status-pill" class:connected={isConnected} class:disconnected={!isConnected}>
        <span class="status-dot"></span>
        {isConnected ? "Connected" : "Disconnected"}
      </span>
    </div>
  </header>

  <div class="main">
    <Sidebar bind:activeTab />
    <div class="content">
      {#if activeTab === "info"}
        <Dashboard navigate={(tab: string) => activeTab = tab} />
      {:else if activeTab === "components"}
        <div class="split-view">
          <ComponentTree
            {components}
            onSelect={(id) => (selectedComponent = id)}
            selectedId={selectedComponent}
          />
          {#if selectedComponent}
            <ComponentDetail componentId={selectedComponent} />
          {:else}
            <div class="empty">
              {#if components.length === 0}
                <span>No components found.</span>
                <button class="refresh-btn" onclick={() => devtoolsStore.refresh()}>
                  Refresh
                </button>
              {:else}
                Select a component
              {/if}
            </div>
          {/if}
        </div>
      {:else if activeTab === "timeline"}
        <Timeline />
      {:else if activeTab === "timetravel"}
        <TimeTravelConsole />
      {:else if activeTab === "graph"}
        <ComponentGraph />
      {:else if activeTab === "network"}
        <NetworkDesk />
      {:else if activeTab === "router"}
        <RouterHub />
      {:else if activeTab === "assets"}
        <Assets />
      {:else if activeTab === "migration"}
        <MigrationScore />
      {:else if activeTab === "settings"}
        <Settings />
      {/if}
    </div>
  </div>
</div>

<style>
  .panel { display: flex; flex-direction: column; height: 100vh; background: var(--bg-base); color: var(--text-primary); font-family: var(--font-ui); }
  .status-bar { display: flex; align-items: center; padding: 0 var(--space-3); height: 36px; background: var(--bg-sidebar); flex-shrink: 0; gap: var(--space-3); }
  .status-left { display: flex; align-items: center; gap: var(--space-2); }
  .brand { display: inline-flex; align-items: center; gap: var(--space-1); font-weight: 600; font-size: 12px; color: var(--text-inverse); }
  .brand-icon { flex-shrink: 0; }
  .status-right { margin-left: auto; display: flex; align-items: center; }
  .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 500; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); }
  .status-pill.connected { background: rgba(48,209,88,0.15); color: #30d158; }
  .status-pill.disconnected { background: rgba(255,69,58,0.15); color: #ff453a; }
  .status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .main { display: flex; flex: 1; overflow: hidden; }
  .content { flex: 1; min-height: 0; overflow: hidden; background: var(--bg-base); }
  .split-view { display: grid; grid-template-columns: 1fr 1fr; height: 100%; min-height: 0; gap: 1px; background: var(--border-default); }
  .split-view > :global(*) { background: var(--bg-surface); min-height: 0; overflow: hidden; }
  .empty { display: flex; align-items: center; justify-content: center; background: var(--bg-surface); color: var(--text-muted); font-size: 13px; }
  .refresh-btn { margin-left: var(--space-2); padding: var(--space-1) var(--space-2); font-size: 11px; }
</style>
