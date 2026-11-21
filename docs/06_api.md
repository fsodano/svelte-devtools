# API reference

This document specifies the public HTTP endpoints, browser globals, Vite plugin options, RPC methods, and TypeScript interfaces for Svelte DevTools `0.4.0`.

## Scope, credentials, and retention

Svelte DevTools separates browser dock authorization from HTTP API authentication:

1. **Vite DevTools dock authorization**: The `@vitejs/devtools` `0.4.8` host prints a six-digit `devframe auth code` in the dev-server terminal. Enter that code in the browser dock (`Unauthorized`) to unlock the DevTools UI.
2. **HTTP API and MCP bearer token (`SVELTE_DEVTOOLS_TOKEN`)**: Every request to `/__svelte-devtools/api/*` (and the legacy `/__svelte-devtools/*` data routes) requires a per-run bearer token ([ADR-0009](adr/ADR-0009-secure-agent-http-api.md)). Set `SVELTE_DEVTOOLS_TOKEN` in the environment before starting Vite to use a fixed value, or copy the random 64-character hex token printed in the terminal at startup.

### Cache vs. live data sources

The HTTP API serves data from three distinct sources ([ADR-0010](adr/ADR-0010-agent-http-api-live-truth.md)):

- **Browser panel cache (`panel-cache`)**: `/api/components`, `/api/timeline`, `/api/snapshots`, and `/api/remote` read from an in-memory per-session cache on the Vite dev server. An open, authorized Svelte DevTools panel in the browser syncs its state to `POST /__svelte-devtools/api/sync` every 2,000 ms (`packages/client/src/lib/stores/devtools-store.svelte.ts`). If no panel has synced yet, these endpoints return empty collections with `cachedAt: 0`.
- **Acknowledged panel command broker (`live-panel`)**: `POST /api/set-state` queues a mutation command for a specific live `sessionId` and waits up to 5,000 ms for the open panel to apply the live rune setter in the browser and acknowledge the result ([ADR-0017](adr/ADR-0017-instance-safe-state-mutation.md)). It never writes directly to the server cache.
- **Direct server observations (`server` / `filesystem` / `transform-registry`)**: `/api/server-events`, `/api/routes`, `/api/migration`, and `/api/source` run directly in the Vite dev server and do not require an open browser panel.

### Retention limits

| Buffer / Limit | Capacity | Location |
|----------------|----------|----------|
| Browser runtime timeline (`getTimeline()`) | 1,000 events (`LIMITS.MAX_TIMELINE_EVENTS`) | `packages/runtime/src/index.ts` |
| Panel client timeline store | 1,000 entries | `packages/client/src/lib/stores/devtools-store.svelte.ts` |
| Time Travel snapshot history | 50 snapshots (`LIMITS.MAX_STATE_SNAPSHOTS`) | `packages/types/src/constants.ts` |
| Network panel combined browser + server view | 500 rows (from 1,000-entry producer buffers) | `packages/client/src/lib/network-history.ts` |
| Server trace buffer (`server-events`) | 1,000 events per `ViteDevServer` | `packages/vite-plugin/src/server-events.ts` |
| Active panel sessions / pending state commands | 64 sessions / 64 pending commands | `packages/vite-plugin/src/command-broker.ts` |
| Runtime API pagination (`limit` query parameter) | 1–500 items per page | `packages/vite-plugin/src/server-api.ts` |

---

## HTTP API (`/__svelte-devtools/api/*`)

All HTTP endpoints are mounted on the Vite dev server during development (`apply: 'serve'`). Every response sets `Content-Type: application/json` and `Cache-Control: no-store`.

### Security layers ([ADR-0009](adr/ADR-0009-secure-agent-http-api.md))

