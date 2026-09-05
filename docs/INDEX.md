# Svelte DevTools Developer Documentation

## Overview
Svelte DevTools 0.2.0 is an early-development npm-workspaces monorepo with 5 packages. This documentation is for developers CONTRIBUTING to the devtools themselves.

## Getting Started

### Prerequisites
- Node.js 20.19+
- npm workspaces
- Vite 8.0.3+ (fixtures test 8.2.2 with the 0.4.8 DevTools host)

### Setup
```bash
git clone https://github.com/fsodano/svelte-devtools.git
cd svelte-devtools
npm ci
npm run build
```

### Build Order
```bash
npm run build:types        # Shared types
npm run build:runtime      # Browser runtime (tsc + rolldown)
npm run build:vite-plugin  # Vite plugin (tsc)
npm run build:client       # DevTools UI (vite build → client/dist/)
npm run build:mcp          # Agent MCP server (stdio)

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
npm run test:e2e           # Playwright; starts plain and SvelteKit fixtures
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
| [Agent MCP](./07_mcp.md) | Setup, tools, freshness, and current limits |
| [Design guidelines](./design-guidelines.md) | Visual system, resizing, settings, mutation, and agent contracts |
| [Completion audit](./validation/devtools-completion-audit.md) | Historical audit and verified release evidence |
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
| 0010 | Agent HTTP API Must Report Live Truth | Historical decision; 0.1.0 adds acknowledged session-targeted edits. See [current API](06_api.md). |
| 0011 | Remove Dead Code, Plugin Decomposition and Bridge Package | ✅ Implemented (2026-08-12) |
| 0012 | Stop Stubbing SvelteKit App Navigation | ✅ Implemented (2026-08-12) |
| 0013 | Restore E2E Testing Integrity (real Playwright suite) | ✅ Implemented (2026-08-12) |
| 0014 | Publish-safe workspace dependencies (plain semver, release gate) | ✅ Implemented |
| [0015](./adr/ADR-0015-shared-resizable-inspection-layouts.md) | Shared resizable inspection layouts | Accepted; see the completion audit |
| [0016](./adr/ADR-0016-mcp-adapter-over-authenticated-http.md) | MCP adapter over authenticated HTTP | Accepted; see the completion audit |
| [0017](./adr/ADR-0017-instance-safe-state-mutation.md) | Instance-safe state mutation | Accepted; see the completion audit |
| [0018](./adr/ADR-0018-request-scoped-server-traces.md) | Request-scoped server traces | Accepted; see release validation |
| [0019](./adr/ADR-0019-explicit-synchronous-sqlite-observation.md) | Explicit synchronous SQLite observation | Accepted; see release validation |
| [0020](./adr/ADR-0020-bounded-observation-and-live-value-separation.md) | Bounded observation and live-value separation | Accepted; see release validation |

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
- Client → Server: HTTP API at `/__svelte-devtools/api/*` (token-authenticated polling + fetch sync)
- Plugin ↔ DevTools Kit: `ctx.docks` / `ctx.rpc` / `ctx.logs`

## Development Tips
- Set `SVELTE_DEVTOOLS_DEBUG=true` for verbose logging
- Use `curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" localhost:5173/__svelte-devtools/api/` for HTTP API verification (every endpoint requires the per-run token)
- **Client changes require a rebuild**: the panel is served from `packages/client/dist/` — run `npm run build:client` and restart the dev server
- The runtime builds with `tsc && rolldown` (ESM), not tsc alone
- Rebuild affected workspace packages before testing their distributed output; client source is not compiled on demand.

## SSR and SQLite verification

Build root packages, install the independent SvelteKit and Todo fixture dependencies, and run `node scripts/verify-ssr-sql.mjs`. The script owns ports 5183/5184 and a temporary SQLite database; it does not use the developer's Todo database. It checks SSR, hydration, streaming, request correlation, CRUD, and HTTP/MCP/UI SQL spans. See [server integration](05_server.md) and the script's evidence output.
