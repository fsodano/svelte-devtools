<script lang="ts">
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';

  let snapshots: any[] = $derived(devtoolsStore.timeTravel.snapshots);
  let currentSnapshotIndex: number = $derived(devtoolsStore.timeTravel.currentIndex);
  let canUndo: boolean = $derived(devtoolsStore.timeTravel.canUndo);
  let canRedo: boolean = $derived(devtoolsStore.timeTravel.canRedo);
  let isPlaying = $state(false);

  let snapshotCounter = $derived(
    snapshots.length > 0 ? `${currentSnapshotIndex + 1} / ${snapshots.length}` : ''
  );

  let isViewingHistorical = $derived(
    snapshots.length > 0 && currentSnapshotIndex < snapshots.length - 1
  );

  $effect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if (canRedo) devtoolsStore.timeTravel.redo();
      else isPlaying = false;
    }, 1500);
    return () => clearInterval(interval);
  });

  function toggleRecording(): void {
    devtoolsStore.isRecording = !devtoolsStore.isRecording;
    if (devtoolsStore.isRecording) devtoolsStore.timeTravel.capture();
  }
</script>

<div class="tt-panel">
  <div class="tt-header">
    <span class="tt-title">Time Travel</span>
    <div class="tt-controls">
      <button class="record-btn" class:recording={devtoolsStore.isRecording} onclick={toggleRecording}>
        <svg viewBox="0 0 12 12" width="10" height="10"><circle cx="6" cy="6" r="4" fill="currentColor"/></svg>
        {devtoolsStore.isRecording ? 'Recording' : 'Paused'}
      </button>
    </div>
  </div>

  {#if snapshots.length > 0}
    <div class="toolbar">
      <button class="tb-btn" onclick={() => devtoolsStore.timeTravel.undo()} disabled={!canUndo} title="Undo">
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 7l3-3v2h5v3H8v2L5 7z"/></svg>
      </button>
      <button class="tb-btn" onclick={() => devtoolsStore.timeTravel.redo()} disabled={!canRedo} title="Redo">
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 7L8 4v2H3v3h5v2l3-3z"/></svg>
      </button>
      <button class="tb-btn" onclick={() => isPlaying = !isPlaying} title={isPlaying ? 'Pause' : 'Play'}>
        {#if isPlaying}
          <svg viewBox="0 0 16 16" width="11" height="11"><rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor"/><rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor"/></svg>
        {:else}
          <svg viewBox="0 0 16 16" width="11" height="11"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
        {/if}
      </button>
      <button class="tb-btn" onclick={() => devtoolsStore.timeTravel.clear()} title="Clear">
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
      </button>
      <span class="count">{snapshotCounter}</span>
    </div>

    <div class="banner" class:current={!isViewingHistorical}>
      <span class="banner-text">{isViewingHistorical ? 'Viewing old state' : 'Current state'}</span>
    </div>
  {/if}

  <div class="list">
    {#if snapshots.length === 0}
      <div class="empty">
        <span>No snapshots</span>
        <span class="hint">Click Record and interact with your app</span>
      </div>
    {:else}
      {#each snapshots as snap, idx}
        <div class="row" class:active={currentSnapshotIndex === idx}>
          <button class="dot" class:active={currentSnapshotIndex === idx}
            onclick={() => devtoolsStore.timeTravel.restore(idx, true)}>
            <span class="fill"></span>
          </button>
          <div class="info">
            <span class="label"><span class="num">#{idx + 1}</span> {snap.label || 'snapshot'}</span>
            <span class="ts">{new Date(snap.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .tt-panel { display: flex; flex-direction: column; height: 100%; }
  .tt-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border-default); flex-shrink: 0; }
  .tt-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .tt-controls { display: flex; gap: 4px; }
  .record-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; }
  .record-btn.recording { border-color: var(--status-error); color: var(--status-error); }
  .toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; border-bottom: 1px solid var(--border-default); flex-shrink: 0; }
  .tb-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; border-radius: 4px; }
  .tb-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
  .tb-btn:disabled { opacity: 0.3; cursor: default; }
  .count { margin-left: auto; font-family: monospace; font-size: 10px; color: var(--text-muted); }
  .banner { display: flex; align-items: center; padding: 4px 12px; border-bottom: 1px solid var(--border-default); flex-shrink: 0; background: rgba(255, 152, 0, 0.08); }
  .banner.current { background: rgba(52, 199, 89, 0.08); }
  .banner-text { font-size: 10px; flex: 1; color: var(--warning); }
  .banner.current .banner-text { color: var(--success); }
  .list { flex: 1; overflow-y: auto; padding: 4px 0; }
  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 150px; color: var(--text-muted); font-size: 12px; }
  .hint { font-size: 10px; opacity: 0.7; }
  .row { display: flex; align-items: center; gap: 8px; padding: 4px 12px; cursor: pointer; }
  .row:hover { background: var(--bg-hover); }
  .row.active { background: rgba(255,62,0,0.08); }
  .dot { display: flex; align-items: center; justify-content: center; width: 10px; height: 10px; padding: 0; border: 2px solid var(--accent-primary); background: transparent; cursor: pointer; border-radius: 50%; flex-shrink: 0; }
  .dot.active { box-shadow: 0 0 0 2px rgba(255,62,0,0.25); }
  .fill { display: block; width: 4px; height: 4px; border-radius: 50%; background: var(--accent-primary); }
  .info { display: flex; flex-direction: column; }
  .label { font-size: 10px; color: var(--text-primary); }
  .num { color: var(--text-muted); font-family: monospace; margin-right: 3px; }
  .ts { font-size: 8px; color: var(--text-muted); font-family: monospace; }
</style>
