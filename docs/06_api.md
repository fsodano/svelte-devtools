# API Reference

Public APIs and type definitions for Svelte DevTools.

## Global APIs

### `window.__SVELTE_DEVTOOLS_RUNTIME__`

The main API exposed by the runtime package (`packages/runtime/src/index.ts`):

```typescript
interface SvelteDevToolsRuntime {
  version: string;

  /** Initialize the runtime (called automatically once the module loads) */
  init(): void;

  /**
   * Handle a state change from $inspect (called by injected code)
   * @param componentId Component ID
   * @param key State variable name
   * @param type Change type ('init' | 'update' | 'derived' | 'props')
   * @param value New value
   */
  handleState(componentId: string, key: string, type: string, value: unknown): void;

  /** Track an effect run (called by injected code) */
  handleEffect(componentId: string, key: string, runeName: string, filename: string): void;

  /** Report an error (emits a trace:trigger event) */
  reportError(componentId: string, error: unknown): void;

  /** Register a component (called by injected code) */
  registerComponent(id: string, name: string, filename: string, sourceLocation?: string): void;

  /** Register a per-key setter for time-travel restore */
  _registerState(componentId: string, key: string, setter: (v: unknown) => void): void;

  /** Apply a state value to a live rune + tracked state */
  setComponentState(componentId: string, key: string, value: unknown): void;

  /** Force a DOM re-scan for missed components */
  refresh(): void;

  /** Batch markers around snapshot restore; endInspectBatch posts 'restore:echoes-done' */
  startInspectBatch(): void;
  endInspectBatch(): void;
  flushAllEffects(): void;

  /** Emit a devtools event via postMessage */
  emit(event: RuntimeEvent): void;

  /** Get current internal state */
  getState(): DevToolsState;

  /** Get all tracked components */
  getAllComponents(): ComponentState[];
}

// Events are emitted via postMessage:
// window.postMessage({ source: 'svelte-devtools', type: '...', payload: {...} }, '*')
// window.addEventListener('message', (e) => { if (e.data.source === 'svelte-devtools') ... })
```

### `window.__SVELTE_DEVTOOLS__`

Public API surface for the panel iframe (see `SvelteDevToolsAPI` in `@fsodano/svelte-devtools-types`):

```typescript
interface SvelteDevToolsAPI {
  version: string;
  enabled: boolean;
  getComponentTree(): ComponentInstance[];            // nested by parentId
  getAllComponents(): ComponentInstance[];            // flat
  getComponentById(id: string): ComponentInstance | undefined;
  getTimeline(): TimelineEntry[];                     // ⚠️ stub — returns []
  subscribe(callback): () => void;                    // no-op
  trace(name, dependencies): void;                    // no-op
  setComponentState?(componentId, key, value): void;
  refresh?(): void;
  startInspectBatch?(): void;
  endInspectBatch?(): void;
  flushAllEffects?(): void;
  enableInspector?(): void;                           // hover-highlight mode
  disableInspector?(): void;
}
```

### `window.__SVELTE_DEVTOOLS_REGISTRY__`

Build-time registry of component metadata (injected by the plugin transform):

```typescript
const registry: Map<string, ComponentMeta> = window.__SVELTE_DEVTOOLS_REGISTRY__;

// Example usage
const meta = registry.get('svt-abc123');
// { id: 'svt-abc123', name: 'Counter', filename: '/src/lib/Counter.svelte', propKeys: ["name"] }
```

## Type Definitions (from `@fsodano/svelte-devtools-types`)

### Component Types

```typescript
/** Metadata about a component stored in the build-time registry. */
interface ComponentMeta {
  id: string;
  name: string;
  filename: string;
  runeCounts?: Record<string, number>;      // e.g. { $state: 1, $derived: 2, $effect: 1 }
  propKeys?: string[];                       // $props() destructured keys
  migrationResult?: MigrationResult;         // Svelte 4→5 score
}

/** Complete component instance tracked at runtime. */
interface ComponentInstance {
  id: string;
  name: string;
  filename?: string;
  el: Element | null;
  parentId?: string;
  children: string[] | ComponentInstance[];  // flat vs tree mode
  state: Map<string, unknown>;
  props: Record<string, unknown>;
  effects: string[];
  mountTime: number;
  isPlaceholder?: boolean;
}

/** Component data sent to the UI client (serializable). */
interface ComponentNode {
  id: string;
  name: string;
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  children: string[];
  parentId?: string;
  filename?: string;
  renderDuration?: number;
  sourceLocation?: SourceLocation;
}

/** Source code location for "open in editor". */
interface SourceLocation {
  filename: string;
  line: number;
  column: number;
}
```

