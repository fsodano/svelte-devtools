---
name: debug-with-svelte-devtools
description: Use when debugging Svelte 5 reactivity issues, inspecting component state, checking migration status, or troubleshooting devtools connectivity. Use when an agent needs to inspect a running Svelte app through MCP, authenticated HTTP, or browser tools.
---

# Debugging with Svelte DevTools

Reference for Svelte DevTools 0.1.0 on Svelte 5.20+ and Vite 8. Use MCP first for agent discovery and runtime inspection. See [MCP setup](../docs/07_mcp.md) for the local stdio server.

## Agent API Overview

Call `svelte_status` first. Select a panel session from `capabilities.sessions`. Call `svelte_components` with `sessionId` and `includeState: false` to discover mounted instance IDs. Then inspect a specific ID with state included. Component, timeline, and snapshot reads accept `sessionId`, `offset`, and `limit`.

Runtime reads use panel caches. Keep the app and an authorized Svelte panel open. Check freshness before drawing conclusions; MCP rejects missing or stale syncs. A recent sync does not prove the app is still connected.

The RPC methods below are a separate build-metadata interface. They require a Vite DevTools context. Their file registry IDs are not mounted runtime IDs and cannot select a live state-edit target.

### RPC Methods

Only these methods are registered by the plugin (`svelteDevTools()` → `devtools.setup`). Methods listed in `RPC_METHODS` constants but missing here (`get-timeline`, `get-state`, `update-component-state`, `set-network-rule`, `get-routes`) are **not implemented** and will not respond.

| Method Name | Type | Description |
|---|---|---|
| `svelte-devtools:build-status` | query | Check if the build is healthy |
| `svelte-devtools:get-components` | query | List all registered components |
| `svelte-devtools:component-state` | query | Get metadata of a component by ID |
| `svelte-devtools:migration-score` | query | Svelte 4 to 5 migration percentage per file |
| `svelte-devtools:open-in-editor` | mutation | Open a file at a line in the editor |
| `svelte-devtools:rescan` | mutation | Force re-analyze all components (full-reload) |

### Response Schema

All RPC responses follow the `AgentResponse<T>` format:

```typescript
interface AgentResponse<T = unknown> {
  ok: boolean;       // true if the call succeeded
  data?: T;          // response payload (present when ok is true)
  error?: {          // error details (present when ok is false)
    code: string;    // machine-readable error code (e.g. 'NOT_FOUND')
    message: string; // human-readable description
  };
  timestamp: number; // unix timestamp of the response
}
```

## Method Details

### `svelte-devtools:build-status`

Returns the current health of the devtools build system.

**Response data shape:**
```typescript
{
  connected: boolean;
  totalComponents: number;
  activeComponents: number;
  trackedRunes: string[];
  errors: string[];
  warnings: string[];
}
```

**Console usage:**
```javascript
// If using devtools-kit programmatically
const status = await ctx.rpc.call('svelte-devtools:build-status');
// OK: { ok: true, data: { connected: true, totalComponents: 5, ... }, timestamp: 1712345678 }
// Error: { ok: false, error: { code: 'BUILD_ERROR', message: '...' }, timestamp: 1712345678 }
```

### `svelte-devtools:get-components`

Lists every component the plugin has encountered during build transforms.

**Response data shape:**
```typescript
Array<{
  id: string;              // e.g. "svt-abc123"
  name: string;            // component filename without extension
  filename: string;        // full path to the .svelte file
  runeCounts?: Record<string, number>;
  migrationResult?: MigrationResult;
}>
```

**Console usage:**
```javascript
const components = await ctx.rpc.call('svelte-devtools:get-components');
// Returns array of all ComponentMeta entries from the build-time registry
```

### `svelte-devtools:component-state`

Get the full metadata for a single component by its `svt-*` ID.

**Parameters:**

- `componentId` (string) -- the component's `svt-*` identifier

**Response data shape:**
```typescript
ComponentMeta  // same shape as get-components entries
```

