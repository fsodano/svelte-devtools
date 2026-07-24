<script lang="ts">
  import { onMount } from 'svelte';

  let search = $state('');
  let view = $state<'grid' | 'list'>('list');
  let selectedAsset: AssetEntry | null = null;
  let filterType = $state('all');

  interface AssetEntry {
    url: string;
    name: string;
    type: string;
    mimeType: string;
    size: number;
    duration: number;
    initiatorType: string;
    timestamp: number;
  }

  let assets = $state<AssetEntry[]>([]);

  function addEntry(entry: PerformanceResourceTiming): void {
    const url = entry.name;
    const name = url.split('/').pop() || url;
    const ext = (name.split('.').pop() || '').toLowerCase();
    const isAsset = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico',
      'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp4', 'webm', 'mp3', 'wav',
      'pdf', 'zip', 'gz', 'avif', 'css', 'js'].includes(ext);

    if (!isAsset) return;

    // Dedup by URL (keep the first/latest)
    const existing = assets.findIndex(a => a.url === url);
    const asset: AssetEntry = {
      url,
      name,
      type: ext,
      mimeType: entry.initiatorType || '',
      size: entry.transferSize || entry.encodedBodySize || 0,
      duration: entry.duration,
      initiatorType: entry.initiatorType,
      timestamp: entry.startTime || performance.now(),
    };
    if (existing >= 0) {
      assets[existing] = asset;
    } else {
      assets = [...assets, asset];
    }
  }

  onMount(() => {
    // Capture already-loaded resources
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    for (const e of entries) addEntry(e);

    // Watch for new loads
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            addEntry(e as PerformanceResourceTiming);
          }
        });
        observer.observe({ entryTypes: ['resource'] });
      } catch { /* observer not supported */ }
    }
  });

  const filtered = $derived(
    assets.filter(a => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.url.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== 'all' && a.type !== filterType) return false;
      return true;
    }).sort((a, b) => b.timestamp - a.timestamp) // newest first
  );

  const assetTypes = $derived(
    Array.from(new Set(assets.map(a => a.type))).sort()
  );

  function formatSize(bytes: number): string {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1) return '<1ms';
    return `${ms.toFixed(1)}ms`;
  }

  function typeBadge(ext: string): string {
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico'].includes(ext)) return 'img';
    if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font';
    if (ext === 'css') return 'css';
    if (ext === 'js') return 'js';
    return ext;
  }
</script>

