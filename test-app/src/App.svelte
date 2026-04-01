<script lang="ts">
  let count = $state(0);

  function increment() {
    count++;
  }
</script>

<main>
  <h1>Svelte DevTools Test</h1>
  <p>Count: {count}</p>
  <button onclick={increment}>Increment</button>
</main>

<style>
  main {
    padding: 2rem;
    font-family: sans-serif;
  }
  button {
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
</style>
