<script lang="ts">
  import SplitPane from "./SplitPane.svelte";
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte.js';

  let snapshots: any[] = $derived(devtoolsStore.timeTravel.snapshots);
  let currentSnapshotIndex: number = $derived(devtoolsStore.timeTravel.currentIndex);
  let canUndo: boolean = $derived(devtoolsStore.timeTravel.canUndo);
  let canRedo: boolean = $derived(devtoolsStore.timeTravel.canRedo);
  let isPlaying = $state(false);
  let selectedSnapshotIndex = $state<number | null>(null);

  let snapshotCounter = $derived(
    snapshots.length > 0 ? `${currentSnapshotIndex + 1} / ${snapshots.length}` : ''
  );

  let isViewingHistorical = $derived(
    snapshots.length > 0 && currentSnapshotIndex < snapshots.length - 1
  );

  let selectedSnapshot = $derived(
    selectedSnapshotIndex !== null ? snapshots[selectedSnapshotIndex] : null
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

  function selectSnapshot(idx: number): void {
    if (selectedSnapshotIndex === idx) {
      selectedSnapshotIndex = null;
    } else {
      selectedSnapshotIndex = idx;
    }
  }

  function restoreSelected(): void {
    if (selectedSnapshotIndex !== null) {
      devtoolsStore.timeTravel.restore(selectedSnapshotIndex, true);
    }
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

  {#if devtoolsStore.timeTravel.error}
    <p class="restore-error" role="alert">{devtoolsStore.timeTravel.error}</p>
  {/if}

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

  <div class="body">
    <SplitPane label="Resize snapshots and details" secondVisible={!!selectedSnapshot}>
    {#snippet first()}
    <div class="list">
      {#if snapshots.length === 0}
        <div class="empty">
          <span>No snapshots</span>
          <span class="hint">Click Record and interact with your app</span>
        </div>
      {:else}
        {#each snapshots as snap, idx (snap.id)}
          <div class="row" role="button" tabindex="0" onkeydown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); selectSnapshot(idx); } }} class:active={currentSnapshotIndex === idx} class:selected={selectedSnapshotIndex === idx} onclick={() => selectSnapshot(idx)}>
            <button aria-label={`Select snapshot ${idx + 1}`} class="dot" class:active={currentSnapshotIndex === idx}>
              <span class="fill"></span>
            </button>
            <div class="info">
              <span class="label"><span class="num">#{idx + 1}</span> {snap.label || 'snapshot'}</span>
              <span class="ts">{new Date(snap.timestamp).toLocaleTimeString()}</span>
            </div>
            <button class="restore-btn" onclick={(e) => { e.stopPropagation(); devtoolsStore.timeTravel.restore(idx, true); }} title="Restore this snapshot">
              <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8a6 6 0 0111-3.46V2h1v5H9V6h2.3A5 5 0 103 8H2z"/></svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>

    {/snippet}
    {#snippet second()}
    {#if selectedSnapshot}
      <div class="detail" role="region" aria-label="Snapshot details">
        <div class="detail-header">
          <span class="detail-title">Snapshot #{selectedSnapshotIndex! + 1}</span>
          <button class="close-btn" onclick={() => selectedSnapshotIndex = null} title="Close details">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </div>

        <div class="detail-body">
          <div class="detail-row">
            <span class="detail-label">Label</span>
            <span class="detail-value">{selectedSnapshot.label || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Time</span>
            <span class="detail-value">{new Date(selectedSnapshot.timestamp).toLocaleString()}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">ID</span>
            <span class="detail-value mono">{selectedSnapshot.id || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Components</span>
            <span class="detail-value">{selectedSnapshot.components?.length ?? 0}</span>
          </div>

          <div class="detail-section">Restore</div>
          <button class="restore-now" onclick={restoreSelected}>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8a6 6 0 0111-3.46V2h1v5H9V6h2.3A5 5 0 103 8H2z"/></svg>
            Restore this snapshot
          </button>

          {#if selectedSnapshot.components?.length}
            <div class="detail-section">Changes from previous snapshot</div>
            {@const hasChanges = selectedSnapshot.components.some((comp: any) => {
              if (selectedSnapshotIndex === 0) return Object.keys(comp.state || {}).length > 0;
              const prevComp = snapshots[selectedSnapshotIndex! - 1].components.find((c: any) => c.id === comp.id);
              return prevComp && Object.entries(comp.state || {}).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(prevComp.state[k]));
            })}
            {#if !hasChanges}
              <div class="no-state">No state changes — initial mount snapshot</div>
            {:else}
              {#each selectedSnapshot.components as comp (comp.id)}
                {@const prevComp = selectedSnapshotIndex! > 0 ? snapshots[selectedSnapshotIndex! - 1].components.find((c: any) => c.id === comp.id) : null}
                {@const stateEntries = Object.entries(comp.state || {})}
                {@const changedKeys = prevComp ? stateEntries.filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(prevComp.state[k])) : stateEntries}
                {#if changedKeys.length > 0}
                  <details class="comp-details" open>
                    <summary class="comp-summary">
                      <span class="comp-name">{comp.name}</span>
                      <span class="changed-count">{changedKeys.length} changed</span>
                    </summary>
                    <div class="comp-state">
                      {#each changedKeys as [key, value] (key)}
                        {@const prevVal = prevComp ? prevComp.state[key] : undefined}
                        <div class="state-row">
                          <span class="state-key">{key}</span>
                          {#if prevVal !== undefined}
                            <span class="state-diff-old">{JSON.stringify(prevVal)}</span>
                          {/if}
                          <span class="state-arrow">&rarr;</span>
                          <span class="state-value mono">{JSON.stringify(value)}</span>
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
              {/each}
            {/if}
          {/if}
        </div>
      </div>
    {/if}
    {/snippet}
    </SplitPane>
  </div>
</div>

<style>
  .restore-error { margin: 0; padding: 8px 12px; color: var(--status-error); overflow-wrap: anywhere; }
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

  .body { display: flex; flex: 1; min-height: 0; overflow: hidden; }
  .list { flex: 1; overflow-y: auto; padding: 4px 0; min-width: 0; }
  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 150px; color: var(--text-muted); font-size: 12px; }
  .hint { font-size: 10px; opacity: 0.7; }
  .row { display: flex; align-items: center; gap: 6px; padding: 4px 12px; cursor: pointer; }
  .row:hover { background: var(--bg-hover); }
  .row.active { background: rgba(255,62,0,0.08); }
  .row.selected { background: rgba(var(--accent-primary-rgb, 71, 118, 230), 0.06); }
  .dot { display: flex; align-items: center; justify-content: center; width: 10px; height: 10px; padding: 0; border: 2px solid var(--accent-primary); background: transparent; cursor: pointer; border-radius: 50%; flex-shrink: 0; }
  .dot.active { box-shadow: 0 0 0 2px rgba(255,62,0,0.25); }
  .fill { display: block; width: 4px; height: 4px; border-radius: 50%; background: var(--accent-primary); }
  .info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .label { font-size: 10px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .num { color: var(--text-muted); font-family: monospace; margin-right: 3px; }
  .ts { font-size: 8px; color: var(--text-muted); font-family: monospace; }
  .restore-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: 4px; flex-shrink: 0; opacity: 0; }
  .row:hover .restore-btn { opacity: 1; }
  .restore-btn:hover { color: var(--accent-primary); background: var(--bg-hover); }

  /* Detail panel */
  .detail { height: 100%; min-width: 0; border-left: 1px solid var(--border-default); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
  .detail-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border-default); }
  .detail-title { font-size: 11px; font-weight: 600; color: var(--text-primary); }
  .close-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: 4px; }
  .close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .detail-body { flex: 1; overflow-y: auto; padding: 8px 0; }
  .detail-row { gap: 12px; display: flex; justify-content: space-between; align-items: center; padding: 4px 12px; }
  .detail-label { font-size: 10px; color: var(--text-muted); }
  .detail-value { overflow-wrap: anywhere; text-align: right; min-width: 0; font-size: 10px; color: var(--text-primary); }
  .mono { font-family: monospace; font-size: 9px; }
  .detail-section { font-size: 10px; font-weight: 600; color: var(--text-secondary); padding: 8px 12px 4px; border-top: 1px solid var(--border-default); margin-top: 4px; }
  .restore-now { display: flex; align-items: center; gap: 4px; margin: 4px 12px; padding: 6px 10px; border: 1px solid var(--accent-primary); background: transparent; color: var(--accent-primary); border-radius: var(--radius-sm); font-size: 10px; cursor: pointer; }
  .restore-now:hover { background: var(--accent-primary); color: var(--bg-surface); }

  /* Component states */
  .comp-details { border-bottom: 1px solid var(--border-default); }
  .comp-summary { display: flex; align-items: center; gap: 6px; padding: 6px 12px; cursor: pointer; font-size: 10px; color: var(--text-primary); }
  .comp-summary:hover { background: var(--bg-hover); }
  .comp-name { font-weight: 500; }
  .changed-count { font-size: 9px; color: var(--status-error); margin-left: auto; }
  .comp-state { padding: 4px 12px 8px 20px; }
  .state-row { display: flex; flex-direction: column; padding: 3px 0; border-bottom: 1px solid var(--border-default); }
  .state-key { font-size: 9px; color: var(--text-muted); font-weight: 500; }
  .state-value { font-size: 9px; color: var(--text-primary); word-break: break-all; }
  .state-diff-old { font-size: 9px; color: var(--text-muted); text-decoration: line-through; word-break: break-all; }
  .state-arrow { font-size: 9px; color: var(--text-muted); margin: 0 2px; }
  .no-state { font-size: 9px; color: var(--text-muted); font-style: italic; }
</style>
