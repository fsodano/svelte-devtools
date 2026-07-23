<script lang="ts">
  import Sidebar from "./components/Sidebar.svelte";
  import ComponentTree from "./components/ComponentTree.svelte";
  import ComponentDetail from "./components/ComponentDetail.svelte";
  import Timeline from "./components/Timeline.svelte";
  import ServerView from "./components/ServerView.svelte";
  import MigrationScore from "./components/MigrationScore.svelte";
  import { devtoolsStore } from "./lib/stores/devtools-store.svelte";

  let activeTab = $state("components");
  let selectedComponent = $state<string | null>(null);

  function handleSelectComponent(id: string) {
    selectedComponent = id;
  }

  const components = $derived(devtoolsStore.components);
  const isConnected = $derived(devtoolsStore.isConnected);

  const isDebug = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__SVELTE_DEVTOOLS_DEBUG__;

  function log(msg: string) {
    if (isDebug) console.log("[Svelte DevTools]", msg);
    if (isDebug) {
      const debug = document.getElementById("debug");
      if (debug) {
        debug.style.display = "block";
        debug.innerHTML += msg + "<br>";
      }
    }
  }

  $effect(() => {
    if (isConnected) log("UI connected to store");
  });
</script>

<div class="panel">
  <header class="status-bar">
    <div class="status-left">
      <span class="brand">
        <svg class="brand-icon" viewBox="0 0 98.1 118" width="14" height="17" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path fill="#FF3E00" d="M91.8,15.6C80.9-0.1,59.2-4.7,43.6,5.2L16.1,22.8C8.6,27.5,3.4,35.2,1.9,43.9c-1.3,7.3-0.2,14.8,3.3,21.3c-2.4,3.6-4,7.6-4.7,11.8c-1.6,8.9,0.5,18.1,5.7,25.4c11,15.7,32.6,20.3,48.2,10.4l27.5-17.5c7.5-4.7,12.7-12.4,14.2-21.1c1.3-7.3,0.2-14.8-3.3-21.3c2.4-3.6,4-7.6,4.7-11.8C99.2,32.1,97.1,22.9,91.8,15.6"/>
          <path fill="#FFFFFF" d="M40.9,103.9c-8.9,2.3-18.2-1.2-23.4-8.7c-3.2-4.4-4.4-9.9-3.5-15.3c0.2-0.9,0.4-1.7,0.6-2.6l0.5-1.6l1.4,1c3.3,2.4,6.9,4.2,10.8,5.4l1,0.3l-0.1,1c-0.1,1.4,0.3,2.9,1.1,4.1c1.6,2.3,4.4,3.4,7.1,2.7c0.6-0.2,1.2-0.4,1.7-0.7L65.5,72c1.4-0.9,2.3-2.2,2.6-3.8c0.3-1.6-0.1-3.3-1-4.6c-1.6-2.3-4.4-3.3-7.1-2.6c-0.6,0.2-1.2,0.4-1.7,0.7l-10.5,6.7c-1.7,1.1-3.6,1.9-5.6,2.4c-8.9,2.3-18.2-1.2-23.4-8.7c-3.1-4.4-4.4-9.9-3.4-15.3c0.9-5.2,4.1-9.9,8.6-12.7l27.5-17.5c1.7-1.1,3.6-1.9,5.6-2.5c8.9-2.3,18.2,1.2,23.4,8.7c3.2,4.4,4.4,9.9,3.5,15.3c-0.2,0.9-0.4,1.7-0.7,2.6l-0.5,1.6l-1.4-1c-3.3-2.4-6.9-4.2-10.8-5.4l-1-0.3l0.1-1c0.1-1.4-0.3-2.9-1.1-4.1c-1.6-2.3-4.4-3.3-7.1-2.6c-0.6,0.2-1.2,0.4-1.7,0.7L32.4,46.1c-1.4,0.9-2.3,2.2-2.6,3.8s0.1,3.3,1,4.6c1.6,2.3,4.4,3.3,7.1,2.6c0.6-0.2,1.2-0.4,1.7-0.7l10.5-6.7c1.7-1.1,3.6-1.9,5.6-2.5c8.9-2.3,18.2,1.2,23.4,8.7c3.2,4.4,4.4,9.9,3.5,15.3c-0.9,5.2-4.1,9.9-8.6,12.7l-27.5,17.5C44.8,102.5,42.9,103.3,40.9,103.9"/>
        </svg>
        Svelte DevTools
      </span>
    </div>

    <div class="status-center">
      <span class="status-pill" class:connected={isConnected} class:disconnected={!isConnected}>
        <span class="status-dot"></span>
        {isConnected ? "Connected" : "Disconnected"}
      </span>
    </div>

    <div class="status-right">
      <span class="stat-item">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        {components.length} components
      </span>
    </div>
  </header>

  <div class="main">
    <Sidebar bind:activeTab />
    <div class="content">
      {#if activeTab === "components"}
        <div class="split-view">
          <ComponentTree
            {components}
            onSelect={handleSelectComponent}
            selectedId={selectedComponent}
          />
          {#if selectedComponent}
            <div class="key-wrap">
              {#key selectedComponent}
                <ComponentDetail componentId={selectedComponent} />
              {/key}
            </div>
          {:else}
            <div class="empty">
              {components.length === 0
                ? "No components found. Is this a Svelte page?"
                : "Select a component"}
            </div>
          {/if}
        </div>
      {:else if activeTab === "timeline"}
        <Timeline />
      {:else if activeTab === "server"}
        <ServerView />
      {:else if activeTab === "migration"}
        <MigrationScore />
      {/if}
    </div>
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: var(--font-ui);
  }

  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-4);
    height: 40px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .status-left {
    display: flex;
    align-items: center;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
    font-size: 13px;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }

  .brand-icon {
    flex-shrink: 0;
  }

  .status-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 500;
    background: var(--bg-inset);
    color: var(--text-muted);
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .status-pill.connected {
    background: var(--bg-connected);
    color: var(--status-connected);
  }

  .status-pill.disconnected {
    background: var(--bg-disconnected);
    color: var(--status-disconnected);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .status-right {
    display: flex;
    align-items: center;
  }

  .stat-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-base);
  }

  .split-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 100%;
    min-height: 0;
    gap: 1px;
    background: var(--border-default);
  }

  .split-view > :global(*) {
    background: var(--bg-surface);
    min-height: 0;
    overflow: hidden;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-surface);
    color: var(--text-muted);
    font-size: 13px;
  }
</style>
