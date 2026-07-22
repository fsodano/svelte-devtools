---
name: debug-with-svelte-devtools
description: Use when debugging Svelte 5 reactivity issues, inspecting component state, checking migration status, or troubleshooting devtools connectivity. Follow this skill when an agent needs to programmatically inspect a running Svelte app via the devtools RPC agent API or browser console globals.
---

# Debugging with Svelte DevTools

Guide for AI agents to debug Svelte 5 apps using the agent RPC API and browser console tools exposed by the devtools.

## Agent API Overview

The devtools registers RPC methods on the Vite DevTools context that any agent can invoke. All methods are accessible via `@vitejs/devtools-kit` if you have programmatic access to the devtools context, or directly in the browser console.

### RPC Methods

| Method Name | Type | Description |
|---|---|---|
| `svelte-devtools:build-status` | query | Check if the build is healthy |
| `svelte-devtools:get-components` | query | List all registered components |
| `svelte-devtools:component-state` | query | Get state snapshot of a component by ID |
| `svelte-devtools:migration-score` | query | Svelte 4 to 5 migration percentage per file |
| `svelte-devtools:rescan` | mutation | Force re-analyze all components |

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
  overall: number;     // average migration percentage (0-100)
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

Use this sequence when investigating a Svelte 5 issue with devtools:

```
Step 1: Check build health
        → svelte-devtools:build-status
        → If errors.length > 0, fix build errors first
        → If connected === false, check that the runtime loaded

Step 2: List components
        → svelte-devtools:get-components
        → Verify the component you are debugging appears in the list
        → If missing, check include/exclude patterns or rebuild

Step 3: Inspect specific component
        → svelte-devtools:component-state with the component ID
        → Check runeCounts for expected $state, $derived, $props usage
        → Cross reference filename with source file

Step 4: Check migration status
        → svelte-devtools:migration-score
        → If percentage is low, the component may still use Svelte 4 patterns
        → Low migration can cause unexpected behavior in Svelte 5

Step 5: Force rescan
        → svelte-devtools:rescan (if components are stale or missing)
        → Triggers full-reload, then repeat from step 1
```

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
npm run build:client -w @svelte-devtools/client
npm run build:runtime -w @svelte-devtools/runtime
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

Component IDs are derived from file paths. If components share a filename (e.g., `+page.svelte` in different routes), they get different IDs but the same display name. Check the `filename` field to distinguish them.

### Build errors during transform

If a `.svelte` file has a syntax error, the plugin logs the error and skips transforms for that file. Check the devtools notifications panel or the browser console for transform error messages:

```javascript
// The plugin emits messages via ctx.messages.add
// Look for: "Transform error in <ComponentName>"
// Followed by the specific babel or svelte parse error
```

## HTTP REST API

The devtools exposes an HTTP API at `/__svelte-devtools/api/` on the dev server. This allows agents to query the application state without browser access — useful for CI, AI tooling, and automation.

### Endpoints

All endpoints return JSON with `Content-Type: application/json` and CORS headers.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/__svelte-devtools/api/` | Plugin status, available endpoints |
| `GET` | `/__svelte-devtools/api/components` | All registered components and their state |
| `GET` | `/__svelte-devtools/api/timeline` | Timeline of events (mounts, state changes, effects) |
| `GET` | `/__svelte-devtools/api/server-events` | Server request traces with bodies |
| `GET` | `/__svelte-devtools/api/migration` | Svelte 4→5 migration scores |
| `GET` | `/__svelte-devtools/api/snapshots` | Snapshot branch tree (parentId, branchId, timestamps) |
| `POST` | `/__svelte-devtools/api/set-state` | Edit component state (`{componentId, key, value}`) |
| `GET` | `/__svelte-devtools/api/source?file=<path>` | Source code file lookup |
| `POST` | `/__svelte-devtools/api/sync` | (internal) Client syncs runtime state here |

### Example Usage

```bash
# Check plugin is loaded
curl http://localhost:5173/__svelte-devtools/api/

# List all components
curl http://localhost:5173/__svelte-devtools/api/components | jq '.count, .components[].name'

# Get timeline events
curl http://localhost:5173/__svelte-devtools/api/timeline | jq '.count'

# Get server event traces
curl http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'

# Get migration scores (Svelte 4→5)
curl http://localhost:5173/__svelte-devtools/api/migration

# Get snapshot branch tree
curl http://localhost:5173/__svelte-devtools/api/snapshots | jq '.snapshots | length'

# Edit component state
curl -X POST http://localhost:5173/__svelte-devtools/api/set-state \
  -H 'Content-Type: application/json' \
  -d '{"componentId": "svt-xxx", "key": "count", "value": 99}'

# Look up a source file
curl "http://localhost:5173/__svelte-devtools/api/source?file=src/App.svelte"
```

### State Editing

The API supports editing component state programmatically — useful for AI agents that want to test scenarios:

```bash
# Set a component's state value
curl -X POST http://localhost:5173/__svelte-devtools/api/set-state \
  -H 'Content-Type: application/json' \
  -d '{"componentId": "svt-xxx", "key": "count", "value": 42}'
```

This updates the cached component state on the server. The next time the client syncs, the DevTools timeline records the change and the new value is displayed.

### Snapshot Visualization

```bash
# Get snapshot / branch tree
curl http://localhost:5173/__svelte-devtools/api/snapshots
```

Returns the list of captured snapshots with their branch IDs, parent IDs, and timestamps — enabling agents to reconstruct the branching timeline. Each snapshot can have a `parentId` (for linear navigation) and `branchId` (for fork detection), enabling git-style branch topology visualization.

### Source File Lookup

```bash
# Get source code of a file
curl "http://localhost:5173/__svelte-devtools/api/source?file=src/App.svelte"
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

- Component and timeline data is cached via periodic sync from the browser. If the DevTools panel has not been opened, the cache may be empty.
- Server events and migration scores are computed server-side and always available.
- Port numbers (5173, 5174, etc.) vary by project.
