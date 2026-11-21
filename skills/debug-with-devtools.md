---
name: debug-with-svelte-devtools
description: Use when debugging Svelte 5 reactivity issues, inspecting component state, checking migration status, or troubleshooting devtools connectivity. Use when an agent needs to inspect a running Svelte app through MCP, authenticated HTTP, or browser tools.
---

# Debugging with Svelte DevTools

Reference for Svelte DevTools 0.4.0 on Svelte 5.20+ and Vite 8 with `@vitejs/devtools` 0.4.8. Use MCP first for agent discovery and runtime inspection. See [MCP setup](../docs/07_mcp.md) for the local stdio server.

## Credentials and prerequisites

Svelte DevTools uses two separate credentials:

1. **Dock authorization (`devframe auth code`)** — a six-digit code printed by `@vitejs/devtools` 0.4.8 in the Vite terminal. Enter it in the browser dock (`Digit 1 of 6` through `Digit 6 of 6`) so you can open the **Svelte** panel.
2. **HTTP API and MCP bearer token (`SVELTE_DEVTOOLS_TOKEN`)** — a per-run token printed in the Vite terminal (or fixed by setting `SVELTE_DEVTOOLS_TOKEN` before starting Vite). Pass it as `Authorization: Bearer <token>` on `/__svelte-devtools/api/*` requests and configure it in the MCP server environment.

Runtime inspection (`components`, `timeline`, `snapshots`, `remote`, and `set-state`) reads from the panel cache synced every 2 seconds by an open, authorized Svelte DevTools panel in Chromium.

## Agent API overview (MCP-first)

The `@fsodano/svelte-devtools-mcp` server exposes nine tools over stdio:

| MCP tool | Type | Purpose |
|---|---|---|
| `svelte_status` | read-only | Discover capabilities, operation paths, active panel sessions, and sync readiness |
| `svelte_components` | read-only | List or inspect session-scoped components (`id`, `name`, `includeState`, `sessionId`, `offset`, `limit`, `maxAgeMs`) |
| `svelte_timeline` | read-only | Read session-scoped timeline events (`type`, `sessionId`, `offset`, `limit`, `maxAgeMs`) |
| `svelte_snapshots` | read-only | Read session-scoped snapshot and branch metadata (`sessionId`, `offset`, `limit`, `maxAgeMs`); does not restore |
| `svelte_routes` | read-only | Read the SvelteKit route inventory from the resolved routes directory (`src/routes` fallback) |
| `svelte_migration` | read-only | Read Svelte 4 -> 5 migration analysis for transformed files (`overall` is `null` until scored) |
| `svelte_server_events` | read-only | Read correlated server request, fetch, and SQLite spans (`last` 1–500, optional `sinceId`) |
| `svelte_source` | read-only | Read a bounded source excerpt within the Vite project root (`file`, `startLine`, `lineCount` 1–500) |
| `svelte_set_state` | mutation | Edit writable JSON state on one mounted instance in an explicit live panel session (`sessionId`, `componentId`, `key`, `value`) |

### Debugging flow

