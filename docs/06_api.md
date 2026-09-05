# API Reference

Public APIs and type definitions for Svelte DevTools.

## Scope and retention

This reference describes release 0.2.1. Runtime inspection comes from the selected browser session's periodic authenticated panel sync. It is cached data, not a direct query of an unopened application. Use status discovery and `sessionId` to select the intended session. State edits wait for that session's runtime acknowledgement.

The Network panel retains 500 combined browser/server rows. The server trace buffer and runtime timeline each retain up to 1,000 entries. These storage limits are distinct from page sizes and MCP output limits. MCP has nine tools and bounded response parsing; see [MCP limits](07_mcp.md). Explicit synchronous SQLite query spans use `server:sql`; see [server integration](05_server.md).

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
  getWritableStateKeys?(id: string): string[];         // safe JSON-edit targets
  editComponentState?(id: string, key: string, value: unknown): void;
  getTimeline(): TimelineEntry[];                     // newest 1000 runtime events, returned as a copy
  subscribe(callback): () => void;                    // returns an unsubscribe function
  trace(name, dependencies): void;                    // emits a manual trace event
  setComponentState?(componentId, key, value): void;
  refresh?(): void;
  startInspectBatch?(): void;
  endInspectBatch?(): void;
  flushAllEffects?(): void;
  enableInspector?(): void;                           // hover-highlight mode
  disableInspector?(): void;
}
```

`getTimeline()` returns at most 1,000 events from the current runtime. Each entry has an ID, type, timestamp, and `data` containing the sanitized runtime event. State, effect, and mount types use `state:change`, `effect:run`, and `component:mount`. Event timestamps retain their source clock; do not compare relative runtime timestamps directly with epoch timestamps.

`subscribe()` receives sanitized runtime events and returns an independent unsubscribe function. Listener failures do not interrupt other listeners or the app. Returned history and delivered events are copies. `trace(name, dependencies)` emits a manual `trace:trigger` event; it does not automatically discover reactive dependencies. Final page departure clears listeners and history. Back-forward cache navigation preserves them.

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

  /** Enable component state inspection via $inspect injection (default: true).
   *  False skips state inspection and setter injection; component metadata remains. */
  enableStateInspection?: boolean;
}
```

### Server Types

```typescript
interface ServerEvent {
  id: string;
  type: 'server:request' | 'server:ssr' | 'server:error' | 'server:trace' | 'server:sql';
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

The plugin implements: `resolveId`/`load` (devtools-only navigation bridge virtual module for SvelteKit), `configResolved` (rolldown detection, tsconfig path aliases, SvelteKit detection), `configureServer` (middleware: tracing, server-events, open-in-editor, migration-score, API, static assets), `transformIndexHtml` (runtime script — plain Vite; navigation bridge — SvelteKit only), `transform` (`$inspect` injection + metadata + effect tracking + migration analysis), and `devtools.setup` (dock registration + RPC). `$app/navigation` is not intercepted.

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

## HTTP API (token-authenticated)

All endpoints at `/__svelte-devtools/api/` require the per-run bearer token. The token is generated once per dev-server run, printed in the terminal, and read from `SVELTE_DEVTOOLS_TOKEN` when set. Send it as an `Authorization: Bearer <token>` header. The panel uses periodic authenticated fetch for sync. Query-token compatibility remains available for clients that cannot set headers. Requests without a valid token get `401` with a JSON error and no application data.

CORS is allow-listed, not wildcard. The API reflects an origin only for `http://localhost:*`, `http://127.0.0.1:*`, and origins you configure (see `SVELTE_DEVTOOLS_ALLOWED_ORIGINS`). Responses always carry `Vary: Origin`. Requests with no `Origin` header (curl, server-to-server) get no CORS header at all.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/` or `/api/status` | Plugin status, version, endpoint list |
| `GET` | `/api/components` | Session-scoped component page, `{count, total, offset, components, cachedAt, sessionId}` |
| `GET` | `/api/timeline` | Session-scoped event page, `{count, total, offset, entries, cachedAt, sessionId}` |
| `GET` | `/api/remote` | Remote-debugging payload |
| `GET` | `/api/server-events` | Server traces (`?last=N`, `?sinceId=X`) |
| `DELETE` | `/api/server-events` | Clear server event buffer |
| `GET` | `/api/migration` | Migration scores, `{overall, totalFiles, perFile}`; `overall` is `null` until components are scored |
| `GET` | `/api/snapshots` | `{snapshots, branches, count, total, offset, cachedAt, sessionId}` |
| `POST` | `/api/set-state` | Acknowledged live edit; body `{sessionId, componentId, key, value}` |
| `GET` | `/api/source?file=<path>` | Source code with line numbers (403 outside project) |
| `GET` | `/api/commands?sessionId=<id>&url=<url>` | Internal panel registration and command polling |
| `POST` | `/api/commands/result` | Internal panel acknowledgement |
| `POST` | `/api/sync` | (internal) Panel syncs components/timeline/snapshots here every 2s |
| `GET` | `/api/routes` | SvelteKit route inventory from the resolved routes directory |

