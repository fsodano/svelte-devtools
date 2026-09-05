<script lang="ts">
  let { index, generation }: { index: number; generation: number } = $props();
  let count = $state(0);
</script>

<button onclick={() => count++} data-testid={`stress-item-${index}`}>{index}: {generation} / {count}</button>
