<script lang="ts">
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';

  import { DEFAULT_PREFERENCES, readPreferences, resetPreferences, savePreferences, type Preferences } from '../lib/preferences';

  let preferences = $state(readPreferences());
  let notice = $state('');

  function updatePreferences(change: Partial<Preferences>) {
    preferences = { ...preferences, ...change };
    notice = savePreferences(preferences) ? 'Settings saved.' : 'Settings applied. Browser storage is unavailable; changes will not persist after reload.';
  }

  const scaleOptions = [
    { label: 'Tiny', value: 0.8 },
    { label: 'Small', value: 0.9 },
    { label: 'Normal', value: 1 },
    { label: 'Large', value: 1.15 },
    { label: 'Huge', value: 1.3 },
  ];

  function resetSettings() {
    preferences = { ...DEFAULT_PREFERENCES };
    notice = resetPreferences() ? 'Default settings restored.' : 'Defaults applied. Browser storage is unavailable.';
  }
</script>

<div class="settings">
  <div class="settings-header">
    <h2 class="settings-title">Settings</h2>
  </div>

  <div class="settings-body">
    <p class="save-notice" role="status">{notice || 'Changes apply immediately and are saved in this browser.'}</p>
    <section class="setting-group">
      <h3 class="group-title">Appearance</h3>
      <div class="setting-row">
        <label class="setting-label" for="theme">Theme</label>
        <select id="theme" value={preferences.theme} onchange={(event) => updatePreferences({ theme: event.currentTarget.value as Preferences['theme'] })} class="scale-btn">
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </select>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Interface Scale</span>
          <span class="setting-desc">Resize text and controls together</span>
        </div>
        <div class="scale-options">
          {#each scaleOptions as opt (opt.value)}
            <button
              class="scale-btn"
              class:active={preferences.scale === opt.value}
              aria-pressed={preferences.scale === opt.value}
              onclick={() => updatePreferences({ scale: opt.value })}
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
          class:active={preferences.reduceMotion}
          onclick={() => updatePreferences({ reduceMotion: !preferences.reduceMotion })}
          role="switch"
          aria-label="Reduce motion"
          aria-checked={preferences.reduceMotion}
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
        <button class="action-btn" onclick={() => { devtoolsStore.clearTimeline(); notice = 'Timeline cleared.'; }}>
          Clear Timeline
        </button>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Components</span>
          <span class="setting-desc">{devtoolsStore.components.length} components registered</span>
        </div>
        <button class="action-btn" onclick={() => { devtoolsStore.refresh(); notice = 'Component refresh requested.'; }}>
          Refresh
        </button>
      </div>
    </section>

    <section class="setting-group danger-zone">
      <h3 class="group-title">Reset</h3>
      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Reset All Settings</span>
          <span class="setting-desc">Restore appearance defaults</span>
        </div>
        <button class="action-btn danger" onclick={resetSettings}>
          Reset
        </button>
      </div>
    </section>
  </div>
</div>

<style>
  .save-notice { margin: 0 0 var(--space-4); color: var(--text-secondary); font-size: 12px; }
  .settings { display: flex; flex-direction: column; height: 100%; }
  .settings-header { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-default); }
  .settings-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary); }
  .settings-body { flex: 1; overflow-y: auto; padding: var(--space-3) var(--space-4); }
  .setting-group { margin-bottom: var(--space-5); }
  .setting-group.danger-zone { border-top: 1px solid var(--border-default); padding-top: var(--space-4); }
  .group-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin: 0 0 var(--space-3); }
  .setting-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle); }
  .setting-info { display: flex; flex-direction: column; gap: 2px; }
  .setting-label { font-size: 13px; color: var(--text-primary); }
  .setting-desc { font-size: 11px; color: var(--text-muted); }
  .scale-options { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  .scale-btn { padding: var(--space-1) var(--space-2); border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; }
  .scale-btn.active { background: var(--accent-primary); color: #fff; border-color: var(--accent-primary); }
  .toggle-btn { position: relative; width: 44px; height: 24px; border-radius: 12px; border: none; background: var(--bg-inset); cursor: pointer; transition: background var(--transition-fast); flex-shrink: 0; }
  .toggle-btn.active { background: var(--accent-primary); }
  .toggle-thumb { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform var(--transition-fast); }
  .toggle-btn.active .toggle-thumb { transform: translateX(20px); }
  .action-btn { padding: var(--space-1) var(--space-3); border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; }
  .action-btn:hover { background: var(--bg-hover); }
  .action-btn.danger { border-color: var(--text-error); color: var(--text-error); }
  .action-btn.danger:hover { background: var(--bg-error); }
</style>
