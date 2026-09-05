<script lang="ts">
  let { label }: { label: string } = $props();
  let count = $state(1);
  let profile = $state({ name: 'Original', nested: { enabled: true } });
  let items = $state(['first', 'second']);
  let onClick = $state(() => count++);
  const doubled = $derived(count * 2);
</script>

<section aria-label={`Instance ${label}`}>
  <h2>{label}</h2>
  <button onclick={onClick}>Increment {label}</button>
  <output data-testid={`${label}-count`}>{count}</output>
  <output data-testid={`${label}-profile`}>{JSON.stringify(profile)}</output>
  <output data-testid={`${label}-items`}>{JSON.stringify(items)}</output>
  <output data-testid={`${label}-doubled`}>{doubled}</output>
</section>