### Event Types

```typescript
type EventType =
  | 'component:mount'
  | 'component:unmount'
  | 'state:change'
  | 'effect:run'
  | 'trace:trigger';

/** Timeline entry in the UI. */
interface TimelineEntry {
  id: string;
  type: EventType;
  timestamp: number;
  data: unknown;
  duration?: number;
}
```

### Runtime Event Payloads (postMessage)

```typescript
interface RuntimeEvent {
  type: string;            // 'runtime-ready' | 'component-register' | 'state' | 'effect'
                           // | 'component:unmount' | 'trace:trigger' | 'client:request'
                           // | 'restore:echoes-done' | 'inspect:select' | 'inspect:toggle'
  componentId: string;
  componentName?: string;
  filename?: string;
  key?: string;
  value?: unknown;
  inspectType?: string;    // 'state' | 'derived' | 'props' (from $inspect)
  timestamp: number;
}
```

### Bridge Types

```typescript
/** Message sent via postMessage between main window and iframe. */
interface BridgeMessage<T = unknown> {
  source: 'svelte-devtools';
  type: EventType | string;
  payload: T;
  timestamp: number;
}

type BridgeHandler<T = unknown> = (payload: T) => void;
```

### Plugin Options

```typescript
interface SvelteDevToolsPluginOptions {
  /** File patterns to include (default: [/\.svelte$/]) */
  include?: RegExp[];

  /** File patterns to exclude (default: [/node_modules/]) */
  exclude?: RegExp[];

  /** Reserved: enable state inspection via $inspect injection (default: true).
   *  Currently a no-op — injection always runs. */
  enableStateInspection?: boolean;
}
```

### Server Types

```typescript
interface ServerEvent {
  id: string;
  type: 'server:request' | 'server:ssr' | 'server:error' | 'server:trace';
  timestamp: number;
  duration?: number;
  data: {
    url: string;
    method: string;
    statusCode?: number;
    routeId?: string;
    requestBody?: string;
    responseSize?: number;
    responsePreview?: string;
    reqHeaders?: Record<string, unknown>;
    resHeaders?: Record<string, unknown>;
    _handler?: string;
  };
}
```

### Agent Response

```typescript
interface AgentResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  timestamp: number;
}
```

### Constants (`@fsodano/svelte-devtools-types/constants`)

- `EVENT_TYPES`, `RUNE_TYPES` — event/rune name constants
- `RPC_METHODS`, `RPC_TYPES` — RPC method names and 'query' | 'mutation'
- `DATA_ATTRIBUTES` — `data-svelte-devtools-id`, `data-svelte-component`
- `DOCK_CONFIG` — `{ id: 'svelte-devtools', title: 'Svelte', icon: 'simple-icons:svelte', type: 'iframe', url: '/__svelte-devtools/' }`
- `COMPONENT_ID_PREFIX` — `'svt-'`
- `LIMITS` — `MAX_TIMELINE_EVENTS: 1000`, `MAX_STATE_SNAPSHOTS: 50`, `VIRTUAL_SCROLL_THRESHOLD: 100`
- `mapRuntimeEventTypeToBridge(type)` — maps rune types to bridge event types

## Vite Plugin API

### `svelteDevTools()`

Creates the Vite plugin (single plugin object, `apply: 'serve'`, `enforce: 'pre'`).

```typescript
import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools';

const plugin = svelteDevTools(options?: SvelteDevToolsPluginOptions);
```

### `@fsodano/vite-plugin-svelte-devtools/sveltekit`

```typescript
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle = dev ? svelteDevToolsHandle() : noopHandle();
```

- `svelteDevToolsHandle()` — SvelteKit `Handle` that injects the DevTools scripts via `transformPageChunk` and traces SSR requests
- `noopHandle()` — zero-overhead pass-through for production

### Plugin Hooks