**Console usage:**
```javascript
const detail = await ctx.rpc.call('svelte-devtools:component-state', 'svt-abc123');
// OK: { ok: true, data: { id: 'svt-abc123', name: 'Counter', ... } }
// NOT_FOUND: { ok: false, error: { code: 'NOT_FOUND', message: 'Component svt-abc123 not found' } }
```

### `svelte-devtools:migration-score`

Returns the Svelte 4 to 5 migration progress across all components.

**Response data shape:**
```typescript
{
  overall: number | null; // null until components are scored
  totalFiles: number;  // number of files analyzed
  perFile: Array<{
    filename: string;
    maxScore: number;
    actualScore: number;
    percentage: number;
    patterns: Array<{
      svelte4: string;
      svelte5: string;
      weight: number;
      migrated: boolean;
      detected: boolean;
    }>;
  }>;
}
```

**Console usage:**
```javascript
const migration = await ctx.rpc.call('svelte-devtools:migration-score');
// { ok: true, data: { overall: 72, totalFiles: 8, perFile: [...] } }
```

A percentage below 50 triggers a warning message in the devtools notifications panel for each affected component.

### `svelte-devtools:rescan`

Triggers a full page reload to force the plugin to re-analyze all components. Use this after adding new components or changing plugin configuration.

**Response data shape:**
```typescript
{
  rescanned: number;  // number of components registered before reload
}
```

**Console usage:**
```javascript
const result = await ctx.rpc.call('svelte-devtools:rescan');
// Page reloads. Response: { ok: true, data: { rescanned: 5 } }
```

## Debugging Flow