1. **Host header validation (DNS-rebinding defense)**: Every protected endpoint checks `req.headers.host` before running any handler logic (`packages/vite-plugin/src/http-guard.ts`). Only `localhost`, `127.0.0.1`, `::1`, `[::1]` (on any port), hosts passed in `svelteDevTools({ allowedHosts })`, and comma-separated hostnames in `SVELTE_DEVTOOLS_ALLOWED_HOSTS` are permitted. Disallowed hosts receive `403` `{ "error": "Forbidden host" }`.
2. **CORS allow-list**: CORS is never wildcard (`*`). Every JSON response carries `Vary: Origin`. The server reflects `Access-Control-Allow-Origin: <origin>` only when the request includes an `Origin` header matching `http(s)://localhost`, `127.0.0.1`, or `[::1]` (any port), an entry in `svelteDevTools({ allowedOrigins })`, or a comma-separated origin in `SVELTE_DEVTOOLS_ALLOWED_ORIGINS`. Requests without an `Origin` header (such as `curl` or the MCP server) receive no `Access-Control-Allow-Origin` header. Unauthenticated `OPTIONS` preflight requests return `204` for allow-listed origins and `403` `{ "error": "Forbidden origin" }` otherwise.
3. **Bearer token authentication**: Every non-`OPTIONS` request must present the per-run token via `Authorization: Bearer <token>` (compared with `crypto.timingSafeEqual`). A `?token=<token>` query parameter is also accepted for clients such as `navigator.sendBeacon` that cannot set HTTP headers. Missing or invalid tokens receive `401` `{ "error": "Unauthorized" }`.

### Canonical endpoint table

All paths below are relative to `/__svelte-devtools/api` (for example, `/components` is requested as `/__svelte-devtools/api/components`).

| Method | Path | Source / Role | Query / Body Parameters | Response Shape (`200 OK`) |
|--------|------|---------------|-------------------------|---------------------------|
| `GET` | `/` or `/status` | Server + cache metadata | None | `{ ok: true, name, version, endpoints, legacyEndpoints, auth, apiVersion: 1, capabilities, operations }` |
| `GET` | `/components` | Panel cache | `?sessionId=<id>`, `?id=<instanceId>`, `?name=<substr>`, `?includeState=false`, `?offset=0`, `?limit=1..500` | `{ ok: true, count, total, offset, components, cachedAt, sessionId }` |
| `GET` | `/timeline` | Panel cache | `?sessionId=<id>`, `?type=<eventType>`, `?offset=0`, `?limit=1..500` | `{ ok: true, count, total, offset, entries, cachedAt, sessionId }` |
| `GET` | `/snapshots` | Panel cache | `?sessionId=<id>`, `?offset=0`, `?limit=1..500` | `{ ok: true, count, total, offset, snapshots, branches, cachedAt, sessionId }` |
| `GET` | `/remote` | Panel cache | `?sessionId=<id>` | `{ ok: true, ...remote, cachedAt, sessionId }` |
| `POST` | `/set-state` | Acknowledged live panel command | JSON body: `{ sessionId, componentId, key, value }` | `{ ok: true, value, recording: true }` (`409` on delivery, timeout, or runtime rejection) |
| `GET` | `/server-events` | Server trace buffer | `?last=<n>`, `?sinceId=<spanId>` | `{ ok: true, events: ServerTraceEvent[] }` |
| `DELETE` | `/server-events` | Server trace buffer | None | `{ ok: true }` |
| `GET` | `/migration` | Build-time transform registry | None | `{ ok: true, overall: number \| null, totalFiles: number, perFile: MigrationResult[] }` |
| `GET` | `/routes` | Filesystem route scanner | None | `{ ok: true, count, routes: ScannedRoute[], routesDir, configurationSource, basePath }` |
| `GET` | `/source` | Project filesystem | `?file=<path>` (required) | `{ ok: true, file: <realpath>, lines: Array<{ line: number, text: string }>, totalLines: number }` |
| `POST` | `/sync` | Internal panel sync | JSON body: `{ sessionId?, components?, timeline?, remote?, snapshots?, branches? }` | `{ ok: true, cachedAt: number }` |
| `GET` | `/commands` | Internal panel command poll | `?sessionId=<id>` (required, `<= 128` chars), `?url=<pageUrl>` | `{ ok: true, commands: StateCommand[] }` |
| `POST` | `/commands/result` | Internal panel command ack | JSON body: `{ sessionId, id, result: { ok: boolean, value?, recording?, error? } }` | `{ ok: true }` (`409` if unknown or unacknowledged command) |