Also available (legacy paths): `/__svelte-devtools/server-events` (GET/DELETE), `/__svelte-devtools/open-in-editor` (POST), `/__svelte-devtools/migration-score` (GET). The legacy endpoints require the same bearer token.

Components, timeline, and snapshots accept `sessionId`, `offset`, and `limit`. Components also accept `id`, `name`, and `includeState=false` for metadata-only discovery. Timeline accepts `type`. Filtering and pagination run before the HTTP response is serialized. Pass an explicit session when multiple panels are open. MCP rejects a response that does not match an explicit session selection.

### Example: authenticated request

```bash
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/components | jq '.count'
```

### Example: edit live component state

```bash
curl -X POST http://localhost:5173/__svelte-devtools/api/set-state \
  -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sessionId": "panel-session-from-status", "componentId": "instance-id", "key": "count", "value": 42}'
```

First read `/api/` and select a session from `capabilities.sessions`. The server delivers the command to that panel and waits for acknowledgement. A `200` response confirms that the live setter ran and recording is active. JSON editing excludes functions, undefined, nonfinite numbers, collections, class instances, cycles, and nested values that JSON would discard. Restore preserves these non-JSON live values; snapshots do not reconstruct them. The edited snapshot is captured asynchronously through the normal runtime event path. It is not a cache-only write.

A `409` response includes the failure reason. `COMMAND_NOT_DELIVERED` means the panel did not receive the command. `OUTCOME_UNKNOWN` means delivery occurred without acknowledgement; inspect live state before retrying. The broker does not automatically repeat mutations. Remote snapshot restore is not exposed.

> Component/timeline/snapshot data is cached via periodic sync from the panel. If the panel has not been opened, the cache may be empty (`cachedAt: 0`). Server events require tracing integration and observed requests. Migration scores come from the live build-time registry: with no scored components, `overall` is `null` and `totalFiles` is `0` (ADR-0010).

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

## MCP adapter and capability discovery

See [Agent access with MCP](07_mcp.md) for the stdio setup, eight read-only tools, and one acknowledged state-edit tool. The adapter uses this HTTP API. State edits use the acknowledged panel command channel.

The API root reports `apiVersion`, `capabilities`, and `operations`. Check `capabilities.runtimeData.requiresOpenPanel`, `hasSynced`, `cachedAt`, and `ageMs` before interpreting component or snapshot data. Use `capabilities.sessions` to select the target panel for runtime reads and state edits. `operations.setState.supported` reports the command capability; an available session is still required. Server availability alone does not establish that runtime state is live.

MCP runtime tools reject missing or stale cache data. Direct HTTP clients must inspect the cache metadata themselves. Route results use the resolved SvelteKit routes directory, with `src/routes` as the fallback when configuration is unavailable; migration results cover transformed files. Neither endpoint is a full-project semantic analysis.

### SQLite adapter and correlated server events

The server-only `@fsodano/vite-plugin-svelte-devtools/sqlite` export provides `traceSqliteQuery(options, callback)`. `enabled` is required; `database` is a logical label; `operation` is `get`, `all`, `run`, `exec`, or `pragma`. `statement` is optional and is collected only with `captureStatement: true`. The synchronous callback's native return/error passes through unchanged. Disabled calls and calls outside a request context emit no event.

`server:sql` uses the existing event envelope, with measured `duration` in milliseconds. Its data contains `traceId`, `spanId`, `parentSpanId`, optional `routeId`, `database`, `operation`, optional `statement`, `statementTruncated`, optional `rowCount`, `status`, and optional safe `error` code. Statements are limited to 4,096 characters. Bindings and result rows are omitted. See [full semantics](05_server.md#observe-a-sqlite-query).

The canonical server-events response is an object with `events` and `count`. The legacy endpoint returns an array. MCP `svelte_server_events` accepts `last` from 1 to 500 and optional `sinceId`; returned event IDs match the HTTP API.
