# Runtime

The browser runtime (`packages/runtime`) runs inside the inspected application page. It drains early instrumentation calls queued before the script loaded, tracks mounted component instances, receives reactive state updates from injected `$inspect` hooks, intercepts browser `fetch` calls for inspection and mocking, provides the DOM element inspector overlay, and emits JSON-safe events to the DevTools panel via `window.postMessage`.

## Loading and early-call buffering

The runtime loads directly as an ES module at `/__svelte-devtools/svelte-runtime.js` (served from `packages/runtime/dist/index.js`):

- **Plain Vite**: Injected into the page `<head>` by the Vite plugin's `transformIndexHtml` hook (`packages/vite-plugin/src/index.ts`).
- **SvelteKit SSR**: Injected into the streamed HTML response by `svelteDevToolsHandle()` via `transformPageChunk` (`packages/vite-plugin/src/sveltekit.ts`), alongside `/@svelte-devtools-navigation-bridge`.

```typescript
// src/hooks.server.ts (required for SvelteKit SSR)
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

### Direct module load and `window.__SVELTE_DEVTOOLS_QUEUE__`

Component module scripts can execute before `/__svelte-devtools/svelte-runtime.js` finishes loading. There is no separate inline placeholder or passive runtime phase (earlier versions exported `getInitScript()`, which has since been removed; see [ADR-0011](adr/ADR-0011-remove-dead-code-plugins-bridge.md)). Instead, the code injected by the Vite plugin checks whether `window.__SVELTE_DEVTOOLS_RUNTIME__` exists:

- If `window.__SVELTE_DEVTOOLS_RUNTIME__` is already present, the component calls `registerComponent`, `_registerState`, or `handleState` immediately.
- If `window.__SVELTE_DEVTOOLS_RUNTIME__` is not yet defined, the injected snippet pushes a `(runtime) => void` callback onto `window.__SVELTE_DEVTOOLS_QUEUE__`.

When `packages/runtime/src/index.ts` executes in the browser:

1. It binds all methods on `runtime` and publishes `window.__SVELTE_DEVTOOLS_RUNTIME__`.
2. It drains `window.__SVELTE_DEVTOOLS_QUEUE__` in first-in, first-out (FIFO) order, invoking each queued callback with `window.__SVELTE_DEVTOOLS_RUNTIME__`, and then resets `window.__SVELTE_DEVTOOLS_QUEUE__ = []`.
3. It publishes the panel-facing API on `window.__SVELTE_DEVTOOLS__`, registers a `pagehide` cleanup listener, and calls `runtime.init()`.

## Global browser objects

### 1. `window.__SVELTE_DEVTOOLS_RUNTIME__`

The internal runtime interface (`GlobalRuntime` in `packages/runtime/src/runtime-global.ts`, implemented by `runtime` in `packages/runtime/src/index.ts`) called by build-time injected hooks:

```typescript
// Source: packages/runtime/src/runtime-global.ts (GlobalRuntime)
export interface GlobalRuntime {
  version: string;

  /** Initialize the runtime. Called once when the module loads. */
  init(): void;

  /** Track a component mount. Called by the injected code. */
  registerComponent(id: string, name: string, filename: string, sourceLocation?: string): void;

  /** Track a component unmount. Called by the injected destroy hook. */
  unregisterComponent(id: string): void;

  /** Record a state change. Called by the injected `$inspect` hook. */
  handleState(componentId: string, key: string, type: string, value: unknown): void;

  /** Record an effect run. Called by the injected code. */
  handleEffect(componentId: string, key: string, runeName: string, filename: string): void;

  /** Register a per-key setter so the panel can restore a value into a live rune. */
  _registerState(componentId: string, key: string, setter: (v: unknown) => void): void;

  /** Apply a state value. Used by time travel restore and acknowledged live edits. */
  setComponentState(componentId: string, key: string, value: unknown): void;

  /** Report an error from the application. */
  reportError(componentId: string, error: unknown): void;

  /** Force a DOM re-scan for missed components. */
  refresh(): void;

  /** Batch markers used around a snapshot restore. */
  startInspectBatch(): void;
  endInspectBatch(): void;
  flushAllEffects(): void;

  /** Emit an event to the panel. */
  emit(event: Record<string, unknown>): void;

  /** Internal state and the tracked components. */
  getState(): { registry: unknown; connected: boolean; components: Map<string, unknown> };
  getAllComponents(): ComponentInstance[];