### Legacy endpoints

For backward compatibility with internal panel helpers, the plugin also mounts three token-authenticated routes outside `/api/`:

- `GET /__svelte-devtools/server-events` (`?last=N`, `?sinceId=X`): returns a bare JSON array `ServerTraceEvent[]` (Note: `/api/server-events` returns `{ ok: true, events: [...] }`).
- `DELETE /__svelte-devtools/server-events`: clears the server event buffer and returns `{ ok: true }`.
- `GET /__svelte-devtools/migration-score`: identical to `GET /__svelte-devtools/api/migration` (`{ ok: true, overall, totalFiles, perFile }`).
- `POST /__svelte-devtools/open-in-editor`: accepts JSON `{ file, line?, column? }`, validates that `file` resolves inside the Vite project root (`resolveEditorLocation`), invokes `launch-editor`, and returns `{ ok: true, status: "requested" }` (or `400` / `500` on invalid path or launch failure).

### Endpoint details and error codes

#### Status and session discovery (`GET /api/` or `GET /api/status`)

Call `/api/` first to inspect server capabilities and active browser panel sessions:

- `capabilities.sessions`: array of `{ id: string, lastSeen: number, url: string }` for every panel that polled `/api/commands` within the last 5,000 ms.
- `capabilities.runtimeData`: `{ transport: 'panel-sync', requiresOpenPanel: true, cachedAt: number, sessionId: string | null, ageMs: number | null, hasSynced: boolean, note: string }`. When no panel has synced yet, `cachedAt` is `0`, `ageMs` is `null`, and `hasSynced` is `false`.

#### Runtime cache reads (`/api/components`, `/api/timeline`, `/api/snapshots`, `/api/remote`)

- **Session targeting**: Pass `?sessionId=<id>` using a session ID from `capabilities.sessions`. If `sessionId` is omitted, the server reads `caches.latest` (the most recently synced panel session). If an explicit `sessionId` has not synced any data yet, the server returns `409`:
  ```json
  { "ok": false, "error": "NO_SESSION_DATA: this panel has not synced yet." }
  ```
- **Pagination and filtering**: Filtering and slicing run on the server before JSON serialization:
  - `offset` must be a non-negative integer (default `0`). `limit` is optional and, when provided, must be an integer from `1` to `500`. Invalid values return `400` `{ "error": "offset must be a nonnegative integer; limit must be 1–500." }`.
  - `total` reports the total number of items matching the filter before pagination; `count` reports the number of items in the returned page.
  - `/api/components` filters by exact `id` and case-insensitive substring `name`. When `includeState=false`, each component entry is stripped to `{ id, name, filename, parentId }`, omitting `state` and `props` so you can discover component instance IDs without transferring large state payloads.
  - `/api/timeline` filters by exact event `type` (such as `state:change`, `component:mount`, `component:unmount`, `effect:run`, `client:request`, or `trace:trigger`).

```bash
# Example: discover mounted components without state payloads
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  'http://localhost:5173/__svelte-devtools/api/components?includeState=false&limit=100'
```

#### Acknowledged live state editing (`POST /api/set-state`)

`POST /__svelte-devtools/api/set-state` edits a writable `$state` variable (or `Spring` / `Tween` target) on a mounted component instance in a specific browser panel session ([ADR-0017](adr/ADR-0017-instance-safe-state-mutation.md), [ADR-0020](adr/ADR-0020-bounded-observation-and-live-value-separation.md)):

