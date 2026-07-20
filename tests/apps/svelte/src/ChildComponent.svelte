<script lang="ts">
  let { title, count, onAction }: {
    title: string;
    count: number;
    onAction?: () => void;
  } = $props();

  let localState = $state(0);

  function inc() { localState++; }
  function doAction() { onAction?.(); }
</script>

<div data-testid="child">
  <h3>Child: {title}</h3>
  <p>count prop: {count}</p>
  <p>local state: {localState}</p>
  <button onclick={inc}>Child +1</button>
  <button onclick={doAction}>Notify Parent</button>
</div>
