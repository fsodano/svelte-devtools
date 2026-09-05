<script lang="ts">
  import type { Snippet } from 'svelte';

  let { first, second, label = 'Resize panels', initial = 55, secondVisible = true }:
    { first: Snippet; second: Snippet; label?: string; initial?: number; secondVisible?: boolean } = $props();
  let container: HTMLDivElement;
  let width = $state(0);
  let position = $state(55);
  let adjusted = $state(false);
  let dragging = $state(false);
  const stacked = $derived(width > 0 && width < 600);
  const percentage = $derived(Math.max(20, Math.min(80, adjusted ? position : initial)));

  function resize(event: PointerEvent) {
    const rect = container.getBoundingClientRect();
    const size = stacked ? rect.height : rect.width;
    if (size <= 6) return;
    const offset = stacked ? event.clientY - rect.top : event.clientX - rect.left;
    position = Math.max(20, Math.min(80, ((offset - 3) / (size - 6)) * 100));
    adjusted = true;
  }

  function start(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = true;
    resize(event);
  }

  function keyboard(event: KeyboardEvent) {
    const increment = event.shiftKey ? 10 : 2;
    const negative = stacked ? 'ArrowUp' : 'ArrowLeft';
    const positive = stacked ? 'ArrowDown' : 'ArrowRight';
    if (![negative, positive, 'Home', 'End', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    position = event.key === 'Home' ? 20 : event.key === 'End' ? 80
      : event.key === 'Enter' ? initial
      : percentage + (event.key === negative ? -increment : increment);
    position = Math.max(20, Math.min(80, position));
    adjusted = true;
  }
</script>

<div class="split-pane" class:stacked class:single={!secondVisible} class:dragging
  bind:this={container} bind:clientWidth={width} style:--first={`${percentage}fr`} style:--second={`${100 - percentage}fr`}>
  <div class="pane">{@render first()}</div>
  {#if secondVisible}
    <!-- A focusable separator is the ARIA window splitter pattern. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="separator" role="separator" tabindex="0" aria-label={label}
      aria-orientation={stacked ? 'horizontal' : 'vertical'} aria-valuemin="20" aria-valuemax="80"
      aria-valuenow={Math.round(percentage)}
      title="Drag to resize. Use arrow keys, Shift for larger steps, or Enter to reset."
      onpointerdown={start} onpointermove={(event) => { if (dragging) resize(event); }}
      onpointerup={() => dragging = false} onpointercancel={() => dragging = false}
      onlostpointercapture={() => dragging = false} onkeydown={keyboard}
      ondblclick={() => { adjusted = false; }}></div>
    <div class="pane">{@render second()}</div>
  {/if}
</div>

<style>
  .split-pane { display: grid; grid-template-columns: minmax(0, var(--first)) 6px minmax(0, var(--second)); grid-template-rows: minmax(0, 1fr); flex: 1; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
  .split-pane.stacked { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, var(--first)) 6px minmax(0, var(--second)); }
  .split-pane.single { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .pane { min-width: 0; min-height: 0; overflow: auto; background: var(--bg-surface); }
  .pane > :global(*) { min-width: 0; min-height: 0; }
  .separator { background: var(--bg-inset); border-inline: 1px solid var(--border-default); cursor: col-resize; touch-action: none; outline: none; }
  .stacked > .separator { cursor: row-resize; border-inline: 0; border-block: 1px solid var(--border-default); }
  .separator:hover, .separator:focus-visible, .dragging > .separator { background: var(--accent-primary, #ff3e00); }
  .dragging { user-select: none; }
</style>
