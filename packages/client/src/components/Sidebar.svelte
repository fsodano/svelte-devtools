<script lang="ts">
  let { activeTab = $bindable() }: { activeTab: string } = $props();

  const tabs = [
    { id: 'components', label: 'Components' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'server', label: 'Server' },
    { id: 'migration', label: 'Migrate' }
  ];
</script>

<nav class="sidebar">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={activeTab === tab.id}
      onclick={() => activeTab = tab.id}
    >
      <span class="icon">
        {#if tab.id === 'components'}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/>
            <rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
        {:else if tab.id === 'timeline'}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        {:else if tab.id === 'server'}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="7" rx="2"/>
            <rect x="2" y="14" width="20" height="7" rx="2"/>
            <line x1="6" y1="6.5" x2="6.01" y2="6.5"/>
            <line x1="6" y1="17.5" x2="6.01" y2="17.5"/>
          </svg>
        {:else if tab.id === 'migration'}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        {/if}
      </span>
      <span class="label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .sidebar {
    width: 72px;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-default);
    display: flex;
    flex-direction: column;
    padding: var(--space-3) 0;
    flex-shrink: 0;
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: var(--space-2) var(--space-1);
    margin: 0 var(--space-1);
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 10px;
    font-family: var(--font-ui);
    border-radius: var(--radius-md);
  }

  .tab:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
  }

  .tab.active {
    color: var(--accent-primary);
    background: var(--svelte-brand-10);
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
  }

  .icon svg {
    width: 100%;
    height: 100%;
  }

  .label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
</style>