<div class="assets-panel">
  <div class="assets-header">
    <span class="panel-title">Network Assets</span>
    <span class="asset-count">{assets.length} asset{assets.length !== 1 ? 's' : ''}</span>
  </div>

  <div class="toolbar">
    <input type="text" bind:value={search} placeholder="Search by name or URL..." class="search-input" />
    <select bind:value={filterType} class="type-filter">
      <option value="all">All types</option>
      {#each assetTypes as t}
        <option value={t}>{t}</option>
      {/each}
    </select>
    <div class="view-toggle">
      <button class="view-btn" class:active={view === 'list'} onclick={() => view = 'list'} title="List view">☰</button>
      <button class="view-btn" class:active={view === 'grid'} onclick={() => view = 'grid'} title="Grid view">⊞</button>
    </div>
  </div>

  <div class="assets-body" class:grid={view === 'grid'}>
    {#if filtered.length === 0}
      <div class="empty-state">
        {#if search || filterType !== 'all'}
          <span>No assets match your filters</span>
        {:else}
          <span>No network assets detected. Load the page to see images, fonts, and other resources.</span>
        {/if}
      </div>
    {:else if view === 'list'}
      <div class="list-header">
        <span class="col-name">Name</span>
        <span class="col-type">Type</span>
        <span class="col-size">Size</span>
        <span class="col-time">Time</span>
      </div>
      {#each filtered as asset (asset.url)}
        <div class="asset-row" onclick={() => selectedAsset = asset} title={asset.url}>
          <span class="col-name">
            {#if ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(asset.type)}
              <img src={asset.url} alt="" class="thumb" loading="lazy" onerror={(e) => (e.target as HTMLElement).style.display = 'none'} />
            {/if}
            <span class="asset-name">{asset.name}</span>
          </span>
          <span class="col-type"><span class="badge" class:b-img={['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico'].includes(asset.type)} class:b-font={['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(asset.type)} class:b-css={asset.type === 'css'}>{typeBadge(asset.type)}</span></span>
          <span class="col-size">{formatSize(asset.size)}</span>
          <span class="col-time">{formatDuration(asset.duration)}</span>
        </div>
      {/each}
    {:else}
      {#each filtered as asset (asset.url)}
        <div class="asset-card" onclick={() => selectedAsset = asset} title={asset.url}>
          {#if ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(asset.type)}
            <div class="card-thumb-wrap">
              <img src={asset.url} alt="" class="card-thumb" loading="lazy" onerror={(e) => (e.target as HTMLElement).style.display = 'none'} />
            </div>
          {/if}
          <span class="card-name">{asset.name}</span>
          <span class="card-meta">{formatSize(asset.size)} · {formatDuration(asset.duration)}</span>
        </div>
      {/each}
    {/if}
  </div>

  {#if selectedAsset}
    <div class="detail-panel">
      <div class="detail-header">
        <span class="detail-title">Asset Details</span>
        <button class="detail-close" onclick={() => selectedAsset = null}>✕</button>
      </div>
      <div class="detail-body">
        <div class="detail-row">
          <span class="detail-label">Name</span>
          <span class="detail-value">{selectedAsset.name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">URL</span>
          <a href={selectedAsset.url} target="_blank" class="detail-value detail-link">{selectedAsset.url}</a>
        </div>
        <div class="detail-row">
          <span class="detail-label">Type</span>
          <span class="detail-value">{selectedAsset.mimeType || selectedAsset.type}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Size</span>
          <span class="detail-value">{formatSize(selectedAsset.size)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Load Time</span>
          <span class="detail-value">{formatDuration(selectedAsset.duration)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Initiator</span>
          <span class="detail-value">{selectedAsset.initiatorType}</span>
        </div>
        {#if ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(selectedAsset.type)}
          <div class="detail-preview">
            <img src={selectedAsset.url} alt="" class="preview-img" onerror={(e) => (e.target as HTMLElement).style.display = 'none'} />
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .assets-panel { display: flex; flex-direction: column; height: 100%; position: relative; }
  .assets-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); flex-shrink: 0; }
  .panel-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .asset-count { font-size: 11px; color: var(--text-muted); }
  .toolbar { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); }
  .search-input { flex: 1; padding: var(--space-1) var(--space-2); font-size: 11px; background: var(--bg-inset); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--radius-sm); }
  .type-filter { padding: var(--space-1) var(--space-2); font-size: 11px; background: var(--bg-inset); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: var(--radius-sm); cursor: pointer; }
  .view-toggle { display: flex; gap: 2px; }
  .view-btn { width: 28px; height: 28px; border: 1px solid var(--border-default); background: var(--bg-surface); border-radius: var(--radius-sm); cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; }
  .view-btn.active { background: var(--bg-hover); border-color: var(--accent-primary); }

  .assets-body { flex: 1; overflow-y: auto; padding: 0; }
  .assets-body.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--space-2); padding: var(--space-3); align-content: start; }
  .empty-state { display: flex; align-items: center; justify-content: center; height: 150px; color: var(--text-muted); font-size: 12px; padding: var(--space-4); text-align: center; }

  /* List view */
  .list-header { display: grid; grid-template-columns: 1fr 70px 70px 70px; gap: var(--space-2); padding: var(--space-1) var(--space-3); font-size: 10px; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--border-default); }
  .asset-row { display: grid; grid-template-columns: 1fr 70px 70px 70px; gap: var(--space-2); padding: var(--space-1) var(--space-3); align-items: center; cursor: pointer; font-size: 11px; border-bottom: 1px solid var(--border-subtle); }
  .asset-row:hover { background: var(--bg-hover); }
  .col-name { display: flex; align-items: center; gap: var(--space-2); overflow: hidden; }
  .thumb { width: 24px; height: 24px; object-fit: cover; border-radius: 3px; background: var(--bg-inset); flex-shrink: 0; }
  .asset-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
  .col-type { display: flex; align-items: center; }
  .col-size { color: var(--text-secondary); text-align: right; }
  .col-time { color: var(--text-secondary); text-align: right; }

  .badge { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600; font-family: var(--font-mono); background: var(--bg-inset); color: var(--text-secondary); text-transform: uppercase; }
  .badge.b-img { background: #e8f5e9; color: #2e7d32; }
  .badge.b-font { background: #e3f2fd; color: #1565c0; }
  .badge.b-css { background: #fff3e0; color: #e65100; }
  :global([data-theme="dark"]) .badge.b-img { background: #1b5e20; color: #a5d6a7; }
  :global([data-theme="dark"]) .badge.b-font { background: #0d47a1; color: #90caf9; }
  :global([data-theme="dark"]) .badge.b-css { background: #e65100; color: #ffe0b2; }

  /* Grid view */
  .asset-card { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); cursor: pointer; background: var(--bg-surface); }
  .asset-card:hover { border-color: var(--accent-primary); }
  .card-thumb-wrap { width: 100%; aspect-ratio: 16/9; overflow: hidden; border-radius: var(--radius-sm); background: var(--bg-inset); display: flex; align-items: center; justify-content: center; }
  .card-thumb { max-width: 100%; max-height: 100%; object-fit: contain; }
  .card-name { font-size: 11px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-meta { font-size: 10px; color: var(--text-muted); }

  /* Detail panel */
  .detail-panel { position: absolute; inset: 0; background: var(--bg-surface); display: flex; flex-direction: column; z-index: 10; border-left: 1px solid var(--border-default); }
  .detail-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-default); }
  .detail-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .detail-close { width: 24px; height: 24px; border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--text-secondary); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; }
  .detail-close:hover { background: var(--bg-hover); }
  .detail-body { flex: 1; overflow-y: auto; padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
  .detail-row { display: flex; flex-direction: column; gap: 2px; padding: var(--space-1) var(--space-2); background: var(--bg-inset); border-radius: var(--radius-sm); }
  .detail-label { font-size: 10px; color: var(--text-muted); font-weight: 600; }
  .detail-value { font-size: 11px; color: var(--text-primary); word-break: break-all; }
  .detail-link { color: var(--accent-primary); text-decoration: underline; }
  .detail-preview { margin-top: var(--space-2); display: flex; align-items: center; justify-content: center; padding: var(--space-4); background: var(--bg-inset); border-radius: var(--radius-sm); }
  .preview-img { max-width: 100%; max-height: 200px; object-fit: contain; }
</style>
