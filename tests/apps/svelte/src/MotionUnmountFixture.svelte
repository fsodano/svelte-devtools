<script lang="ts">
  import Counter from '../../svelte-kit/src/routes/Counter.svelte';
  let showMotion = $state(true);
  let count = $state(0);
</script>

<h1>Recording after an animated component unmounts</h1>
<button onclick={() => showMotion = false}>Unmount motion</button>
<button onclick={() => count++}>Increment survivor</button>
<output data-testid="survivor-count">{count}</output>
{#if showMotion}<Counter />{/if}