1. Call `svelte_status`. Check `capabilities.sessions` and `capabilities.runtimeData`.
2. Choose the intended `sessionId`. Call `svelte_components` with `sessionId`, `includeState: false`, and an optional `name` filter to discover mounted instance IDs without transferring large state payloads.
3. Call `svelte_components` with `sessionId` and `id: componentId` (`includeState: true`) to read props and state for that specific mounted instance. Inspect source with `svelte_source`.
4. Use `svelte_timeline` and `svelte_server_events` to compare the observed runtime events and server traces with the app UI.
5. If the user authorized a writable-state change, follow [State editing](#state-editing). Wait for the next panel sync (every 2 seconds), then inspect again. Never infer mutation success from a cache write.

Runtime reads check freshness (default `maxAgeMs: 10000`) and reject caches that have never synced (`NO_RUNTIME_DATA`) or are stale (`STALE_RUNTIME_DATA`). A recent sync does not prove the app is still connected.

## Build-metadata RPC methods

The RPC methods below are a separate build-metadata interface registered in `devtools.setup` (`packages/vite-plugin/src/index.ts`). They require a Vite DevTools RPC context (`ctx.rpc`). Their build-time file registry IDs (`svt-<hash36>`) are **not** mounted runtime instance IDs (`svt-<hash36>:<uid>`) and cannot select a live state-edit target.

Only these six methods are registered by the plugin. Other names listed in `RPC_METHODS` constants (`get-timeline`, `get-state`, `update-component-state`, `set-network-rule`, `get-routes`) are not registered by the live plugin.

| Method name | Type | Return format | Description |
|---|---|---|---|
| `svelte-devtools:build-status` | query | `AgentResponse` | Check build health and tracked rune names |
| `svelte-devtools:get-components` | query | `ComponentMeta[]` | List all transformed component files from the build-time registry |
| `svelte-devtools:component-state` | query | `AgentResponse<ComponentMeta>` | Get build-time metadata for one file by its `svt-<hash36>` ID |
| `svelte-devtools:migration-score` | query | `{ overall, totalFiles, perFile }` | Svelte 4 -> 5 migration percentage per transformed file |
| `svelte-devtools:open-in-editor` | mutation | `boolean` | Open `{ file, line? }` in the local editor via `launch-editor` |
| `svelte-devtools:rescan` | mutation | `AgentResponse<{ rescanned: number }>` | Trigger a full page reload to re-analyze components |

### `AgentResponse<T>` schema

`svelte-devtools:build-status`, `svelte-devtools:component-state`, and `svelte-devtools:rescan` wrap their payload in `AgentResponse<T>`:

```typescript
interface AgentResponse<T = unknown> {
  ok: boolean;       // true if the call succeeded
  data?: T;          // response payload (present when ok is true)
  error?: {          // error details (present when ok is false)
    code: string;    // machine-readable error code (e.g. 'NOT_FOUND')
    message: string; // human-readable description
  };
  timestamp: number; // unix timestamp in milliseconds
}
```

### Method details

#### `svelte-devtools:build-status`

Returns the build status of the plugin transform registry (`AgentResponse`):

```typescript
{
  ok: true,
  data: {
    connected: boolean;
    totalComponents: number;
    activeComponents: number;
    trackedRunes: string[]; // ['$state', '$derived', '$props', '$effect', '$effect.pre', '$bindable', 'untrack', '$host']
    errors: string[];
    warnings: string[];
  },
  timestamp: number;
}
```

#### `svelte-devtools:get-components`

Returns the raw `ComponentMeta[]` array from `COMPONENT_REGISTRY` for every `.svelte` file transformed during the session:

```typescript
Array<{
  id: string;              // file hash ID, e.g. "svt-abc123"
  name: string;            // component filename without .svelte
  filename: string;        // full path to the .svelte file
  runeCounts?: Record<string, number>;
  propKeys?: string[];
  migrationResult?: MigrationResult;
}>
```

#### `svelte-devtools:component-state`

Takes a file `componentId` (`svt-<hash36>`) and returns `AgentResponse<ComponentMeta>`, or `{ ok: false, error: { code: 'NOT_FOUND', message: 'Component <id> not found' }, timestamp }` if the file ID is not in `COMPONENT_REGISTRY`.

#### `svelte-devtools:migration-score`

Returns `{ overall: number | null, totalFiles: number, perFile: MigrationResult[] }` directly from `computeMigrationScores()`. `overall` is `null` until at least one component has been transformed. Any component scoring below 50% also triggers a warning notification in `ctx.logs`.

#### `svelte-devtools:open-in-editor`

Takes `{ file: string, line?: number }`. Resolves `file` against the Vite root and calls `launchEditor('<file>:<line>')`. Returns `true` if the file exists, or `false` otherwise.

#### `svelte-devtools:rescan`

Sends `{ type: 'full-reload' }` over the Vite WebSocket and returns `{ ok: true, data: { rescanned: count }, timestamp }`.

## Browser console debugging

You can also inspect runtime state directly in the browser console on the application page.

### Global APIs on `window`

```javascript
// 1. Internal runtime (called by injected component code)
window.__SVELTE_DEVTOOLS_RUNTIME__
// {
//   version: '0.4.0',
//   init(): void,
//   registerComponent(id, name, filename, sourceLocation?): void,
//   unregisterComponent(id): void,
//   handleState(componentId, key, type, value): void,
//   handleEffect(componentId, key, runeName, filename): void,
//   _registerState(componentId, key, setter): void,
//   setComponentState(componentId, key, value): void,
//   reportError(componentId, error): void,
//   refresh(): void,
//   startInspectBatch(): void,
//   endInspectBatch(): void,
//   flushAllEffects(): void,
//   emit(event): void,
//   getState(): DevToolsState,
//   getAllComponents(): ComponentInstance[]
// }

// 2. Early-call queue (populated before svelte-runtime.js finishes loading, then drained to [])
window.__SVELTE_DEVTOOLS_QUEUE__

// 3. Per-instance metadata registry populated by injected component code
window.__SVELTE_DEVTOOLS_REGISTRY__
// Map<string, { id: string, parentId?: string, name: string, filename: string, propKeys: string[] }>

// 4. Public inspection API used by the DevTools panel
window.__SVELTE_DEVTOOLS__
// {
//   version: '0.4.0',
//   enabled: true,
//   getComponentTree(): ComponentInstance[],
//   getAllComponents(): ComponentInstance[],
//   getComponentById(id): ComponentInstance | undefined,
//   getWritableStateKeys(id): string[],
//   editComponentState(id, key, value): void,
//   getTimeline(): TimelineEntry[],
//   setComponentState(id, key, value): void,
//   startInspectBatch(): void,
//   endInspectBatch(): void,
//   flushAllEffects(): void,
//   refresh(): void,
//   enableInspector(): void,
//   disableInspector(): void,
//   subscribe(callback): () => void,
//   trace(name, dependencies): void
// }
```

### Quick console checks

```javascript
// Is the runtime loaded?
Boolean(window.__SVELTE_DEVTOOLS_RUNTIME__)

// How many mounted instances are in the registry?
window.__SVELTE_DEVTOOLS_REGISTRY__?.size

// List all tracked components (flat)
window.__SVELTE_DEVTOOLS__.getAllComponents()

// Get nested component tree
window.__SVELTE_DEVTOOLS__.getComponentTree()

// Check writable JSON state keys for a specific mounted instance ID
window.__SVELTE_DEVTOOLS__.getWritableStateKeys('svt-abc123:s0')

// Watch runtime events live
const unsubscribe = window.__SVELTE_DEVTOOLS__.subscribe((event) => {
  console.log('[DevTools Event]', event);
});

// Get the newest 1,000 runtime timeline entries
window.__SVELTE_DEVTOOLS__.getTimeline()
```

### Raw `postMessage` event stream

The runtime emits events to the panel via `window.postMessage`:

```javascript
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'svelte-devtools') return;
  console.log('[Svelte DevTools Event]', event.data);
});
```

Messages have the envelope `{ source: 'svelte-devtools', type, payload }`, where `type` is one of `runtime-ready`, `component-register`, `component:unmount`, `state`, `effect`, `trace:trigger`, `client:request`, `restore:echoes-done`, `inspect:select`, or `inspect:toggle`.

## Common debugging scenarios

### State not updating in DevTools view

The `$inspect` hook was not injected, or the runtime has not loaded.

1. Open the transformed component in the browser DevTools **Sources** panel and look for `$inspect(<var>).with((t,...v)=>...)`.
2. Listen for `postMessage` events with `event.data?.source === 'svelte-devtools' && event.data?.type === 'state'`.
3. If no `$inspect` call is present, check `svelteDevTools({ include, exclude, enableStateInspection })` in `vite.config.ts`.

### Component not appearing in tree

1. Check `window.__SVELTE_DEVTOOLS_REGISTRY__` in the console.
2. Check the DOM for `document.querySelectorAll('[data-svelte-devtools-id]')`.
3. Call `window.__SVELTE_DEVTOOLS__.refresh()` to force a DOM re-scan for elements carrying `data-svelte-devtools-id`.

### DevTools panel iframe is blank

The client UI was not built, or `/__svelte-devtools/` is not serving assets.

1. Check `fetch('/__svelte-devtools/').then(r => r.status)` and `fetch('/__svelte-devtools/svelte-runtime.js').then(r => r.status)`.
2. Rebuild from the repository root (`npm run build:client && npm run build:runtime`, or `npm run build`) and restart the Vite dev server.

### SSR components or server traces missing in SvelteKit

1. Verify `src/hooks.server.ts` exports `export const handle = dev ? svelteDevToolsHandle() : noopHandle();`.
2. View page source and confirm `/__svelte-devtools/svelte-runtime.js` and `/@svelte-devtools-navigation-bridge` are injected exactly once before `</head>`.

### Many components with the same name

Mounted runtime instances have distinct IDs (`svt-<hash36>:<uid>`) even when they share a filename and display name (such as 20 `PokemonCard` instances). Always select the mounted instance ID returned for the active `sessionId`. Do not reuse an instance ID after unmount, and do not confuse build-time file IDs (`svt-<hash36>`) with mounted instance IDs.

## HTTP REST API

The Vite plugin exposes a token-authenticated HTTP API at `/__svelte-devtools/api/*`. Send `Authorization: Bearer <token>` on every request (or `?token=<token>` for beacon-only requests that cannot set headers). Requests without a valid token receive `401`. Set `SVELTE_DEVTOOLS_TOKEN` before starting the dev server, or copy the token printed in the server terminal.

CORS is allow-listed: origins are reflected only for `http://localhost:*`, `http://127.0.0.1:*`, and configured `allowedOrigins`. Requests without an `Origin` header receive no CORS header.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/__svelte-devtools/api/` or `/api/status` | Plugin status, version, `capabilities.sessions`, and available endpoints |
| `GET` | `/__svelte-devtools/api/components` | Session-scoped cached components (`sessionId`, `id`, `name`, `includeState=false`, `offset`, `limit`) |
| `GET` | `/__svelte-devtools/api/timeline` | Session-scoped timeline events (`sessionId`, `type`, `offset`, `limit`) |
| `GET` | `/__svelte-devtools/api/server-events` | Server request, fetch, and SQLite traces (`last`, `sinceId`) |
| `DELETE` | `/__svelte-devtools/api/server-events` | Clear the server event buffer |
| `GET` | `/__svelte-devtools/api/migration` | Svelte 4 -> 5 migration scores (`overall` is `null` until components are scored) |
| `GET` | `/__svelte-devtools/api/snapshots` | Session-scoped snapshot and branch metadata (`sessionId`, `offset`, `limit`) |
| `GET` | `/__svelte-devtools/api/routes` | SvelteKit routes from the resolved configured routes directory (`src/routes` fallback) |
| `GET` | `/__svelte-devtools/api/remote` | Session-scoped remote-debugging payload synced from the panel |
| `GET` | `/__svelte-devtools/api/source?file=<path>` | Source code file lookup within the Vite project root |
| `POST` | `/__svelte-devtools/api/set-state` | Acknowledged live state edit (`{ sessionId, componentId, key, value }`) |
| `GET` | `/__svelte-devtools/api/commands?sessionId=<id>&url=<url>` | (internal) Panel command polling |
| `POST` | `/__svelte-devtools/api/commands/result` | (internal) Panel command acknowledgement |
| `POST` | `/__svelte-devtools/api/sync` | (internal) Panel syncs runtime state here every 2 seconds |

Legacy token-protected endpoints also exist at `/__svelte-devtools/server-events` (`GET` returns an array; `DELETE` clears), `/__svelte-devtools/migration-score` (`GET`), and `/__svelte-devtools/open-in-editor` (`POST { file, line, column }`). Prefer `/__svelte-devtools/api/*`.

### Example usage

Select a panel session ID from `capabilities.sessions` in the `GET /__svelte-devtools/api/` response and export it as `SVELTE_DEVTOOLS_SESSION`. If `sessionId` is omitted or empty, the server falls back to the most recently synced panel (`caches.latest`), which can return data from the wrong browser tab when multiple panels are open.

```bash
# 1. Check plugin status and discover active panel sessions
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/

# Export the target session ID from capabilities.sessions:
export SVELTE_DEVTOOLS_SESSION=replace-with-session-id

# 2. List component metadata for the selected session
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/components?sessionId=$SVELTE_DEVTOOLS_SESSION&includeState=false&limit=100" | jq '.count, .components[].name'

# 3. Get timeline events
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/timeline?sessionId=$SVELTE_DEVTOOLS_SESSION&limit=100" | jq '.count'

# 4. Get server event traces
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'

# 5. Get migration scores (Svelte 4 -> 5)
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/migration

# 6. Get snapshot branch tree
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/snapshots?sessionId=$SVELTE_DEVTOOLS_SESSION&limit=100" | jq '.snapshots | length'

# 7. Look up a source file
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/source?file=src/App.svelte"
```

### State editing

`POST /__svelte-devtools/api/set-state` and MCP `svelte_set_state` deliver edits to one explicit live panel session. Required fields are `sessionId`, `componentId`, `key`, and a JSON `value`. Select `sessionId` through `svelte_status` (or `GET /api/`) and `componentId` through a session-scoped component query.

Example JSON payload (replace both IDs with discovered values):

```json
{"sessionId":"panel-session-id","componentId":"mounted-instance-id","key":"count","value":42}
```

The target key must have a live setter and a JSON-editable current value. Props, `$derived` values, functions, collections, class instances, and non-JSON values are read-only. Success (`200`) acknowledges that the live setter ran and recording is active; snapshot capture follows asynchronously through runtime events. Wait for the next panel sync, then inspect state and snapshots. If the response is `409` with `OUTCOME_UNKNOWN`, inspect live state before retrying. Do not automatically retry a timed-out mutation. Remote snapshot restore is not implemented.

## Diagnose a database-backed request

After an application action, call `svelte_server_events` with `{ "last": 100 }` (or `GET /__svelte-devtools/api/server-events?last=100`). Find `server:sql` events, then match each `data.parentSpanId` to the parent request's `data.spanId`. Use `data.traceId` to group all spans in the request. Compare the same IDs in the **Network** tab's **SQL** filter and **Trace waterfall**. `svelte_server_events` accepts `last` up to 500; retained history (1,000 server events, 500 panel rows) can omit an older parent.

Inspect `duration`, `operation`, safe `error` code, optional `rowCount`, and `statementTruncated`. Statement capture requires explicit opt-in (`captureStatement: true`) and omits bindings and result rows. A query span proves that synchronous call ran, not that a surrounding transaction committed. Do not retry a database mutation from trace visibility alone or describe Time Travel as database rollback. Use [`scripts/verify-ssr-sql.mjs`](../scripts/verify-ssr-sql.mjs) for isolated regression checks.
