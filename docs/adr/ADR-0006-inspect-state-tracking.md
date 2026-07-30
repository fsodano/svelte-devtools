# ADR-0006: Inspect State Tracking

## Status
Accepted

## Context
Svelte 5 runes (`$state`, `$derived`, `$effect`) are compile-time transforms. They don't exist as runtime objects that can be hooked, inspected, or proxied at runtime. The DevTools needed a way to track component state changes without modifying Svelte's compiler or relying on unsupported internal APIs.

Three approaches were considered for observing reactive state at runtime:

1. **Runtime rune hooking** — intercept `$state()` calls by wrapping or proxying the rune itself. Impossible because runes are syntactic sugar that compiles to `s_setters` and `s_getters` at build time. There is no runtime `$state` object to intercept.

2. **DOM scanning** — periodically read the rendered DOM to infer state values. Fragile, slow, and fundamentally cannot capture non-rendered state (booleans, computed values, internal counters). Also misses state that doesn't map to DOM text content.

3. **`$inspect` injection** — use Svelte 5's official `$inspect` rune, which fires a callback whenever a tracked value changes. This requires build-time injection since `$inspect` declarations must exist in the `.svelte` file source.

## Decision
Inject `$inspect` calls at build time via the Vite plugin. The plugin parses each `.svelte` file's `<script>` block, finds rune declarations (`$state`, `$derived`), and appends a corresponding `$inspect(variable).with(...)` call after each one.

The injected callback calls `window.__SVELTE_DEVTOOLS_RUNTIME__.handleState()`, which routes the update through the runtime's deduplication buffer and into the DevTools UI via postMessage.

The injection covers all Svelte 5 pattern variants:
- Simple declarations: `let count = $state(0)`
- Destructuring: `let { x, y } = $state({ x: 0, y: 0 })`
- Default values and renamed keys: `let { width: w = 100 } = $state(...)`

## Consequences
- Relies on the official `$inspect` API, which is stable and documented in Svelte 5
- No runtime overhead when DevTools isn't loaded — `$inspect` callbacks are no-ops if `handleState` isn't set
- Works with all Svelte 5 state patterns including destructuring, default values, and renamed keys
- Zero background CPU — callbacks fire only on actual state changes
- Requires build-time plugin integration; won't work without the Vite plugin being active
- Cannot track state changes in components that were compiled before the plugin was added (pre-built libraries)
- `$inspect` fires synchronously, which makes the debounced batching in ADR-0002 necessary to avoid flooding the DevTools UI
