# Svelte DevTools

> Real-time component inspection, state tracking, and debugging for Svelte 5 + SvelteKit

[![npm version](https://img.shields.io/npm/v/@svelte-devtools/vite-plugin)](https://www.npmjs.com/package/@svelte-devtools/vite-plugin)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00)](https://svelte.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF)](https://vite.dev)

Svelte DevTools is a professional debugging toolkit for Svelte 5 apps. It hooks into the Vite dev server to inject `$inspect` calls at build time, giving you a live view of component state, rune activity, and SSR request traces, all inside a dedicated DevTools panel powered by [Vite DevTools Kit](https://github.com/vitejs/devtools).

**Status:** v0.0.1 -- Early development. APIs may change.

---

## Features

- **Component Tree** -- Real-time component hierarchy with parent-child relationships, mount/unmount tracking, and click-to-select in the editor.
- **State Inspector** -- Deep inspection of `$state`, `$derived`, and `$props` values. Supports object destructuring, array destructuring, and nested state.
- **Event Timeline** -- Chronological view of component mount/unmount, state changes, and effect runs, with search and filtering.
- **Time-Travel Debugging** -- Capture state snapshots and step through state changes to trace how values evolve.
- **Server Request Tracing** -- (SvelteKit) Trace server load functions, API calls, and SSR page renders with timing details.
- **Migration Scoring** -- Automatic analysis of Svelte 4 to 5 migration progress per file. Shows which legacy patterns remain.
- **Motion Tracking** -- Monitor `Spring` and `Tween` animations from `svelte/motion` in real time.
- **Search and Filter** -- Find components by name, filename, or state keys across the full component tree.
- **Open in Editor** -- Click any component in the tree to jump to its source file in your editor.
- **Zero Production Impact** -- All code is dev-only (`apply: 'serve'`) and stripped from production builds.

---

## Installation

Install the plugin and the Vite DevTools Kit peer dependency:

```bash
npm install -D @svelte-devtools/vite-plugin @vitejs/devtools
```

> `@vitejs/devtools` is a peer dependency. If you use a package manager that does not auto-install peers, install it manually.

---

## Setup

### Vite + Svelte (plain)

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { DevTools } from '@vitejs/devtools';
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

export default defineConfig({
  plugins: [
    DevTools(),
    svelte(),
    svelteDevTools()
  ]
});
```

### SvelteKit

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { DevTools } from '@vitejs/devtools';
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

export default defineConfig({
  plugins: [
    DevTools(),
    sveltekit(),
    svelteDevTools()
  ]
});
```

```typescript
// src/hooks.server.ts
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteDevToolsHandle, noopHandle } from '@svelte-devtools/vite-plugin/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

The SvelteKit handle helper injects runtime scripts via `transformPageChunk` so DevTools work in SSR mode. The `noopHandle()` pass-through ensures production builds have no overhead.

---

## Plugin Options

The `svelteDevTools()` plugin accepts an optional options object:

```typescript
interface SvelteDevToolsPluginOptions {
  /** Enable state inspection via $inject injection (default: true) */
  enableStateInspection?: boolean;

  /** File patterns to include for transform (default: [/\.svelte$/]) */
  include?: RegExp[];

  /** File patterns to exclude from transform (default: [/node_modules/]) */
  exclude?: RegExp[];
}
```

### Example with custom filters

```typescript
svelteDevTools({
  enableStateInspection: true,
  include: [/\.svelte$/],
  exclude: [/node_modules/, /\.svelte-kit/]
})
```

---

## How It Works

| Stage | What Happens |
|-------|--------------|
| **Build** | Vite plugin parses `.svelte` files with the Svelte compiler, walks the AST with Babel, and injects `$inspect` hooks alongside component metadata. |
| **Runtime** | A runtime script loaded in the browser catches `$inspect` callbacks, tracks `$state`/`$derived`/`$effect` activity, and emits structured events via `postMessage`. |
| **UI** | The DevTools iframe (provided by Vite DevTools Kit) receives events and renders the component tree, state inspector, and event timeline. |

```
.svelte file -> [Vite Transform] -> $inspect injection -> Runtime handler -> postMessage -> DevTools UI
```

### Why $inspect?

Svelte 5 runes are compile-time transforms that don't exist at runtime. `$inspect` is the official Svelte 5 API for observing state values. By injecting `$inspect` calls during the build step, DevTools can track state without modifying the Svelte runtime or requiring any changes to your source code.

---

## Package Structure

```
packages/
  vite-plugin/   Build-time transforms, SvelteKit hooks, migration analyzer
  runtime/       Browser runtime: event dispatch, component registry, state handlers
  client/        DevTools iframe UI (Svelte 5, built with Vite)
  types/         Shared TypeScript types and constants
```

---

## Agent API

AI coding assistants can query Svelte DevTools via RPC methods exposed through the Vite DevTools Kit. All responses follow the `AgentResponse<T>` schema:

```typescript
interface AgentResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  timestamp: number;
}
```

### RPC Methods

| Method | Type | Description |
|--------|------|-------------|
| `svelte-devtools:build-status` | query | Is the build healthy? Returns component count, tracked runes, errors. |
| `svelte-devtools:component-state` | query | Get the full state snapshot of a component by its ID. |
| `svelte-devtools:get-components` | query | List all registered components with metadata. |
| `svelte-devtools:get-timeline` | query | Retrieve the event timeline entries. |
| `svelte-devtools:get-state` | query | Get the current tracked state for a specific component. |
| `svelte-devtools:migration-score` | query | Svelte 4 to 5 migration progress across the codebase. |
| `svelte-devtools:open-in-editor` | mutation | Open a file at a specific line in the editor. |
| `svelte-devtools:rescan` | mutation | Force a full re-analysis of all components. |

### Usage Examples

```typescript
// Get build health
const status = await rpc.call('svelte-devtools:build-status');
// { ok: true, data: { connected: true, totalComponents: 42, trackedRunes: [...], errors: [] }, timestamp: 1714... }

// Inspect a component
const comp = await rpc.call('svelte-devtools:component-state', 'svt-a1b2c3');
// { ok: true, data: { id: 'svt-a1b2c3', name: 'Counter', runeCounts: { $state: 1, $derived: 1 } }, timestamp: ... }

// Get migration score
const migration = await rpc.call('svelte-devtools:migration-score');
// { overall: 72, totalFiles: 14, perFile: [{ filename: '...', percentage: 85 }, ...] }

// Force rescan
await rpc.call('svelte-devtools:rescan');
// { ok: true, data: { rescanned: 42 }, timestamp: ... }
```

---

## Development

### Workspace setup

This is an npm workspaces monorepo with packages under `packages/`.

```bash
# Install dependencies
npm install

# Build all packages (order: types -> runtime -> vite-plugin -> client)
npm run build

# Run tests
npm test
```

### Individual package builds

```bash
npm run build:types        # @svelte-devtools/types
npm run build:runtime      # @svelte-devtools/runtime
npm run build:vite-plugin  # @svelte-devtools/vite-plugin
npm run build:client       # @svelte-devtools/client
```

### Development workflow

Run the Vite or SvelteKit test app in dev mode. The plugin auto-detects changes in the workspace packages and hot-reloads.

### Debug logging

```bash
SVELTE_DEVTOOLS_DEBUG=true npm run dev
```

---

## Documentation

- [Architecture and Data Flow](docs/01_architecture.md)
- [Vite Plugin Details](docs/02_vite-plugin.md)
- [Runtime API](docs/03_runtime.md)
- [Client UI](docs/04_client.md)

---

## License

MIT
