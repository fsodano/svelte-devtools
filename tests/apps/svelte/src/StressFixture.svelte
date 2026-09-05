<script lang="ts">
  import StressItem from './StressItem.svelte';
  let mounted = $state(true);
  let generation = $state(0);
  const items = Array.from({ length: 1000 }, (_, index) => index);
</script>

<h1>1,000 component lifecycle fixture</h1>
<button onclick={() => generation++}>Update all</button>
<button onclick={() => mounted = !mounted}>{mounted ? 'Unmount all' : 'Mount all'}</button>
<output data-testid="stress-generation">{generation}</output>
<div>
  {#if mounted}
    {#each items as index (index)}
      <StressItem {index} {generation} />
    {/each}
  {/if}
</div>