```bash
curl -X POST http://localhost:5173/__svelte-devtools/api/set-state \
  -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sessionId": "session-uuid-from-status", "componentId": "svt-1a2b3c:c0", "key": "count", "value": 42}'
```

1. **Validation**: If `sessionId`, `componentId`, `key`, or `value` is missing, the endpoint returns `400` `{ "error": "Missing sessionId, componentId, key, or value" }`.
2. **Delivery (`CommandBroker`)**: The broker verifies that `sessionId` polled `/api/commands` within the last 5,000 ms. The open panel polls `GET /api/commands` every 500 ms, receives at most one unacknowledged command per poll, enables Time Travel recording (`isRecording = true`), invokes `window.__SVELTE_DEVTOOLS__.editComponentState(componentId, key, value)` on the application window, awaits `tick()`, and posts the result to `POST /api/commands/result`.
3. **Writable JSON guard (`isJsonEditable`)**: Both the current live value and the new value must be safely representable in JSON (primitives, plain arrays, and plain objects). Derived values (`$derived`), unmounted components, `const` primitives without an in-place object/array setter, functions, `undefined`, `NaN`, `Infinity`, `Map`, `Set`, `Date`, class instances, symbols, and cyclic objects are rejected so JSON serialization cannot corrupt live references.
4. **Outcomes**:
   - `200 OK`: `{ "ok": true, "value": <updatedValue>, "recording": true }`. Snapshot capture and server cache updates follow asynchronously through normal `$inspect` runtime events and the next 2-second `/api/sync` cycle.
   - `409 Conflict`: `{ "ok": false, "error": "<reason>" }`. Possible reasons:
     - `SESSION_UNAVAILABLE: open the Svelte panel and choose a session from status.` (the target `sessionId` is not active).
     - `COMMAND_QUEUE_FULL` (64 commands are already pending).
     - `COMMAND_NOT_DELIVERED: the panel did not receive the command.` (the 5,000 ms timeout elapsed before the panel polled).
     - `OUTCOME_UNKNOWN: the panel received the command but did not acknowledge it. Inspect live state before retrying.` (the panel polled and received the command, so the mutation may already have run; inspect `/api/components` after the next sync instead of blindly retrying).
     - Runtime validation messages such as `Component is no longer mounted.`, `This value is read-only.`, or `This value cannot be edited safely as JSON. Functions and other non-JSON values are read-only.`

Remote snapshot restore is not exposed over HTTP or MCP.

#### Source file lookup (`GET /api/source?file=<path>`)

Resolves `file` (absolute or relative to the Vite config `root`) using `fs.realpathSync` and verifies that the canonical path lies inside `realpathSync(root)` (`packages/vite-plugin/src/server-api.ts`):

- Missing `?file=` returns `400` `{ "error": "Missing ?file= param" }`.
- Non-existent files return `404` `{ "error": "File does not exist" }`.
- Any path or symlink resolving outside the Vite project root returns `403` `{ "error": "File outside project" }`.
- Valid files return `200` `{ ok: true, file: "/canonical/path/to/File.svelte", lines: [{ line: 1, text: "..." }, ...], totalLines: N }` with 1-based line numbers.

#### Migration scores (`GET /api/migration`)

Reads `COMPONENT_REGISTRY` populated by the Vite `transform` hook (`packages/vite-plugin/src/registry.ts`). Only `.svelte` files that Vite has transformed during the current dev-server run appear in `perFile`. If no components have been transformed yet, `overall` is `null` and `totalFiles` is `0` (never a fabricated `100`; see [ADR-0010](adr/ADR-0010-agent-http-api-live-truth.md)).

#### SvelteKit routes (`GET /api/routes`)

