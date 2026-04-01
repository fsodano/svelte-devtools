<script lang="ts">
  import Sidebar from "./components/Sidebar.svelte";
  import ComponentTree from "./components/ComponentTree.svelte";
  import ComponentDetail from "./components/ComponentDetail.svelte";
  import Timeline from "./components/Timeline.svelte";
  import ServerView from "./components/ServerView.svelte";
  import { devtoolsStore } from "./lib/stores/devtools-store.svelte";

  let activeTab = $state("components");
  let selectedComponent = $state<string | null>(null);

  const components = $derived(devtoolsStore.components);
  const isConnected = $derived(devtoolsStore.isConnected);

  function log(msg: string) {
    console.log("[Svelte DevTools]", msg);
    const debug = document.getElementById("debug");
    if (debug) {
      debug.style.display = "block";
      debug.innerHTML += msg + "<br>";
    }
  }

  // Debug log mapping events
  $effect(() => {
    if (isConnected) log("UI connected to store");
  });
</script>

<div class="panel">
  <div class="status-bar">
    <span class={isConnected ? "connected" : "disconnected"}>
      {isConnected ? "● Connected" : "● Disconnected"}
    </span>
    <span>{components.length} components</span>
  </div>

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
      {/if}
    </div>
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1e1e1e;
    color: #d4d4d4;
  }
  .status-bar {
    display: flex;
    justify-content: space-between;
    padding: 5px 10px;
    background: #252526;
    border-bottom: 1px solid #333;
    font-size: 11px;
  }
  .connected {
    color: #4ec9b0;
  }
  .disconnected {
    color: #f48771;
  }
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .content {
    flex: 1;
    overflow: hidden;
  }
  .split-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 100%;
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #252526;
    color: #858585;
  }
</style>
