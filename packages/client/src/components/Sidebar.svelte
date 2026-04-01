<script lang="ts">
  let { activeTab = $bindable() }: { activeTab: string } = $props();

  const tabs = [
    { id: 'components', label: 'Components', icon: '🧩' },
    { id: 'timeline', label: 'Timeline', icon: '⏱️' },
    { id: 'server', label: 'Server', icon: '🖥️' }
  ];
</script>

<nav class="sidebar">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={activeTab === tab.id}
      onclick={() => activeTab = tab.id}
    >
      <span class="icon">{tab.icon}</span>
      <span class="label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .sidebar {
    width: 48px;
    background: #252526;
    border-right: 1px solid #333;
    display: flex;
    flex-direction: column;
    padding: 8px 0;
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 4px;
    border: none;
    background: transparent;
    color: #858585;
    cursor: pointer;
    transition: all 0.15s;
    font-size: 10px;
  }

  .tab:hover {
    color: #cccccc;
    background: #2a2d2e;
  }

  .tab.active {
    color: #ffffff;
    background: #37373d;
  }

  .icon {
    font-size: 16px;
  }

  .label {
    font-size: 9px;
  }
</style>