Scans the filesystem routes directory resolved from `vite-plugin-sveltekit-setup` (`kit.files.routes`), falling back to `src/routes` when SvelteKit configuration is absent (`packages/vite-plugin/src/route-scanner.ts`). Symlinks, dotfiles, and underscore-prefixed private directories (`_helpers`) are skipped. This endpoint returns a static filesystem inventory (`ScannedRoute[]`), not the browser's currently active URL.

---

## Browser global APIs

When the Vite plugin serves an application in development, the browser window hosts three DevTools globals.

### `window.__SVELTE_DEVTOOLS_RUNTIME__` and `window.__SVELTE_DEVTOOLS_QUEUE__`

`window.__SVELTE_DEVTOOLS_RUNTIME__` (`GlobalRuntime` in `packages/runtime/src/runtime-global.ts`) is the internal hook target called by code injected into `.svelte` files at build time.

Because a component module can evaluate before `/__svelte-devtools/svelte-runtime.js` finishes loading, injected code checks for `window.__SVELTE_DEVTOOLS_RUNTIME__` first; if it is not yet defined, the injected snippet pushes a callback `(runtime) => ...` onto `window.__SVELTE_DEVTOOLS_QUEUE__`. When `svelte-runtime.js` loads, it drains `window.__SVELTE_DEVTOOLS_QUEUE__` in order and initializes the runtime.

```ts
// GlobalRuntime contract (packages/runtime/src/runtime-global.ts)
interface GlobalRuntime {
  version: string;
  init(): void;
  registerComponent(id: string, name: string, filename: string, sourceLocation?: string): void;
  unregisterComponent(id: string): void;
  handleState(componentId: string, key: string, type: string, value: unknown): void;
  handleEffect(componentId: string, key: string, runeName: string, filename: string): void;
  _registerState(componentId: string, key: string, setter: (v: unknown) => void): void;
  setComponentState(componentId: string, key: string, value: unknown): void;
  reportError(componentId: string, error: unknown): void;
  refresh(): void;
  startInspectBatch(): void;
  endInspectBatch(): void;
  flushAllEffects(): void;
  emit(event: Record<string, unknown>): void;
  getState(): { registry: unknown; connected: boolean; components: Map<string, unknown> };
  getAllComponents(): ComponentInstance[];
  _registerStateStore: Map<string, Map<string, (v: unknown) => void>>;
}
```

- `id`: each mounted component instance receives a unique runtime ID combining a stable file hash (`svt-<hash>`) and Svelte 5's per-instance `$props.id()` value (for example, `svt-1a2b3c:c0`).
- `emit(event)`: sanitizes values through `toDisplayValue()` so uncloneable values (functions, DOM nodes, cyclic objects) become safe structured-clone previews, records the event in the 1,000-entry runtime history, and posts `{ source: 'svelte-devtools', type: event.type, payload: sanitizedEvent }` via `window.postMessage`.

### `window.__SVELTE_DEVTOOLS__`

Public inspection and control API on the host page (`SvelteDevToolsAPI` in `@fsodano/svelte-devtools-types`), used by the DevTools panel iframe and browser automation:

```ts
// Public browser API (packages/types/src/index.ts)
interface SvelteDevToolsAPI {
  version: string;
  enabled: boolean;
  getComponentTree(): ComponentInstance[];            // nested hierarchy using parentId
  getAllComponents(): ComponentInstance[];            // flat copy of mounted instances
  getComponentById(id: string): ComponentInstance | undefined;
  getWritableStateKeys?(componentId: string): string[];
  editComponentState?(componentId: string, key: string, value: unknown): void;
  getTimeline(): TimelineEntry[];                     // structuredClone copy of newest 1,000 events
  subscribe(callback: (event: unknown) => void): () => void;
  trace(name: string, dependencies: string[]): void;
  setComponentState?(componentId: string, key: string, value: unknown): void;
  refresh?(): void;
  startInspectBatch?(): void;
  endInspectBatch?(): void;
  flushAllEffects?(): void;
  enableInspector?(): void;
  disableInspector?(): void;
}
```