1. Call `svelte_status`. Check available operations and panel sessions.
2. Choose the intended `sessionId`. Call `svelte_components` with `includeState: false` and a name filter.
3. Query the selected mounted instance ID with state included. Check freshness and inspect source with `svelte_source`.
4. Use `svelte_timeline` and `svelte_server_events` to compare the observed behavior with the app UI.
5. If the user requested a writable-state change, follow [State Editing](#state-editing). Inspect again after the next sync. Do not infer mutation success from a cache write.

## Browser Console Debugging

You can also debug directly from the browser's developer tools.

### Global APIs

Three globals are available on `window`:

```javascript
// 1. Runtime state
window.__SVELTE_DEVTOOLS_RUNTIME__
// {
//   version: string,
//   handleState(componentId, key, type, value): void,
//   registerComponent(id, name, filename): void,
//   getAllComponents(): ComponentState[],
//   getState(): DevToolsState
// }

// 2. Component registry (build-time metadata)
window.__SVELTE_DEVTOOLS_REGISTRY__
// Map<string, { id: string, name: string, filename: string }>

// 3. Public API (live runtime data)
window.__SVELTE_DEVTOOLS__
// {
//   version: string,
//   enabled: boolean,
//   getComponentTree(): ComponentInstance[],
//   getAllComponents(): ComponentInstance[],
//   getComponentById(id): ComponentInstance | undefined,
//   getTimeline(): TimelineEntry[],
//   subscribe(callback): () => void
// }
```

### Quick Console Checks

```javascript
// Is the runtime loaded?
Boolean(window.__SVELTE_DEVTOOLS_RUNTIME__)

// Is the registry populated?
window.__SVELTE_DEVTOOLS_REGISTRY__.size

// List all tracked components
window.__SVELTE_DEVTOOLS_RUNTIME__.getAllComponents()

// Get live component tree
window.__SVELTE_DEVTOOLS__.getComponentTree()

// Watch state changes live
window.__SVELTE_DEVTOOLS__.subscribe((event) => {
  console.log('[DevTools Event]', event);
});

// Check the devtools version
window.__SVELTE_DEVTOOLS__.version

// Get the event timeline
window.__SVELTE_DEVTOOLS__.getTimeline()
```

### Event Stream

The runtime emits events via `postMessage`. You can listen to the raw stream:

```javascript
window.addEventListener('message', (event) => {
  if (event.data.source !== 'svelte-devtools') return;
  console.log('[Svelte DevTools Event]', event.data);
});
```

Events have this shape:

```typescript
{
  source: 'svelte-devtools',
  type: 'runtime-ready' | 'component-register' | 'state',
  payload: {
    componentId: string,
    componentName?: string,
    key?: string,
    value?: unknown,
    timestamp: number
  }
}
```

## Common Debugging Scenarios

### State not updating in DevTools view

The `$inspect` hook was not injected or the runtime is not receiving the callback.

```javascript
// 1. Check that $inspect was injected into the component source
// Open the component's source in DevTools Sources panel
// Look for: `$inspect($VAR).with((t,...v)=>...`

// 2. Check the runtime is receiving the call
// Add a breakpoint in handleState or listen to postMessage:
window.addEventListener('message', (event) => {
  if (event.data.source === 'svelte-devtools' && event.data.type === 'state') {
    console.log('State change received:', event.data.payload);
  }
});

// 3. If no event fires, the $inspect injection was skipped
// Check the plugin's include/exclude patterns for this file
```

### Component not appearing in tree

The component failed to register, or registration happened before the UI connected.

```javascript
// 1. Check the registry
console.log(window.__SVELTE_DEVTOOLS_REGISTRY__);

// 2. Check for the data attribute on the DOM element
document.querySelector('[data-svelte-devtools-id]');
// Should return the component's root element

// 3. Manually trigger registration if needed
window.__SVELTE_DEVTOOLS_RUNTIME__?.registerComponent(
  'svt-manual-1',
  'MyComponent',
  '/src/lib/MyComponent.svelte'
);
```

### DevTools iframe blank

The client UI was not built or the `/__svelte-devtools/` endpoint is not serving assets.

```javascript
// 1. Check the endpoint directly
fetch('/__svelte-devtools/')
  .then(r => r.text())
  .then(html => console.log(html.includes('svelte') ? 'OK' : 'NOT OK'));

// 2. Check the runtime endpoint
fetch('/__svelte-devtools/svelte-runtime.js')
  .then(r => r.text())
  .then(code => console.log(code.length + ' bytes loaded'));
```

If the endpoints return 404, rebuild the client and runtime packages:

```bash
npm run build:client
npm run build:runtime
```

### SSR components not tracked

Server-rendered components do not have access to browser globals. The hooks file must be configured correctly.

```javascript
// 1. Verify the hooks file exists
// Check src/hooks.server.ts for the correct setup

// 2. Check that the runtime script was injected into the HTML
// View page source and search for: /__svelte-devtools/svelte-runtime.js

// 3. Ensure the handle function wraps transformPageChunk
// The svelteDevToolsHandle() function calls resolve() with transformPageChunk
// that injects both the devtools client injection and the runtime script
```

### Migration score shows 0% or low

The component is using Svelte 4 patterns (on:click, let:, export let, etc.) and has not been migrated.

```javascript
// Get detailed migration data
const score = await ctx.rpc.call('svelte-devtools:migration-score');
score.data.perFile.forEach(file => {
  console.log(`${file.filename}: ${file.percentage}% migrated`);
  file.patterns.filter(p => !p.migrated).forEach(p => {
    console.log(`  Svelte 4: ${p.svelte4} → Svelte 5: ${p.svelte5}`);
  });
});
```

### Many components with the same name

Mounted runtime instances have distinct IDs even when they share a filename and display name. Use the ID returned for the selected panel session. Do not reuse it after unmount. Build-time RPC metadata uses file IDs; those are a different registry.

### Build errors during transform

If a `.svelte` file has a syntax error, the plugin logs the error and skips transforms for that file. Check the devtools notifications panel or the browser console for transform error messages:

```javascript
// The plugin emits messages via ctx.logs.add (DevToolsLogsHost)
// Look for: "Transform error in <ComponentName>"
// Followed by the specific babel or svelte parse error
```

## HTTP REST API

The devtools exposes an HTTP API at `/__svelte-devtools/api/` on the dev server. Agents can query this transport without controlling the browser, but runtime caches still require an open, authorized Svelte panel. Every endpoint requires the per-run token: send it as an `Authorization: Bearer <token>` header. The panel uses periodic authenticated fetch for sync. Requests without a valid token get `401`. Set `SVELTE_DEVTOOLS_TOKEN` before starting the dev server, or copy the token printed in the server terminal.

### Endpoints

All endpoints return JSON with `Content-Type: application/json`. CORS is allow-listed, not wildcard: origins are reflected only for `http://localhost:*`, `http://127.0.0.1:*`, and configured origins. Requests without an `Origin` header get no CORS header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/__svelte-devtools/api/` | Plugin status, available endpoints |
| `GET` | `/__svelte-devtools/api/components` | Session-scoped cached components; supports filters, pagination, and `includeState=false` |
| `GET` | `/__svelte-devtools/api/timeline` | Timeline of events (mounts, state changes, effects) |
| `GET` | `/__svelte-devtools/api/server-events` | Server request traces with bodies |
| `GET` | `/__svelte-devtools/api/migration` | Svelte 4→5 migration scores; `overall` is `null` until components are scored |
| `GET` | `/__svelte-devtools/api/snapshots` | Snapshot branch tree (parentId, branchId, timestamps) |
| `GET` | `/__svelte-devtools/api/routes` | SvelteKit routes from the resolved configured routes directory |
| `GET` | `/__svelte-devtools/api/remote` | Remote-debugging payload synced from the panel |
| `GET` | `/__svelte-devtools/api/source?file=<path>` | Source code file lookup |
| `POST` | `/__svelte-devtools/api/set-state` | Acknowledged live edit (`{sessionId, componentId, key, value}`) |
| `POST` | `/__svelte-devtools/api/sync` | (internal) Client syncs runtime state here |

### Example Usage

```bash
# Check plugin is loaded
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/

# After selecting a session from status, list component metadata
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/components?sessionId=$SVELTE_DEVTOOLS_SESSION&includeState=false&limit=100" | jq '.count, .components[].name'

# Get timeline events
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/timeline?sessionId=$SVELTE_DEVTOOLS_SESSION&limit=100" | jq '.count'

# Get server event traces
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'

# Get migration scores (Svelte 4→5)
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/migration

# Get snapshot branch tree
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/snapshots?sessionId=$SVELTE_DEVTOOLS_SESSION&limit=100" | jq '.snapshots | length'

# Look up a source file
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/source?file=src/App.svelte"
```

### State Editing

`POST /api/set-state` and MCP `svelte_set_state` deliver edits to one explicit live panel session. Required fields are `sessionId`, `componentId`, `key`, and a JSON `value`. Select the session through status discovery and the mounted component through a session-scoped component query.

Example MCP arguments for an authorized edit (replace both IDs with discovered values):

```json
{"sessionId":"panel-session-id","componentId":"mounted-instance-id","key":"count","value":42}
```

Use the same object as the HTTP POST JSON body with the bearer token. The key must have a live setter. Derived values and non-JSON values are read-only. Success acknowledges the setter and active recording; snapshot capture follows through runtime events. Wait for the next panel sync, then inspect state and snapshots. If the response is `OUTCOME_UNKNOWN`, inspect before retrying. Do not automatically retry a timed-out mutation. Remote snapshot restore is not implemented.

### Snapshot Visualization

```bash
# Get snapshot / branch tree
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/snapshots?sessionId=$SVELTE_DEVTOOLS_SESSION&limit=100"
```

Returns the list of captured snapshots with their branch IDs, parent IDs, and timestamps — enabling agents to reconstruct the branching timeline. Each snapshot can have a `parentId` (for linear navigation) and `branchId` (for fork detection), enabling git-style branch topology visualization.

### Source File Lookup

```bash
# Get source code of a file
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  "http://localhost:5173/__svelte-devtools/api/source?file=src/App.svelte"
```

### Response Format

```json
{
  "ok": true,
  "count": 3,
  "components": [],
  "cachedAt": 1712345678000
}
```

### Notes

- Component, timeline, and snapshot data is cached separately by panel session via periodic authenticated fetch. If the DevTools panel has not been opened, the cache may be empty.
- Server events require tracing integration and observed requests. Migration scores come from the live build-time registry: with no scored components, `overall` is `null` and `totalFiles` is `0`.
- Port numbers (5173, 5174, etc.) vary by project.
