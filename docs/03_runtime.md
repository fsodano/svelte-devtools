# Runtime

The runtime package (`packages/runtime`) receives state changes from injected `$inspect` hooks, detects components via a `MutationObserver`, and emits events for the DevTools panel via `postMessage`.

## Loading

The runtime loads in two phases (see `src/init.ts`):

1. **Phase 1 — passive buffer**: The Vite plugin injects a tiny inline `<script id="__svelte-devtools-init">` (from `getInitScript()`) into the HTML `<head>`. It creates a placeholder `window.__SVELTE_DEVTOOLS_RUNTIME__` whose methods buffer calls into a `_queue` until the real runtime activates — so injected `$inspect` hooks never crash, even if components mount before the runtime loads.
2. **Phase 3 — full runtime**: The real runtime module is loaded as `<script type="module" src="/__svelte-devtools/svelte-runtime.js">` (plain Vite, via `transformIndexHtml`) or injected through `svelteDevToolsHandle()` (SvelteKit, via `transformPageChunk`). It binds its implementations onto the global, drains the buffered queue FIFO, and calls `init()`.

For SvelteKit SSR apps, use the exported helper in `hooks.server.ts`:

```typescript
// src/hooks.server.ts
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteDevToolsHandle, noopHandle } from '@svelte-devtools/vite-plugin/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

## Global APIs

### `window.__SVELTE_DEVTOOLS_RUNTIME__`

The main runtime instance (see `src/index.ts`):

```typescript
interface SvelteDevToolsRuntime {
  version: string;

  // Initialize the runtime (called automatically once the module loads)
  init(): void;

  // Handle state change from $inspect (called by injected code)
  handleState(componentId: string, key: string, type: string, value: unknown): void;

  // Track an effect run (called by injected code)
  handleEffect(componentId: string, key: string, runeName: string, filename: string): void;

  // Report an error (emits trace:trigger)
  reportError(componentId: string, error: unknown): void;

  // Register a component (called by injected code)
  registerComponent(id: string, name: string, filename: string, sourceLocation?: string): void;

  // Register a per-key setter so the panel can restore values into live runes
  _registerState(componentId: string, key: string, setter: (v: unknown) => void): void;

  // Apply a state value (used by time-travel restore and /api/set-state)
  setComponentState(componentId: string, key: string, value: unknown): void;

  // Force a DOM re-scan for missed components
  refresh(): void;

  // Batch markers (used around snapshot restore); endInspectBatch posts 'restore:echoes-done'
  startInspectBatch(): void;
  endInspectBatch(): void;
  flushAllEffects(): void;

  // Emit an event via postMessage
  emit(event: RuntimeEvent): void;

  // Get internal state / all tracked components
  getState(): DevToolsState;
  getAllComponents(): ComponentState[];
}
```

### `window.__SVELTE_DEVTOOLS_REGISTRY__`

Build-time metadata populated by the Vite plugin transform:

```typescript
interface ComponentMeta {
  id: string;
  name: string;
  filename: string;
  propKeys?: string[];   // $props() destructured keys — used for prop detection
}

