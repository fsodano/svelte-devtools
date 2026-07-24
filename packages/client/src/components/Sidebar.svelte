<script lang="ts">
  let { activeTab = $bindable() }: { activeTab: string } = $props();

  const tabs = [
    { id: 'info', label: 'Info' },
    { id: 'components', label: 'Components' },
    { id: 'timeline', label: 'Events' },
    { id: 'timetravel', label: 'Time Travel' },
    { id: 'graph', label: 'Graph' },
    { id: 'network', label: 'Network' },
    { id: 'router', label: 'Router' },
    { id: 'assets', label: 'Assets' },
    { id: 'migration', label: 'Migrate' },
    { id: 'settings', label: 'Settings' },
  ];
</script>

<nav class="sidebar">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={activeTab === tab.id}
      onclick={() => activeTab = tab.id}
      title={tab.label}
    >
      <span class="label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .sidebar {
    width: 56px;
    background: var(--bg-sidebar);
    display: flex;
    flex-direction: column;
    padding: var(--space-2) 0;
    flex-shrink: 0;
    overflow-y: auto;
    gap: 1px;
  }
  .tab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    margin: 1px auto;
    border: none;
    background: transparent;
    color: rgba(255,255,255,0.45);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 10px;
    font-family: var(--font-ui);
    border-radius: var(--radius-lg);
    position: relative;
  }
  .tab:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.08); }
  .tab.active { color: var(--svelte-brand); background: rgba(255,62,0,0.12); }
  .label { font-size: 9px; font-weight: 500; letter-spacing: 0.3px; }
</style>