  /** Per-component setters, keyed by component ID and state key. */
  _registerStateStore: Map<string, Map<string, (v: unknown) => void>>;
}
```

### 2. `window.__SVELTE_DEVTOOLS_REGISTRY__`

A `Map<string, ComponentMeta>` populated by the code injected into each component's `<script>` block (`injectComponentMetadata` in `packages/vite-plugin/src/index.ts`). Each entry is keyed by the per-instance ID (`svt-<hash36>:<uid>`) and stores:

```typescript
// Illustrative shape of a window.__SVELTE_DEVTOOLS_REGISTRY__ entry
{
  id: 'svt-abc123:s1',
  parentId: 'svt-root01:s0',
  name: 'Counter',
  filename: '/src/lib/Counter.svelte',
  propKeys: ['name'] // destructured $props() keys, used to classify prop updates
}
```

When a component instance unmounts, its injected `onDestroy` callback deletes its key from `window.__SVELTE_DEVTOOLS_REGISTRY__`. Injected `_registerState` and `$inspect` callbacks check `window.__SVELTE_DEVTOOLS_REGISTRY__?.has(id)` before calling the runtime so unmounted instances cannot register stale state.

### 3. `window.__SVELTE_DEVTOOLS__`

The public browser API consumed by the DevTools panel iframe (`packages/runtime/src/index.ts`, typed by `SvelteDevToolsAPI` in `packages/types/src/index.ts`):

```typescript
// Source: packages/types/src/index.ts (SvelteDevToolsAPI)
export interface SvelteDevToolsAPI {
  version: string;
  enabled: boolean;
  getComponentTree(): ComponentInstance[];          // nested tree by parentId
  getAllComponents(): ComponentInstance[];          // flat list (el set to null for serialization)
  getComponentById(id: string): ComponentInstance | undefined;
  getTimeline(): TimelineEntry[];                   // structuredClone of newest 1000 runtime events
  subscribe(callback: (event: unknown) => void): () => void;
  trace(name: string, dependencies: string[]): void;
  getWritableStateKeys?(componentId: string): string[];
  editComponentState?(componentId: string, key: string, value: unknown): void;
  setComponentState?(componentId: string, key: string, value: unknown): void;
  refresh?(): void;
  startInspectBatch?(): void;
  endInspectBatch?(): void;
  flushAllEffects?(): void;
  enableInspector?(): void;
  disableInspector?(): void;
}
```

> **Note**: These globals exist only inside the browser window running the application. External tools and AI agents query runtime state through the authenticated HTTP API ([`docs/06_api.md`](06_api.md)) or the MCP server ([`docs/07_mcp.md`](07_mcp.md)), which read the state synced by the panel.

## Component registration and DOM correlation

### Instance registration and hierarchy

Each mounted component instance receives a unique ID (`svt-<hash36>:<$props.id()>`). When `registerComponent(id, name, filename, sourceLocation?)` runs (`packages/runtime/src/index.ts`):

1. If `state.components.has(id)` is already true, it returns immediately.
2. Otherwise, it creates a `ComponentState` record in `state.components` with an empty `state: new Map()`, `props: {}`, `children: []`, `effects: []`, and `mountTime: performance.now()`.
3. Inside a `setTimeout(..., 0)` macrotask (after Svelte finishes inserting the component's DOM elements), it resolves `parentId` and `el`:
   - **Primary parent lookup**: Reads `window.__SVELTE_DEVTOOLS_REGISTRY__?.get(id)?.parentId`, which was captured at mount time via Svelte context (`Symbol.for('svelte-devtools.component-parent')`). Context ancestry survives fragments, layouts, and components without their own DOM elements.
   - **DOM correlation and fallback ancestry**: Queries `document.querySelector('[data-svelte-devtools-id="' + id + '"]')` and stores the element on `componentState.el`. If `parentId` was not set by context, it walks up `el.parentElement` looking for the nearest ancestor with a distinct `data-svelte-devtools-id` registered in `state.components`.
4. It records the event in `eventHistory` (`type: 'component:mount'`) and posts `{ source: 'svelte-devtools', type: 'component-register', payload: { id, name, filename, parentId, timestamp } }` via `window.postMessage`.

When a component instance is destroyed, its injected `onDestroy` hook calls `runtime.unregisterComponent(id)`. That method emits `component:unmount` and removes `id` from both `state.components` and `runtime._registerStateStore`.

### `MutationObserver` fallback

The runtime does not poll the DOM on a timer. On `init()`, it runs a one-time scan of `document.body.querySelectorAll('[data-svelte-devtools-id]')` and attaches a `MutationObserver` to `document.body` (`packages/runtime/src/index.ts`) configured with:

- `childList: true` and `subtree: true`: Detects newly added or removed elements carrying `data-svelte-devtools-id` (and their descendants).
- `attributes: true` with `attributeFilter: ['data-svelte-devtools-id']`: Detects elements whose `data-svelte-devtools-id` attribute is set after the element is already in the DOM.

When nodes are removed, `tryUnregister` checks two guards before calling `unregisterComponent(id)`:
1. `if (el.isConnected) return;` — moving a DOM node inside a keyed `{#each}` block triggers a removal mutation even though the node remains connected.
2. `if (id && !window.__SVELTE_DEVTOOLS_REGISTRY__?.has(id))` — transformed components manage their own lifetime through `onDestroy`. Removing a conditional child element (`{#if}`) inside a still-mounted component leaves the component in `__SVELTE_DEVTOOLS_REGISTRY__`, so the observer does not falsely unmount it.

See [ADR-0001](adr/ADR-0001-event-driven-component-detection.md).

## State tracking, effects, and live write-back

### `handleState` and prop classification

When an injected `$inspect(value).with((t, ...v) => ...)` hook fires (`t` is `'init'` or `'update'`), it calls `runtime.handleState(componentId, key, t, v[0])` (`packages/runtime/src/index.ts`):

1. If `componentId` is not yet in `state.components` (which can happen because `$inspect` fires synchronously during component initialization while `registerComponent`'s emission runs on `setTimeout(..., 0)` if `registerComponent` was not called first), `handleState` creates a placeholder entry (`isPlaceholder: true`, `name: 'Unknown'`).
2. It stores the live value in `component.state.set(key, value)`.
3. It checks `window.__SVELTE_DEVTOOLS_REGISTRY__?.get(componentId)?.propKeys?.includes(key)`. If `key` was destructured from `$props()`, it also updates `component.props[key] = value` and sets `inspectType = 'props'` (otherwise `inspectType = type`).
4. It calls `this.emit({ type: 'state', componentId, componentName, key, value, inspectType, timestamp: performance.now() })`.

The runtime does **not** debounce or drop state events. Every `$inspect` callback emits synchronously; batching and Spring/Tween motion filtering happen in the client store (`packages/client/src/lib/stores/devtools-store.svelte.ts`). See [ADR-0002](adr/ADR-0002-debounced-state-change-batching.md) and [ADR-0006](adr/ADR-0006-inspect-state-tracking.md).

### `handleEffect`

When an instrumented `$effect` or `$effect.pre` callback runs, it calls `runtime.handleEffect(componentId, key, runeName, filename)`. The runtime looks up `component` in `state.components`, snapshots all current entries in `component.state` into `observedState`, and emits an `effect` event with `{ runeName, filename, runCount, observedState }`.

### Live state mutation and time-travel write-back

Each writable `$state`, `$props`, `Spring`, or `Tween` declaration registers a per-instance, per-key setter via `runtime._registerState(componentId, key, setter)`. Setters are stored in `runtime._registerStateStore` (`Map<componentId, Map<key, setter>>`).

The runtime exposes two write-back paths (`packages/runtime/src/index.ts`), governed by `isJsonEditable` (`packages/types/src/json-state.ts`, see [ADR-0017](adr/ADR-0017-instance-safe-state-mutation.md) and [ADR-0020](adr/ADR-0020-bounded-observation-and-live-value-separation.md)):

- **`setComponentState(componentId, key, value)`** (used during snapshot restore): Checks whether the current live value in `state.components.get(componentId)?.state.get(key)` passes `isJsonEditable`. If the live value is a function, `Map`, `Set`, class instance, or non-plain object, `setComponentState` returns without invoking the setter so serialized preview placeholders (such as `'[Function]'` or `{ type: 'Map', entries: [...] }`) never overwrite live non-JSON objects. Otherwise, it calls the registered setter and updates `comp.state.set(key, value)`.
- **`__SVELTE_DEVTOOLS__.editComponentState(id, key, value)`** (used by the panel's State editor and the `/api/set-state` / MCP `svelte_set_state` command flow): Enforces three strict checks and throws an `Error` if any check fails:
  1. `state.components.has(id)` must be true (`'Component is no longer mounted.'`).
  2. `_registerStateStore.get(id)?.has(key)` must be true (`'This value is read-only.'` — excludes `$derived` and primitive `const` declarations).
  3. Both the current live value and the new `value` must satisfy `isJsonEditable` (`'This value cannot be edited safely as JSON. Functions and other non-JSON values are read-only.'`).
  `__SVELTE_DEVTOOLS__.getWritableStateKeys(id)` returns the list of keys on `id` that currently satisfy both `_registerStateStore` membership and `isJsonEditable`.

Around a snapshot restore, the client calls `startInspectBatch()`, invokes `setComponentState` for each restored key, and calls `endInspectBatch()`. `endInspectBatch()` schedules a two-level nested `queueMicrotask` and then posts `{ source: 'svelte-devtools', type: 'restore:echoes-done' }` so the client knows all reactive `$inspect` microtask echoes from the restore have drained.

## Serialization and `postMessage` protocol

### Display-value serialization (`toDisplayValue`)

Live component state can contain functions, DOM nodes, `Map` and `Set` instances, `BigInt` values, symbols, getters, or circular references that would cause `window.postMessage` (structured clone) to throw a `DataCloneError`. Before recording an event or calling `window.postMessage`, `runtime.emit` passes `event.value` and `event.data` through `sanitizeForPostMessage` (`packages/runtime/src/index.ts`), which delegates to `toDisplayValue` (`packages/types/src/display-value.ts`):

| Input value | Serialized preview returned by `toDisplayValue` |
|---|---|
| `function` | `'[Function]'` |
| `symbol` | `'[Symbol]'` |
| `bigint` (e.g. `42n`) | `'42n'` |
| `NaN`, `Infinity`, `-Infinity`, `-0` | `'NaN'`, `'Infinity'`, `'-Infinity'`, `'-0'` |
| DOM `Node` | `'[DOM Node]'` |
| Circular object reference | `'[Circular]'` |
| `Map` | `{ type: 'Map', entries: [[keyPreview, valPreview], ...] }` |
| `Set` | `{ type: 'Set', values: [valPreview, ...] }` |
| Array holes / `undefined` elements | `'[undefined]'` |
| Accessor property (`get` without `value`) | `'[Getter]'` |
| Property inspection that throws | `'[Unavailable]'` |
| Plain object | Null-prototype object (`Object.create(null)`) with enumerable own property previews |

Because `toDisplayValue` uses `Object.getOwnPropertyDescriptors` and replaces getters with `'[Getter]'`, serializing state for the panel never executes application getter side effects or custom `toString()` methods. See [ADR-0020](adr/ADR-0020-bounded-observation-and-live-value-separation.md).

> **Note**: `packages/runtime/src/proxy-inspector.ts` (`SvelteProxyInspector` and `mutateRuntimeState`) also exists in the package source, but `packages/runtime/src/index.ts` uses `toDisplayValue` from `@fsodano/svelte-devtools-types` for all `postMessage` serialization.

### Message envelope and event types

Every message posted from the runtime to the window uses `{ source: 'svelte-devtools', type, payload }`:

```typescript
// Source: packages/runtime/src/index.ts (runtime.emit)
window.postMessage({
  source: 'svelte-devtools',
  type: sanitizedEvent.type,
  payload: sanitizedEvent
}, '*');
```

| Runtime `type` | Emitted by | Bridge event (`mapRuntimeEventTypeToBridge`) | Payload summary |
|---|---|---|---|
| `runtime-ready` | `runtime.init()` | `runtime:ready` | `{ type, componentId: 'runtime', componentName: 'Runtime', timestamp }` |
| `component-register` | `runtime.registerComponent()` | `component:mount` | `{ id, name, filename, parentId, timestamp }` |
| `component:unmount` | `runtime.unregisterComponent()` | `component:unmount` | `{ type, componentId, componentName, timestamp }` |
| `state` | `runtime.handleState()` | `state:change` | `{ type: 'state', componentId, componentName, key, value, inspectType, timestamp }` |
| `effect` | `runtime.handleEffect()` | `effect:run` | `{ type: 'effect', componentId, componentName, key, value: { runeName, filename, runCount, observedState }, timestamp }` |
| `trace:trigger` | `runtime.reportError()` / `__SVELTE_DEVTOOLS__.trace()` | `trace:trigger` | Error (`key: 'error'`, `value: { message, stack }`) or custom trace (`value: { name, dependencies }`) |
| `client:request` | `installNetworkTools()` (`network-bridge.ts`) | `client:request` | `{ type: 'client:request', timestamp, data: { id, url, method, statusCode, duration, requestHeaders, responseHeaders, requestBody, responsePreview, responseBodyTruncated, contentType, responseSize, mockResponse, mockRuleId, mockRulePattern } }` |
| `restore:echoes-done` | `runtime.endInspectBatch()` | `restore:echoes-done` | No payload; signals that post-restore microtasks have drained |
| `inspect:select` | `onInspectorClick()` | `inspect:select` | `{ componentId }` when the user clicks a highlighted component in the page |
| `inspect:toggle` | `inspectorEnable()` / `inspectorDisable()` | `inspect:toggle` | `{ enabled: boolean }` |

## Browser network interception and mock rules

During `runtime.init()`, if `window.fetch` exists, the runtime calls `installNetworkTools` (`packages/runtime/src/network-bridge.ts`), which creates a `NetworkInterceptor` (`packages/runtime/src/network.ts`) and calls `interceptor.install({ fetchOnly: true })`:

- **Scope (`fetchOnly: true`)**: Although `NetworkInterceptor` contains an `XMLHttpRequest` proxy implementation, `installNetworkTools` passes `{ fetchOnly: true }`. In the live runtime, only browser `window.fetch` calls are intercepted and mocked. Same-origin requests to `/__svelte-devtools/*` and `/.devtools/*` bypass interception and call the original `fetch` directly. Server-side `fetch` calls during SSR are traced by the Vite plugin (`packages/vite-plugin/src/sveltekit.ts`) and are not affected by browser mock rules. See [ADR-0007](adr/ADR-0007-network-interception-architecture.md).
- **Non-blocking body previews**: For real `fetch` responses, `capturePreview` clones the response and reads at most `500` bytes with a `250ms` timeout before canceling the cloned inspection reader. Streaming responses (such as Server-Sent Events) and `ReadableStream` request bodies are never blocked or consumed.
- **Same-origin mock rule sync**: `installNetworkTools` listens for `window` messages where `event.origin === window.location.origin`:
  - `svelte-devtools-get-mock-rules`: Replies to `event.source` with `{ type: 'svelte-devtools-mock-rules', rules: interceptor.getRules() }`.
  - `svelte-devtools-set-mock-rules`: Validates each rule (`id`, valid RegExp `pattern`, `enabled` boolean, and integer `statusCode` from `200` to `599`) and updates active rules via `interceptor.setRules(rules)`. When a request matches an enabled rule's method and URL regular expression, `handleFetch` emits a `client:request` event with `mockResponse: true` and returns a synthetic `Response` (`null` body for status `204`, `205`, or `304`).

## Element inspector overlay

Calling `window.__SVELTE_DEVTOOLS__.enableInspector()` (`inspectorEnable` in `packages/runtime/src/index.ts`) activates interactive DOM-to-component picking:

1. It registers capturing event listeners on `document` for `pointerover`, `click`, and `keydown`, and posts `{ source: 'svelte-devtools', type: 'inspect:toggle', payload: { enabled: true } }`.
2. On `pointerover`, `inspectorFindComponentId` walks up from `event.target` to the nearest ancestor carrying `data-svelte-devtools-id`. `inspectorShowOverlay` positions a fixed orange outline box (`2px solid #FF3E00`, `z-index: 2147483646`) over the element's `getBoundingClientRect()` and renders a floating component-name tooltip (`z-index: 2147483647`) above or below the box.
3. Clicking a highlighted element prevents the default click action, stops propagation, posts `{ source: 'svelte-devtools', type: 'inspect:select', payload: { componentId } }` (which switches the panel to the Components tab and selects that instance), and calls `inspectorDisable()`.
4. Pressing `Escape` (or calling `window.__SVELTE_DEVTOOLS__.disableInspector()`) removes the listeners and overlay elements and posts `inspect:toggle` with `{ enabled: false }`.

## Debugging the runtime in the browser console

Open the browser DevTools console on the application page (top frame) to inspect the runtime directly:

```javascript
// 1. Check the loaded runtime version and internal state
window.__SVELTE_DEVTOOLS_RUNTIME__.version;
window.__SVELTE_DEVTOOLS_RUNTIME__.getState();

// 2. List all currently mounted component instances (with per-instance IDs)
window.__SVELTE_DEVTOOLS_RUNTIME__.getAllComponents();

// 3. Inspect build-time metadata and propKeys for mounted instances
Array.from(window.__SVELTE_DEVTOOLS_REGISTRY__.entries());

// 4. Check writable state keys for a specific component instance
window.__SVELTE_DEVTOOLS__.getWritableStateKeys('svt-abc123:s0');

// 5. Watch postMessage events emitted to the panel
window.addEventListener('message', (e) => {
  if (e.data?.source === 'svelte-devtools') console.log(e.data.type, e.data.payload);
});
```

To enable verbose console logging before reload, set `window.__SVELTE_DEVTOOLS_DEBUG__ = true` (or start the dev server with `SVELTE_DEVTOOLS_DEBUG=true`).
