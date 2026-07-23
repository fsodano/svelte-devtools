# ADR-0002: Debounced State Change Batching

## Status
Accepted

## Context
The `$inspect` rune fires synchronously for every `$state()` assignment in every Svelte 5 component. The Vite plugin injects an `$inspect` hook for each `$state()` declaration during compilation. When a component's state changes, the hook calls `runtime.handleState()`, which sends a `postMessage` to the DevTools iframe, which calls `handleStateChange()` in the devtools store.

In the pokedex test app, each PokemonCard component has `isLoaded = $state(false)` and `imgError = $state(false)`. When images load, 2 `$inspect` events fire per card. With 20 cards rendering, 40+ state changes cross the iframe boundary in rapid succession.

The store's `handleStateChange` rebuilt the entire `components` array via `.map()` for every single event, then called `addToTimeline()`. Each array rebuild invalidated every `$derived` in ComponentTree and ComponentDetail, causing cascading re-renders. The UI couldn't settle between state changes, manifesting as hangs when switching tabs or clicking components.

## Decision
Queue incoming state changes into a pending buffer instead of applying them immediately. Flush the buffer on a 50ms `setTimeout`. During flush:

1. Deduplicate by `(componentId, key)` — only the latest value for each key survives
2. Apply all deduplicated values to the components array in a single `.map()` pass
3. Add timeline entries in a single `[...timeline, ...entries].slice(-1000)` call

The motion gate (Spring/Tween animation detection) and time-travel gate apply at flush time, not per-event.

## Consequences
- N state changes in 50ms → 1 array rebuild instead of N
- No data loss — latest value per key always wins
- 50ms adds ~1 frame of latency to state display, imperceptible for developer tooling
- Timeline entries are deduplicated per key during each flush window
- Existing motion and time-travel gates still apply (checked at flush time)
- The 50ms window was chosen to coalesce burst changes (image loads, animation frames) while still feeling responsive
