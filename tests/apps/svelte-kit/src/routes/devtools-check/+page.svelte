<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  let { data }: { data: PageData } = $props();
  let count = $state(0);
</script>

<svelte:head><title>SSR verification</title></svelte:head>
<section>
  <h1>SSR verification</h1>
  <p data-testid="ssr-label">{data.label}</p>
  <p data-testid="ssr-echo">{data.echoed}</p>
  {#await data.delayed}<p>Streaming…</p>{:then value}<p data-testid="stream-result">{value}</p>{/await}
  <button onclick={() => count++}>Hydration count: {count}</button>
  <a href={resolve('/about')}>About this app</a>
</section>

<style>
  section { max-width: 48rem; margin: 2rem auto; padding: 1rem; }
  button { display: block; margin: 1rem 0; }
</style>