The plugin implements: `resolveId`/`load` (SvelteKit `$app/navigation` virtual module), `configResolved` (rolldown detection, tsconfig path aliases), `configureServer` (middleware: tracing, server-events, open-in-editor, migration-score, API, static assets), `transformIndexHtml` (runtime script — plain Vite), `transform` (`$inspect` injection + metadata + effect tracking + migration analysis), and `devtools.setup` (dock registration + RPC).

## RPC Methods (live)

Registered in `devtools.setup` via `ctx.rpc.register`:

| Method | Type | Description |
|---|---|---|
| `svelte-devtools:get-components` | query | All registered components with metadata |
| `svelte-devtools:open-in-editor` | mutation | Open a file at a line in the editor |
| `svelte-devtools:migration-score` | query | `{overall, totalFiles, perFile}` |
| `svelte-devtools:build-status` | query | `{connected, totalComponents, trackedRunes, errors, warnings}` |
| `svelte-devtools:component-state` | query | Metadata for one `svt-*` id |
| `svelte-devtools:rescan` | mutation | Trigger full-reload re-analysis |

> `RPC_METHODS` in `@fsodano/svelte-devtools-types` also lists `get-timeline`, `get-state`, `update-component-state`, `set-network-rule`, `get-routes` — **not yet registered** by the live plugin.

## HTTP API (CI-safe)

All endpoints at `/__svelte-devtools/api/` return JSON with CORS headers (`Access-Control-Allow-Origin: *`):

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/` or `/api/status` | Plugin status, version, endpoint list |
| `GET` | `/api/components` | Components + state, `{count, components, cachedAt}` |
| `GET` | `/api/timeline` | Timeline entries, `{count, entries, cachedAt}` |
| `GET` | `/api/remote` | Remote-debugging payload |
| `GET` | `/api/server-events` | Server traces (`?last=N`, `?sinceId=X`) |
| `DELETE` | `/api/server-events` | Clear server event buffer |
| `GET` | `/api/migration` | Migration scores, `{overall, totalFiles, perFile}` |
| `GET` | `/api/snapshots` | `{snapshots, branches, count, cachedAt}` |
| `POST` | `/api/set-state` | Edit state, body `{componentId, key, value}` |
| `GET` | `/api/source?file=<path>` | Source code with line numbers (403 outside project) |
| `POST` | `/api/sync` | (internal) Panel syncs components/timeline/snapshots here every 2s |
| `GET` | `/api/routes` | SvelteKit route map scanned from `src/routes` |

Also available (legacy paths): `/__svelte-devtools/server-events` (GET/DELETE), `/__svelte-devtools/open-in-editor` (POST), `/__svelte-devtools/migration-score` (GET).

### Example: set component state

```bash
curl -X POST http://localhost:5173/__svelte-devtools/api/set-state \
  -H 'Content-Type: application/json' \
  -d '{"componentId": "svt-xxx", "key": "count", "value": 42}'
```

> Component/timeline/snapshot data is cached via periodic sync from the panel. If the panel has not been opened, the cache may be empty (`cachedAt: 0`). Server events and migration scores are computed server-side and always available.

## Store API

The DevTools store provides reactive state for the panel (internal, in `packages/client`):

```typescript
interface DevToolsStore {
  readonly components: ComponentNode[];
  readonly selectedComponentId: string | null;
  readonly timeline: TimelineEntry[];
  readonly isConnected: boolean;
  readonly isRecording: boolean;
  readonly isInspecting: boolean;
  init(): void;
  selectComponent(id: string): void;
  toggleInspector(): void;
  refresh(): void;
}
```

## Event Flow

1. **User code** modifies `$state`
2. **$inspect callback** fires and calls `handleState()`
3. **Runtime** emits `postMessage` event
4. **WindowBridge** receives and maps it (`state` → `state:change`)
5. **Store** debounce-batches the update
6. **UI** re-renders with new data

## Type Exports

All types are exported from `@fsodano/svelte-devtools-types`:

```typescript
import type {
  ComponentMeta,
  ComponentInstance,
  ComponentNode,
  TimelineEntry,
  RuntimeEvent,
  BridgeMessage,
  BridgeHandler,
  SvelteDevToolsAPI,
  SvelteDevToolsPluginOptions,
  AgentResponse,
  ServerEvent,
  // ... and more
} from '@fsodano/svelte-devtools-types';
```
