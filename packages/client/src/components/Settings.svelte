<script lang="ts">
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';

  let scale = $state(Number(localStorage.getItem('svelte-devtools-scale') || '1'));
  let reduceMotion = $state(localStorage.getItem('svelte-devtools-reduce-motion') === 'true');
  let theme = $state(localStorage.getItem('svelte-devtools-theme') || 'system');

  const scaleOptions = [
    { label: 'Tiny', value: 0.8 },
    { label: 'Small', value: 0.9 },
    { label: 'Normal', value: 1 },
    { label: 'Large', value: 1.15 },
    { label: 'Huge', value: 1.3 },
  ];

  $effect(() => {
    document.documentElement.style.fontSize = `${scale * 100}%`;
    localStorage.setItem('svelte-devtools-scale', String(scale));
  });

  $effect(() => {
    if (reduceMotion) {
      document.documentElement.style.setProperty('--transition-fast', '0s');
    } else {
      document.documentElement.style.setProperty('--transition-fast', '0.15s');
    }
    localStorage.setItem('svelte-devtools-reduce-motion', String(reduceMotion));
  });

  function resetSettings() {
    scale = 1;
    reduceMotion = false;
    theme = 'system';
    localStorage.removeItem('svelte-devtools-scale');
    localStorage.removeItem('svelte-devtools-reduce-motion');
    localStorage.removeItem('svelte-devtools-theme');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.fontSize = '';
    location.reload();
  }
</script>

<div class="settings">
  <div class="settings-header">
    <h2 class="settings-title">Settings</h2>
  </div>

  <div class="settings-body">
    <section class="setting-group">
      <h3 class="group-title">Appearance</h3>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Font Scale</span>
          <span class="setting-desc">Adjust the UI text size</span>
        </div>
        <div class="scale-options">
          {#each scaleOptions as opt}
            <button
              class="scale-btn"
              class:active={scale === opt.value}
              onclick={() => scale = opt.value}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Reduce Motion</span>
          <span class="setting-desc">Disable animations and transitions</span>
        </div>
        <button
          class="toggle-btn"
          class:active={reduceMotion}
          onclick={() => reduceMotion = !reduceMotion}
          role="switch"
          aria-checked={reduceMotion}
        >
          <span class="toggle-thumb"></span>
        </button>
      </div>
    </section>

    <section class="setting-group">
      <h3 class="group-title">Data</h3>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Timeline Events</span>
          <span class="setting-desc">{devtoolsStore.timeline.length} events recorded</span>
        </div>
        <button class="action-btn" onclick={() => { while (devtoolsStore.timeline.length) devtoolsStore.timeline.pop(); }}>
          Clear Timeline
        </button>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Components</span>
          <span class="setting-desc">{devtoolsStore.components.length} components registered</span>
        </div>
        <button class="action-btn" onclick={() => location.reload()}>
          Refresh
        </button>
      </div>
    </section>

    <section class="setting-group danger-zone">
      <h3 class="group-title">Reset</h3>
      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Reset All Settings</span>
          <span class="setting-desc">Restore defaults and reload</span>
        </div>
        <button class="action-btn danger" onclick={resetSettings}>
          Reset
        </button>
      </div>
    </section>
  </div>
</div>

<style>
  .settings { display: flex; flex-direction: column; height: 100%; }
  .settings-header { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-default); }
  .settings-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary); }
  .settings-body { flex: 1; overflow-y: auto; padding: var(--space-3) var(--space-4); }
  .setting-group { margin-bottom: var(--space-5); }
  .setting-group.danger-zone { border-top: 1px solid var(--border-default); padding-top: var(--space-4); }
  .group-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin: 0 0 var(--space-3); }
  .setting-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle); }
  .setting-info { display: flex; flex-direction: column; gap: 2px; }
  .setting-label { font-size: 13px; color: var(--text-primary); }
  .setting-desc { font-size: 11px; color: var(--text-muted); }
  .scale-options { display: flex; gap: var(--space-1); }
  .scale-btn { padding: var(--space-1) var(--space-2); border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; }
  .scale-btn.active { background: var(--accent-primary); color: #fff; border-color: var(--accent-primary); }
  .toggle-btn { position: relative; width: 44px; height: 24px; border-radius: 12px; border: none; background: var(--bg-inset); cursor: pointer; transition: background var(--transition-fast); flex-shrink: 0; }
  .toggle-btn.active { background: var(--accent-primary); }
  .toggle-thumb { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform var(--transition-fast); }
  .toggle-btn.active .toggle-thumb { transform: translateX(20px); }
  .action-btn { padding: var(--space-1) var(--space-3); border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; }
  .action-btn:hover { background: var(--bg-hover); }
  .action-btn.danger { border-color: var(--status-error); color: var(--status-error); }
  .action-btn.danger:hover { background: var(--bg-error); }
</style>
