# Svelte DevTools Developer Documentation

## Overview
Svelte DevTools is a monorepo with 5 packages and ~20 source files per package.
This documentation is for developers CONTRIBUTING to the devtools themselves.

## Getting Started

### Prerequisites
- Node.js 20+
- npm workspaces

### Setup
```bash
git clone ...
npm install
```

### Build Order
```bash
npm run build:types      # Shared types
npm run build:runtime    # Browser runtime (tsc + rolldown)
npm run build:bridge     # RPC transport layer (birpc)
npm run build:vite-plugin # Vite plugin (tsc)
npm run build:client     # DevTools UI (vite build)

# Or all at once:
npm run build
```

### Test
```bash
npm test                 # Builds everything then runs vitest
# Or just tests:
npx vitest run tests/vite-plugin/
npx vitest run tests/runtime/
```

## Documentation Structure

| Document | Description |
|----------|-------------|
| 01_architecture.md | System design, data flow, component interactions |
| 02_vite-plugin.md | Vite plugin development (multi-plugin composition, transforms) |
| 03_runtime.md | Runtime development (state tracking, proxy inspector, network interception) |
| 04_client.md | Client UI development (Svelte 5 components, stores, bridge) |
| 05_server.md | Server-side tracing (SvelteKit hooks, middleware) |
| 06_api.md | Full API reference for all packages |

## Architecture Decision Records

| ADR | Decision |
|-----|----------|
| 0001 | Event-driven component detection (MutationObserver over polling) |
| 0002 | Debounced state change batching (50ms window) |
| 0003 | birpc-based RPC communication layer |
| 0004 | Virtual runtime module pattern |
| 0005 | Plugin composition pattern (Plugin[] array) |
| 0006 | $inspect-based state tracking |
| 0007 | Network interception architecture |
| 0008 | State reconstruction via surgical JSON diff |

## Package Architecture

### Package Dependencies
```
types → runtime → bridge → vite-plugin → client
```

### Key Libraries
| Library | Used In | Purpose |
|---------|---------|---------|
| magic-string | vite-plugin | Source-map-preserving string transformations |
| @babel/parser | vite-plugin | JavaScript/TypeScript AST parsing |
| birpc | bridge | Type-safe RPC stubs |
| @vitejs/devtools-kit | vite-plugin | Dock registration, RPC, logs API |
| svelte/compiler | vite-plugin | Svelte 5 AST parsing |
| vitest + happy-dom | root | Unit testing |
| rolldown | root | ESM bundling |

## Application Architecture

### Data Flow
Build-time $inspect injection → Runtime state tracking → Bridge RPC → Client UI

### Communication
- Runtime → Client: postMessage via WindowBridge
- Client → Server: HTTP API at /__svelte-devtools/api/*
- Server → Client: WebSocket (future via WebSocketAdapter)
- Plugin ↔ DevTools Kit: DevToolsNodeContext RPC + dock API

## Development Tips
- Set `SVELTE_DEVTOOLS_DEBUG=true` for verbose logging
- Use `curl localhost:5173/__svelte-devtools/api/` for HTTP API verification
- The Runtime builds with rolldown (ESM), not tsc alone
- Vite/rolldown auto-detects source changes in workspace packages
