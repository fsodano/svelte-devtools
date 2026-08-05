# Svelte DevTools Documentation

Full-stack debugging for Svelte 5 and SvelteKit applications, built on [Vite DevTools Kit](https://github.com/vitejs/devtools).

## Overview

Svelte DevTools provides real-time component inspection, state tracking, timeline visualization, time-travel debugging, network tracing, and migration scoring for Svelte 5 applications. It integrates directly with the Vite dev server for a seamless cross-browser debugging experience — no browser extension required.

## Features

- **Component Tree**: Visualize your Svelte component hierarchy with parent-child relationships, search, and click-to-select
- **State Inspection**: Track `$state`, `$derived`, `$props`, and `$effect` in real time (destructuring, defaults, `$bindable()` supported)
- **Element Inspector**: Hover-mode overlay that highlights Svelte components on the page
- **Time Travel**: Record state snapshots, undo/redo, restore across SvelteKit routes
- **Timeline**: Chronological event history (mounts, updates, effects, network) with filters
- **Component Graph**: Force-directed graph of the component hierarchy
- **Network Tracing**: SSR request traces (with `routeId`), client-side fetch calls, and mock rules
- **Router Inspector**: Live SvelteKit route map scanned from `src/routes`
- **Migration Scoring**: Svelte 4 → 5 migration analysis per file
- **Agent API**: RPC methods + HTTP endpoints for AI assistants and automation
- **Zero Production Impact**: All dev tools code is dev-only (`apply: 'serve'`)

## Architecture

The system uses **build-time `$inspect` injection** for state tracking and **postMessage** for event-driven UI updates:

```mermaid
flowchart TB
    subgraph Build["Build Time"]
        VP["Vite Plugin"]
    end

    subgraph Runtime["Runtime"]
        MO["MutationObserver"]
        PM["postMessage emitter"]
        RS["State handler"]
    end

    subgraph UI["DevTools Panel (iframe)"]
        WB["WindowBridge"]
        Store["Runes store"]
        CT["Component Tree"]
        TT["Time Travel"]
    end

    App -->|"$inspect inject"| VP
    VP -->|"Injected script + metadata"| Runtime
    App -->|"$state change"| RS
    MO -->|"mount/unmount"| PM
    RS -->|"postMessage"| PM
    PM --> WB
    WB --> Store
    Store --> CT
    Store --> TT
```

## Quick Start

### 1. Install the Plugin

**Development** (package not yet published):

```bash
# From this repo
npm install
npm run build

# In your project
npm link ../../svelte-dev-extension/packages/vite-plugin
npm install @vitejs/devtools
```

**Production** (once published):

```bash
npm install -D @svelte-devtools/vite-plugin @vitejs/devtools
```

### 2. Configure Vite

**Plain Vite:**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { DevTools } from '@vitejs/devtools';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

export default defineConfig({
  plugins: [DevTools(), svelte(), svelteDevTools()]
});
```

**SvelteKit:**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { DevTools } from '@vitejs/devtools';
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

export default defineConfig({
  plugins: [DevTools(), sveltekit(), svelteDevTools()]
});

// src/hooks.server.ts
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteDevToolsHandle, noopHandle } from '@svelte-devtools/vite-plugin/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

### 3. Start Development

```bash
npm run dev
```

### 4. Open DevTools

1. Look for the **Vite** floating overlay button in the bottom-right corner of your page
2. Click it to open the Vite DevTools panel (authorize with the token printed in the server terminal)
3. Select the **Svelte** tab from the dock
4. View your component tree, state, timeline, and time-travel console

## Documentation Structure

| # | Document | Description |
|---|----------|-------------|
| 1 | [Architecture](./01_architecture.md) | System design, data flow, and key decisions |
| 2 | [Vite Plugin](./02_vite-plugin.md) | Build-time transforms, configuration, HTTP API |
| 3 | [Runtime](./03_runtime.md) | $inspect handling, component detection, postMessage protocol |
| 4 | [Client UI](./04_client.md) | DevTools panel implementation and stores |
| 5 | [Server Integration](./05_server.md) | SvelteKit request tracing |
| 6 | [API Reference](./06_api.md) | Public API and type definitions |
| — | [Vite 8 Guide](./VITE.md) | Vite 8 / Rolldown internals for plugin development |
| — | [Inspiration](./inspiration.md) | Vue DevTools feature comparison |
| — | [ADR](./adr/) | Architecture Decision Records |

## Package Structure

```
packages/
├── vite-plugin/       - Build-time transforms, SvelteKit hooks, server tracing, HTTP API
├── runtime/           - Browser runtime: state handling, component registry, inspector
├── client/            - DevTools panel UI (iframe, served from dist/)
├── types/             - Shared TypeScript types and constants
└── bridge/            - birpc-based RPC layer (experimental, not yet wired in)
```

## How It Works

### Build Time

The Vite plugin transforms each `.svelte` file during development:

1. **Component Registration**: Injects registry entry with a stable `svt-*` ID
2. **Data Attributes**: Adds `data-svelte-devtools-id` and `data-svelte-component` to the root element
3. **$inspect Injection**: Wraps `$state`, `$derived`, `$props` declarations with `$inspect` hooks
4. **Effect Tracking**: Instruments `$effect` / `$effect.pre` callbacks

### Runtime

**Runtime Package** (`window.__SVELTE_DEVTOOLS_RUNTIME__`):
1. **Receives State**: `$inspect` callbacks call `runtime.handleState()`
2. **Detects Components**: A `MutationObserver` watches `data-svelte-devtools-id` attributes
3. **Emits Events**: Uses `postMessage` for real-time updates
4. **Exposes API**: `window.__SVELTE_DEVTOOLS_RUNTIME__` and `window.__SVELTE_DEVTOOLS__`

### DevTools Panel

The iframe-based UI (Svelte 5, runes stores):

1. **Listens to Events**: Receives `postMessage` from the runtime via a window bridge
2. **Displays Tree**: Hierarchical component view with search
3. **Shows State**: Real-time state inspection with full reactivity
4. **Time Travel**: Captures snapshots (while recording), restores via registered setters

## Why $inspect Injection?

Svelte 5's runes (`$state`, `$derived`, `$effect`) are **compile-time transforms**, not runtime functions. They don't exist as global objects that can be hooked at runtime. The only way to track state changes is to use `$inspect`, which is Svelte 5's public API for observing state.

| Approach | Works with Svelte 5? |
|----------|---------------------|
| Runtime rune hooking | ❌ Runes don't exist at runtime |
| `$inspect` injection | ✅ Uses public Svelte API |
| DOM scanning | ✅ But fragile and slow |

**Decision**: Use `$inspect` injection for reliable, official state tracking.

## Browser Support

- Chromium-based [tested]
- Safari [not tested]
- Firefox [not tested]

## License

MIT