// Example
window.__SVELTE_DEVTOOLS_REGISTRY__.get('svt-abc123');
// { id: 'svt-abc123', name: 'Counter', filename: '/src/lib/Counter.svelte', propKeys: ["name"] }
```

### `window.__SVELTE_DEVTOOLS__`

Public API surface used by the panel iframe (see `src/index.ts:618-719`):

```typescript
interface SvelteDevToolsAPI {
  version: string;
  enabled: boolean;
  getComponentTree(): ComponentInstance[];          // nested by parentId
  getAllComponents(): ComponentInstance[];          // flat
  getComponentById(id: string): ComponentInstance | undefined;
  getTimeline(): TimelineEntry[];                   // ⚠️ stub — returns []
  setComponentState(id, key, value): void;
  startInspectBatch(): void;
  endInspectBatch(): void;
  flushAllEffects(): void;
  refresh(): void;
  enableInspector(): void;                          // hover-highlight mode
  disableInspector(): void;
  subscribe(cb): () => void;                        // no-op
  trace(name, deps): void;                          // no-op
}
```

> `getTimeline()` is currently a stub returning `[]` — the timeline lives client-side.

## Component Detection (MutationObserver)

The runtime does **not** poll for components. It uses a `MutationObserver` on `document.body` watching:

- `childList` mutations — newly added/removed nodes carrying `data-svelte-devtools-id`
- `attributes` mutations on `data-svelte-devtools-id` — Svelte 5 often sets the attribute *after* the element is in the DOM

On startup, an initial scan of `document.querySelectorAll('[data-svelte-devtools-id]')` catches components mounted before the runtime initialized. Parent/child relationships are resolved by walking DOM ancestors for the nearest `data-svelte-devtools-id`. See [ADR-0001](./adr/ADR-0001-event-driven-component-detection.md).

## Event System (postMessage Protocol)

Every message is `{ source: 'svelte-devtools', type, payload }` (see `emit`, src/index.ts:346-367):

```typescript
window.postMessage({
  source: 'svelte-devtools',
  type: 'state',
  payload: {
    type: 'state',
    componentId: 'svt-abc123',
    componentName: 'Counter',
    key: 'count',
    value: 42,
    inspectType: 'state',
    timestamp: performance.now()
  }
}, '*');
```

### Event Types

| Type | Source | Description |
|------|--------|-------------|
| `runtime-ready` | `init()` | Runtime initialized |
| `component-register` | `registerComponent()` | Component registered (payload: `{id, name, filename, parentId}`) |
| `component:unmount` | MutationObserver | Component removed from DOM |
| `state` | `handleState()` | State variable changed (payload has `inspectType: 'state'\|'derived'\|'props'`) |
| `effect` | `handleEffect()` | Effect ran (payload: `{runeName, filename, runCount, observedState}`) |
| `trace:trigger` | `reportError()` | Error reported (`key: 'error'`, `{message, stack}`) |
| `client:request` | fetch interception | Browser fetch traced (`data: {url, method, statusCode, duration, headers, preview}`) |
| `restore:echoes-done` | `endInspectBatch()` | All microtask echoes from a snapshot restore have drained |
| `inspect:select` | element inspector | User clicked a highlighted component (`{componentId}`) |
| `inspect:toggle` | element inspector | Inspector mode enabled/disabled (`{enabled}`) |

### Client-side Type Mapping

The panel maps runtime event names to bridge event names via `mapRuntimeEventTypeToBridge` (`@svelte-devtools/types`): `state`/`derived`/`inspect` → `state:change`, `effect`/`effect.pre` → `effect:run`, `props`/`bindable`/`component-register` → `component:mount`, `trace:trigger` → `trace:trigger`, `runtime-ready` → `runtime:ready`.

## State Handling & Batching

**The runtime does not batch or debounce** — every `$inspect` callback fires `handleState` → `emit` → `postMessage` synchronously. Batching is handled **client-side** in `devtools-store.svelte.ts`:

1. Incoming state changes are queued into a pending buffer
2. The buffer is flushed on a timer, collapsing to the **latest value per (componentId, key)**
3. All values are applied in a single immutable pass; timeline entries are batch-appended (capped at 1000)
4. A **motion gate** (Spring/Tween) drops mid-animation frames until `|current − target| < 0.0015`

The runtime's `startInspectBatch`/`endInspectBatch`/`flushAllEffects` are markers: `endInspectBatch` posts `restore:echoes-done` after reactivity microtasks drain, which the client uses to clear time-travel mode. See [ADR-0002](./adr/ADR-0002-debounced-state-change-batching.md).

## Time Travel Support

The runtime provides the write-back channel for time travel; all snapshot logic lives in the client (`time-travel-store.svelte.ts`):

1. The client captures snapshots of component state (only while **recording** is enabled)
2. On restore, it calls `parentApi.startInspectBatch()`, then `setComponentState(id, key, value)` for each changed key, then `endInspectBatch()` / `flushAllEffects()`
3. `setComponentState` invokes the per-key setter registered by `_registerState` (injected at build time), mutating the live rune in place — preserving Svelte 5 reactive bindings
4. Restores are deduplicated against `lastRestoredSnapshotJSON` to avoid phantom captures

## Queue Mechanisms

1. **`__SVELTE_DEVTOOLS_QUEUE__`** (src/index.ts:604-616) — an array of `(runtime) => void` callbacks pushed by the Vite transform for `_registerState` calls that fired before the runtime loaded; drained FIFO on activation, then emptied.
2. **Passive runtime buffer** (src/init.ts) — the Phase-1 placeholder buffers `{method, args}` calls until `_activate(realRuntime)` swaps in real implementations and drains.

## Serialization

`sanitizeForPostMessage` (src/index.ts:420-467) guards every emitted payload:
- Functions → `'[Function]'`, DOM nodes → `'[DOM Node]'`
- Maps → plain objects, Sets → arrays
- Circular references handled via a `seen` set; getters invoked in try/catch

## Element Inspector

The runtime renders a fixed-position orange overlay + name tooltip around hovered components (`inspectorEnable`/`inspectorDisable`, src/index.ts:473-588). Clicking a component posts `inspect:select` (the panel switches to the Components tab and selects it); `Escape` exits inspect mode.

## Architecture Summary

| Feature | Implementation |
|---------|----------------|
| Event Mechanism | `postMessage` (`{source: 'svelte-devtools', ...}`) |
| State Detection | `$inspect` injection (build time) |
| Component Detection | `MutationObserver` + initial DOM scan (no polling) |
| Batching | Client-side (debounced flush, latest-per-key) |
| State Write-back | `_registerState` setters + `setComponentState` |

## Debugging Tips

1. **Check runtime loaded**: `console.log(window.__SVELTE_DEVTOOLS_RUNTIME__)`
2. **Listen to postMessage**: `window.addEventListener('message', console.log)`
3. **Inspect state**: `window.__SVELTE_DEVTOOLS_RUNTIME__.getState()`
4. **List components**: `window.__SVELTE_DEVTOOLS_RUNTIME__.getAllComponents()`
5. **Enable debug logs**: set `window.__SVELTE_DEVTOOLS_DEBUG__ = true` (or `SVELTE_DEVTOOLS_DEBUG=true` at build time)
