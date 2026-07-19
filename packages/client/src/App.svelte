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
        <svg class="brand-icon" viewBox="0 0 107 128" width="14" height="17" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path fill="#FF3E00" d="M91.9 23.5L57.3 4.8a17.5 17.5 0 0 0-17.5 0L5.2 23.5A17.5 17.5 0 0 0 0 37.7v37.6a17.5 17.5 0 0 0 5.2 14.2l34.6 18.7a17.5 17.5 0 0 0 17.5 0l34.6-18.7a17.5 17.5 0 0 0 5.2-14.2V37.7a17.5 17.5 0 0 0-5.2-14.2z"/>
          <path fill="#FFF" d="M45.4 73.2L27.6 63.6a6.8 6.8 0 0 1-3.4-5.9V38.6a6.8 6.8 0 0 1 3.4-5.9l17.8-9.6a6.8 6.8 0 0 1 6.8 0l17.8 9.6a6.8 6.8 0 0 1 3.4 5.9v19.1a6.8 6.8 0 0 1-3.4 5.9L52.2 73.2a6.8 6.8 0 0 1-6.8 0z"/>
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
            onSelect={(id) => (selectedComponent = id)}
            selectedId={selectedComponent}
          />
          {#if selectedComponent}
            <ComponentDetail componentId={selectedComponent} />
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
    overflow: hidden;
    background: var(--bg-base);
  }

  .split-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 100%;
    gap: 1px;
    background: var(--border-default);
  }

  .split-view > :global(*) {
    background: var(--bg-surface);
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
