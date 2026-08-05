<script lang="ts">
  let { activeTab = $bindable() }: { activeTab: string } = $props();

  const tabs = [
    {
      id: 'info',
      label: 'Info',
      icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    },
    {
      id: 'components',
      label: 'Components',
      icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    },
    {
      id: 'timeline',
      label: 'Events',
      icon: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    },
    {
      id: 'timetravel',
      label: 'Time Travel',
      icon: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    },
    {
      id: 'graph',
      label: 'Graph',
      icon: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="19" r="2"/><line x1="6.5" y1="7" x2="10.5" y2="17"/><line x1="17.5" y1="7" x2="13.5" y2="17"/><line x1="7" y1="6" x2="17" y2="6"/>',
    },
    {
      id: 'network',
      label: 'Network',
      icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    },
    {
      id: 'router',
      label: 'Router',
      icon: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V7a4 4 0 0 1 4-4h6"/><path d="M18 7v10a4 4 0 0 1-4 4H8"/>',
    },
    {
      id: 'assets',
      label: 'Assets',
      icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    },
    {
      id: 'migration',
      label: 'Migrate',
      icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    },
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
      <span class="icon">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >{@html tab.icon}</svg>
      </span>
      <span class="label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .sidebar {
    width: 64px;
    background: var(--bg-sidebar);
    display: flex;
    flex-direction: column;
    padding: var(--space-2);
    flex-shrink: 0;
    overflow-y: auto;
    gap: var(--space-1);
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    width: 48px;
    height: 48px;
    margin: 0 auto;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 10px;
    font-family: var(--font-ui);
    border-radius: var(--radius-lg);
    position: relative;
  }
  .tab svg { display: block; }
  .tab:hover { color: var(--text-primary); background: var(--bg-hover); }
  .tab.active { color: var(--svelte-brand); background: var(--svelte-brand-15); }
  .tab.active::before {
    content: '';
    position: absolute;
    left: calc(-1 * var(--space-2));
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 24px;
    background: var(--svelte-brand);
    border-radius: 0 2px 2px 0;
  }
  .label { font-size: 10px; font-weight: 500; letter-spacing: 0.3px; }
</style>
