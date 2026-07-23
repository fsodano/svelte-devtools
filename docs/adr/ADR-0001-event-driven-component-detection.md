# ADR-0001: Event-Driven Component Detection

## Status
Accepted

## Context
The runtime detected new Svelte components by polling `__SVELTE_DEVTOOLS_REGISTRY__` every 100ms. This caused browser violations (`"setInterval handler took Xms"`) in apps with 20+ components, as each poll iterated the registry and walked the DOM parent chain via `document.querySelector`.

The 100ms interval ran even when no components were mounting, wasting CPU. With 20 PokemonCard components in the pokedex test app, each `registerComponent` call performed DOM queries, accumulating to ~160ms handler times and triggering Chrome's "long task" warning.

## Decision
Replace the 100ms `setInterval` with a `MutationObserver` that watches `document.body` for:
- `childList` mutations — newly-added nodes that may carry `data-svelte-devtools-id`
- `attributes` mutations on `data-svelte-devtools-id` — Svelte 5 often sets this attribute asynchronously after the element is already in the DOM

On startup, an initial scan of `document.querySelectorAll('[data-svelte-devtools-id]')` catches any components mounted before the runtime loaded.

## Consequences
- Zero background CPU when no components mount or unmount
- Immediate detection — no 100ms polling latency
- More complex than a simple interval (must handle both childList and attribute mutations)
- Requires the initial scan for components mounted during the init race window
- Relies on `data-svelte-devtools-id` attribute being present in the compiled output (maintained by the Vite plugin transform)
