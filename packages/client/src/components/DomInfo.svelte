<script lang="ts">
  let { componentId }: { componentId: string } = $props();

  let domEl = $state<Element | null>(null);

  $effect(() => {
    if (typeof document !== 'undefined') {
      domEl = document.querySelector(`[data-svelte-devtools-id="${componentId}"]`);
    }
  });
</script>

<div class="dom-info">
  {#if typeof document === 'undefined'}
    <div class="empty">DOM inspection not available in this environment.</div>
  {:else if !domEl}
    <div class="empty">No DOM element found for this component.</div>
  {:else}
    <div class="dom-row">
      <span class="label">Tag</span>
      <span class="value">&lt;{domEl.tagName.toLowerCase()}&gt;</span>
    </div>
    <div class="dom-row">
      <span class="label">ID</span>
      <span class="value">{domEl.id || '(none)'}</span>
    </div>
    <div class="dom-row">
      <span class="label">Classes</span>
      <span class="value">{domEl.className || '(none)'}</span>
    </div>
    <div class="dom-row">
      <span class="label">Children</span>
      <span class="value">{domEl.children.length} element{domEl.children.length === 1 ? '' : 's'}</span>
    </div>
    <div class="dom-row">
      <span class="label">Bounding Rect</span>
      <span class="value">
        {(() => {
          const r = domEl.getBoundingClientRect();
          return `${Math.round(r.width)}×${Math.round(r.height)} @ (${Math.round(r.x)}, ${Math.round(r.y)})`;
        })()}
      </span>
    </div>
    <div class="dom-row">
      <span class="label">Data Attributes</span>
      <span class="value">
        {#each Array.from(domEl.attributes).filter(a => a.name.startsWith('data-')) as attr}
          <span class="attr-tag">{attr.name}="{attr.value}"</span>
        {/each}
      </span>
    </div>
  {/if}
</div>

<style>
  .dom-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dom-row {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 12px;
    padding: 10px 12px;
    background: #1e1e1e;
    border-radius: 4px;
    align-items: baseline;
  }

  .dom-row .label {
    font-size: 11px;
    color: #858585;
    font-weight: 600;
  }

  .dom-row .value {
    font-family: "Monaco", "Menlo", monospace;
    font-size: 12px;
    color: #ce9178;
    word-break: break-word;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .attr-tag {
    display: inline-block;
    padding: 2px 6px;
    background: #252526;
    border: 1px solid #333;
    border-radius: 3px;
    font-size: 11px;
    color: #9cdcfe;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #858585;
    font-size: 12px;
  }
</style>