- `getWritableStateKeys(componentId)`: returns state keys on the mounted component that have a registered setter and whose current live value passes `isJsonEditable()`.
- `editComponentState(componentId, key, value)`: validates that the component is mounted, the key has a setter, and both the current value and new `value` pass `isJsonEditable()`, then applies the live setter. Throws an `Error` if validation fails.
- `getTimeline()`: returns a `structuredClone` copy of up to 1,000 runtime events (`state:change`, `effect:run`, `component:mount`, `component:unmount`, `client:request`, `trace:trigger`, `runtime-ready`). Note: `state`, `component-register`, and `runtime-ready` events record `performance.now()` timestamps, whereas `effect`, `trace:trigger`, and `client:request` events record `Date.now()` epoch timestamps. Do not compare raw timestamps across different event types without checking their clock source.
- `subscribe(callback)`: registers a listener for sanitized runtime events and returns an independent unsubscribe function. Listener exceptions are caught so a failing subscriber never breaks application code. Final page unload (`pagehide` with `persisted === false`) clears subscribers and history; back-forward cache (`bfcache`) navigation preserves them.
- `trace(name, dependencies)`: emits a manual `trace:trigger` event with the provided label and dependency names.

### `window.__SVELTE_DEVTOOLS_REGISTRY__`

A `Map<string, { id: string; parentId?: string; name: string; filename: string; propKeys: string[] }>` populated as each instrumented component mounts and cleaned up in `onDestroy`:

- `parentId` is captured via Svelte context (`Symbol.for('svelte-devtools.component-parent')`), preserving component hierarchy across snippets, layouts, and portals.
- `propKeys` lists local bindings destructured from `$props()` so `handleState` can distinguish prop updates (`inspectType: 'props'`) from local `$state` updates.

---

## Vite plugin and server exports

### `@fsodano/vite-plugin-svelte-devtools`

```ts
import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools';
import type { SvelteDevToolsPluginOptions } from '@fsodano/svelte-devtools-types';

const plugin = svelteDevTools(options?: SvelteDevToolsPluginOptions);
```

`svelteDevTools()` returns a single Vite `Plugin` object with `apply: 'serve'` and `enforce: 'pre'`. It never runs during `vite build`.

```ts
// Plugin configuration options (packages/types/src/index.ts)
interface SvelteDevToolsPluginOptions {
  /** Inject $inspect hooks and state setters into .svelte files (default: true).
   *  When false, component registration and effect tracking still run. */
  enableStateInspection?: boolean;
  /** File patterns to instrument (default: [/\.svelte$/]) */
  include?: RegExp[];
  /** File patterns to skip (default: [/node_modules/]) */
  exclude?: RegExp[];
  /** Additional CORS origins allowed to call /__svelte-devtools/api/* (ADR-0009) */
  allowedOrigins?: string[];
  /** Additional Host header hostnames allowed to call /__svelte-devtools/api/* (ADR-0009) */
  allowedHosts?: string[];
}
```

### `@fsodano/vite-plugin-svelte-devtools/sveltekit`

```ts
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';
```

- `svelteDevToolsHandle()`: SvelteKit `Handle` for development. Injects DevTools scripts via `transformPageChunk` and records request-scoped SSR and server `fetch` spans.
- `noopHandle()`: pass-through `Handle` for production builds.
- `acquireFetchTracing()`: reference-counted global `fetch` interceptor lifecycle used by `configureServer`.

See [Server integration](05_server.md) for composition and streaming behavior.

### `@fsodano/vite-plugin-svelte-devtools/sqlite`

```ts
import { traceSqliteQuery, type SqliteTraceOptions } from '@fsodano/vite-plugin-svelte-devtools/sqlite';
```

