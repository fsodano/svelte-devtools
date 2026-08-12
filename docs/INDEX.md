# Svelte DevTools Developer Documentation

## Overview
Svelte DevTools is an npm-workspaces monorepo with 4 packages. This documentation is for developers CONTRIBUTING to the devtools themselves.

## Getting Started

### Prerequisites
- Node.js 20.19+
- npm workspaces
- Vite 8 (Rolldown-based)

### Setup
```bash
git clone <repo-url>
npm install
```

### Build Order
```bash
npm run build:types        # Shared types
npm run build:runtime      # Browser runtime (tsc + rolldown)
npm run build:vite-plugin  # Vite plugin (tsc)
npm run build:client       # DevTools UI (vite build → client/dist/)

# Or all at once:
npm run build
```

### Test
```bash
npm test                   # Builds everything then runs vitest
# Or just tests:
npx vitest run tests/vite-plugin/
npx vitest run tests/runtime/
npx vitest run tests/client/
npx vitest run tests/e2e/
```

## Documentation Structure

| Document | Description |
|----------|-------------|
| [00_index.md](./00_index.md) | End-user overview and quick start |
| 01_architecture.md | System design, data flow, component interactions |
| 02_vite-plugin.md | Vite plugin development (transforms, middleware, HTTP API) |
| 03_runtime.md | Runtime development (state tracking, DOM detection, postMessage protocol) |
| 04_client.md | Client UI development (Svelte 5 components, runes stores, bridge) |
| 05_server.md | Server-side tracing (SvelteKit hooks, fetch interceptor) |
| 06_api.md | Full API reference for all packages |
| VITE.md | Vite 8 / Rolldown internals and compatibility audit |

## Architecture Decision Records

| ADR | Decision | Status |
|-----|----------|--------|
| 0001 | Event-driven component detection (MutationObserver over polling) | ✅ Implemented |
| 0002 | Debounced state change batching | ✅ Implemented (client-side) |
| 0003 | birpc-based RPC communication layer | ❌ Removed (ADR-0011) |
| 0004 | Virtual runtime module pattern | ⚠️ Superseded (URL-based script is live) |
| 0005 | Plugin composition pattern (Plugin[] array) | ❌ Superseded (single Plugin is live; sub-plugins removed) |
| 0006 | $inspect-based state tracking | ✅ Implemented |
| 0007 | Network interception architecture | 🚧 Partial (mock-rules UI + interceptor class) |
| 0008 | State reconstruction via surgical JSON diff | ✅ Implemented (per-key restore + diff view) |
| 0009 | Secure the Agent HTTP API (token, CORS allow-list, Host check) | ✅ Implemented (2026-08-12) |
| 0010 | Agent HTTP API Must Report Live Truth (honest migration, 501 set-state) | ✅ Implemented (2026-08-12) |
| 0011 | Remove Dead Code, Plugin Decomposition and Bridge Package | ✅ Implemented (2026-08-12) |
| 0012 | Stop Stubbing SvelteKit App Navigation | ✅ Implemented (2026-08-12) |
| 0013 | Restore E2E Testing Integrity (real Playwright suite) | ✅ Implemented (2026-08-12) |
| 0014 | Publish-safe workspace dependencies (plain semver, release gate) | ✅ Implemented |

## Package Architecture

### Package Dependencies
```
types → runtime → vite-plugin → client
```

### Key Libraries
| Library | Used In | Purpose |
|---------|---------|---------|
| magic-string | vite-plugin | Source-map-preserving string transformations |
| @babel/parser | vite-plugin | JavaScript/TypeScript AST parsing |
| svelte/compiler | vite-plugin | Svelte 5 AST parsing |
| @vitejs/devtools-kit | vite-plugin | Dock registration, RPC, logs API |
| sirv | vite-plugin | Static file serving for the client UI |
| launch-editor | vite-plugin | Open files in the editor |
| vis-network | client | Component graph rendering |
| vitest + happy-dom | root | Unit testing |
| rolldown | root | ESM bundling |

## Application Architecture

### Data Flow
Build-time $inspect injection → Runtime state tracking → postMessage → Client runes store → UI (and client → server via `POST /api/sync` every 2s)

### Communication
- Runtime → Client: `postMessage` via `window-bridge.ts` (`{ source: 'svelte-devtools', type, payload }`)
- Client → Runtime: direct calls on `window.parent.__SVELTE_DEVTOOLS__` (setComponentState, refresh, enableInspector)
- Client → Server: HTTP API at `/__svelte-devtools/api/*` (token-authenticated polling + sendBeacon sync)
- Plugin ↔ DevTools Kit: `ctx.docks` / `ctx.rpc` / `ctx.logs`

## Development Tips
- Set `SVELTE_DEVTOOLS_DEBUG=true` for verbose logging
- Use `curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" localhost:5173/__svelte-devtools/api/` for HTTP API verification (every endpoint requires the per-run token)
- **Client changes require a rebuild**: the panel is served from `packages/client/dist/` — run `npm run build:client` and restart the dev server
- The runtime builds with `tsc && rolldown` (ESM), not tsc alone
- Vite/rolldown auto-detects source changes in workspace packages
