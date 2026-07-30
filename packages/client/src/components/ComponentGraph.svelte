<script lang="ts">
  import { onMount } from 'svelte';
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte';
  import { Network } from 'vis-network';
  import type { DataSet } from 'vis-data';

  let container: HTMLDivElement;
  let network: Network | null = null;
  let isStabilizing = $state(false);
  let selectedNodeId: string | null = null;

  const components = $derived(devtoolsStore.components);
  const graphKey = $derived(components.map(c => `${c.id}:${c.parentId}`).join('|'));

  interface VisNode {
    id: string;
    label: string;
    title: string;
    color?: string;
    size?: number;
    shape?: string;
    borderWidth?: number;
  }

  interface VisEdge {
    from: string;
    to: string;
    color?: string;
    width?: number;
    dashes?: boolean;
  }

  function buildGraph(): void {
    if (!container || components.length === 0 || isStabilizing) return;

    const nodes: VisNode[] = [];
    const edges: VisEdge[] = [];

    for (const c of components) {
      const stateCount = Object.keys(c.state || {}).length;
      nodes.push({
        id: c.id,
        label: c.name,
        title: `${c.name}\n${c.filename || ''}\nState vars: ${stateCount}`,
        color: '#FF3E00',
        size: 20 + Math.min(stateCount, 10) * 2,
        shape: 'dot',
        borderWidth: 2,
      });
    }

    for (const c of components) {
      if (c.parentId && components.find(p => p.id === c.parentId)) {
        edges.push({
          from: c.parentId,
          to: c.id,
          color: '#666',
          width: 1.5,
        });
      }
    }

    const options = {
      nodes: {
        font: { color: '#ddd', size: 12, face: 'monospace' },
        borderWidth: 2,
        shadow: true,
      },
      edges: {
        smooth: { enabled: true, type: 'curvedCW', roundness: 0.2 },
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      },
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -40,
          centralGravity: 0.005,
          springLength: 150,
          springConstant: 0.04,
          damping: 0.5,
        },
        stabilization: { iterations: 100 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        navigationButtons: true,
        keyboard: true,
      },
      layout: { improvedLayout: true },
    };

    isStabilizing = true;
    network = new Network(container, { nodes, edges }, options);

    network.once('stabilizationIterationsDone', () => {
      network?.setOptions({ physics: false });
      isStabilizing = false;
    });

    network.on('click', (params) => {
      selectedNodeId = params.nodes.length > 0 ? params.nodes[0] : null;
    });

    network.on('doubleClick', () => {
      if (selectedNodeId) {
        const target = window.top || window.parent || window;
        try {
          const el = target.document.querySelector(`[data-svelte-devtools-id="${selectedNodeId}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (el) (el as HTMLElement).style.outline = '2px solid #FF3E00';
          setTimeout(() => { if (el) (el as HTMLElement).style.outline = ''; }, 1500);
        } catch {}
      }
    });
  }

  function initOrRebuild(): void {
    if (network) {
      network.destroy();
      network = null;
    }
    buildGraph();
  }

  onMount(() => {
    // Container is guaranteed to be available here
    initOrRebuild();
  });

  // Reactively rebuild when component structure changes
  let prevKey = '';
  $effect(() => {
    const key = graphKey;
    if (key !== prevKey && key.length > 0) {
      prevKey = key;
      initOrRebuild();
    }
  });

  function zoomIn(): void { network?.moveTo({ scale: (network.getScale() || 1) * 1.3 }); }
  function zoomOut(): void { network?.moveTo({ scale: (network.getScale() || 1) / 1.3 }); }
  function fitView(): void { network?.fit(); }
</script>

<div class="graph-panel">
  <div class="graph-header">
    <span class="graph-title">Component Graph</span>
    <span class="graph-count">{components.length} component{components.length !== 1 ? 's' : ''}</span>
    <div class="graph-controls">
      <button class="tool-btn" onclick={zoomIn} title="Zoom in">+</button>
      <button class="tool-btn" onclick={zoomOut} title="Zoom out">−</button>
      <button class="tool-btn" onclick={fitView} title="Fit">⊡</button>
    </div>
  </div>
  <div class="graph-body">
    {#if components.length === 0}
      <div class="graph-empty">No components to display</div>
    {:else}
      <div bind:this={container} class="graph-container"></div>
    {/if}
  </div>
</div>

<style>
  .graph-panel { display: flex; flex-direction: column; height: 100%; }
  .graph-header { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); flex-shrink: 0; }
  .graph-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .graph-count { font-size: 10px; color: var(--text-muted); flex: 1; }
  .graph-controls { display: flex; gap: 2px; }
  .tool-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-sm); font-size: 13px; }
  .tool-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .graph-body { flex: 1; min-height: 0; background: var(--bg-inset); }
  .graph-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; }
  .graph-container { width: 100%; height: 100%; }
  .graph-container :global(.vis-network) { outline: none; }
</style>