- `traceSqliteQuery<T>(options: SqliteTraceOptions, execute: () => T): T`: measures a synchronous SQLite callback and emits a `server:sql` child span when `options.enabled` is `true` and an active request trace context exists. See [Observe a synchronous SQLite query](05_server.md#observe-a-synchronous-sqlite-query).

---

## Vite DevTools RPC methods

In `devtools.setup(ctx)`, the plugin registers six RPC methods on the `@vitejs/devtools-kit` host (`packages/vite-plugin/src/index.ts`):

| Method (`RPC_METHODS`) | Type | Payload | Return Value |
|------------------------|------|---------|--------------|
| `svelte-devtools:get-components` | `query` | None | `ComponentMeta[]` from the build-time `COMPONENT_REGISTRY` |
| `svelte-devtools:open-in-editor` | `mutation` | `{ file: string, line?: number }` | `boolean` (`true` if the resolved file exists and `launchEditor` was invoked) |
| `svelte-devtools:migration-score` | `query` | None | `{ overall: number \| null, totalFiles: number, perFile: MigrationResult[] }` |
| `svelte-devtools:build-status` | `query` | None | `AgentResponse` with `{ connected: true, totalComponents, activeComponents, trackedRunes, errors: [], warnings: [] }` |
| `svelte-devtools:component-state` | `query` | `componentId: string` (`svt-*` file ID) | `AgentResponse<ComponentMeta>` (or `NOT_FOUND` error) |
| `svelte-devtools:rescan` | `mutation` | None | Sends `{ type: 'full-reload' }` over `viteServer.ws` and returns `AgentResponse<{ rescanned: number }>` |

Note: `RPC_METHODS` in `@fsodano/svelte-devtools-types` also defines string constants for `get-timeline`, `get-state`, `update-component-state`, `set-network-rule`, and `get-routes`. Those five constants are not registered as RPC handlers by the plugin; use the HTTP API or MCP tools for timeline, live component state, state edits, and route inventory.

---

## Shared types and constants (`@fsodano/svelte-devtools-types`)

All shared contracts are exported from `@fsodano/svelte-devtools-types`:

```ts
import {
  DEVTOOLS_VERSION,        // '0.4.0'
  EVENT_TYPES,             // component:mount, component:unmount, state:change, effect:run, trace:trigger, runtime:ready, client:request
  RUNE_TYPES,              // state, derived, effect, effect.pre, props, bindable, inspect, snapshot, untrack, raw, trace:trigger, component-register, runtime-ready
  RPC_METHODS,
  RPC_TYPES,               // { QUERY: 'query', MUTATION: 'mutation' }
  DATA_ATTRIBUTES,         // { COMPONENT_ID: 'data-svelte-devtools-id', COMPONENT_NAME: 'data-svelte-component' }
  DOCK_CONFIG,             // { ID: 'svelte-devtools', TITLE: 'Svelte', ICON: 'simple-icons:svelte', TYPE: 'iframe', URL: '/__svelte-devtools/' }
  COMPONENT_ID_PREFIX,     // 'svt-'
  LIMITS,                  // { MAX_TIMELINE_EVENTS: 1000, MAX_STATE_SNAPSHOTS: 50, VIRTUAL_SCROLL_THRESHOLD: 100 }
  mapRuntimeEventTypeToBridge,
  isJsonEditable,
  toDisplayValue,
} from '@fsodano/svelte-devtools-types';

import type {
  ComponentMeta,
  ComponentInstance,
  ComponentNode,
  SourceLocation,
  EventType,
  TimelineEntry,
  ComponentMountPayload,
  ComponentUnmountPayload,
  StateChangePayload,
  EffectRunPayload,
  BridgeMessage,
  BridgeHandler,
  SvelteDevToolsAPI,
  SvelteDevToolsPluginOptions,
  AgentResponse,
  StateDeclaration,
  RuneCall,
  ComponentInfo,
} from '@fsodano/svelte-devtools-types';
```
