# Svelte DevTools developer documentation

## Overview

Svelte DevTools 0.4.0 is an early-development npm-workspaces monorepo with five packages. This document maps the repository documentation and contributor workflows. For user installation and feature walkthroughs, start with the root [README](../README.md).

## Getting started

### Prerequisites

- Node.js 22.12+ (the documented workflow and CI browser suite use Node.js 24; CI tests Node.js 22 and Node.js 24)
- npm workspaces
- Vite 8.0.3+ (the sample applications run Vite 8.2.2 with the `@vitejs/devtools` 0.4.8 host)
- Svelte 5.20+ (required for `$props.id()` instance identity)

### Setup

```bash
git clone https://github.com/fsodano/svelte-devtools.git
cd svelte-devtools
npm ci
npm run build
```

### Build order

Build the packages in dependency order, or run `npm run build` to build all five in sequence:

```bash
npm run build:types        # Shared types and constants (tsc)
npm run build:runtime      # Browser runtime (tsc && rolldown -c)
npm run build:vite-plugin  # Vite plugin, SvelteKit hook, and HTTP API (tsc)
npm run build:client       # DevTools panel UI (vite build -> packages/client/dist/)
npm run build:mcp          # Stdio MCP server over the HTTP API (tsc)

# Build all packages in order:
npm run build
```

### Test and release checks

```bash
npm test                   # Builds all packages, then runs vitest
npm run check              # Runs svelte-check across the workspace
npx vitest run             # Runs unit tests without rebuilding
npx vitest run tests/vite-plugin/
npx vitest run tests/runtime/
npx vitest run tests/client/
npm run test:e2e           # Runs Playwright against plain Svelte (5173) and SvelteKit (5174)
npm run release:check      # Verifies package manifests, versions, and dry-run tarballs
bash scripts/publish.sh --dry-run  # Runs the full build, test, e2e, stress, SSR/SQL, production, and consumer gate
npm run bump-version -- --check    # Verifies that all manifests and docs name the current release version
```

Playwright e2e tests read `SVELTE_E2E_PORT` (default `5173`) and `SVELTE_E2E_KIT_PORT` (default `5174`). Install the fixture dependencies (`npm ci --prefix tests/apps/svelte` and `npm ci --prefix tests/apps/svelte-kit`) before running `npm run test:e2e`.

## Documentation structure

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | User-facing overview, quick start, MCP setup, sample apps, and integration |
| [01_architecture.md](./01_architecture.md) | End-to-end system design, build-time `$inspect` transform, runtime queue, panel bridge, HTTP sync, and tracing |
| [02_vite-plugin.md](./02_vite-plugin.md) | Vite plugin development, AST transforms, middleware, and HTTP API |
| [03_runtime.md](./03_runtime.md) | Browser runtime, state and effect tracking, DOM correlation, and `postMessage` protocol |
| [04_client.md](./04_client.md) | Client panel views, Svelte 5 runes stores, window bridge, and time travel |
| [05_server.md](./05_server.md) | SvelteKit request tracing, server `fetch` spans, and explicit SQLite observation |
| [06_api.md](./06_api.md) | Public API reference, REST endpoints, and shared TypeScript types |
| [07_mcp.md](./07_mcp.md) | Stdio MCP server setup, tools, session targeting, freshness checks, and size bounds |
| [design-guidelines.md](./design-guidelines.md) | Visual tokens, `SplitPane` resizing, settings persistence, error boundaries, and mutation rules |
| [COMPARISON.md](./COMPARISON.md) | Panel capability comparison against React and Vite-like DevTools with source evidence |
| [inspiration.md](./inspiration.md) | Historical Vue DevTools feature analysis and adaptation context |
| [VITE.md](./VITE.md) | Vite 8, Rolldown, and `@vitejs/devtools-kit` host internals |
| [adr/README.md](./adr/README.md) | Canonical index of Architecture Decision Records (ADR-0001 through ADR-0020) |
| [validation/devtools-completion-audit.md](./validation/devtools-completion-audit.md) | Verification audit and known scope boundaries |
| [validation/ssr-sql-observability-validation.md](./validation/ssr-sql-observability-validation.md) | Release validation report for SvelteKit SSR and SQLite observability |

## Architecture decision records

The canonical index and status table for all Architecture Decision Records live in [docs/adr/README.md](./adr/README.md). Three foundational decisions shape daily development across the workspace:

- **Compile-time `$inspect` injection ([ADR-0006](./adr/ADR-0006-inspect-state-tracking.md) & [ADR-0017](./adr/ADR-0017-instance-safe-state-mutation.md))**: Svelte 5 runes compile away and have no runtime hook. The Vite plugin injects `$inspect` callbacks, per-key live state setters, and `$props.id()` instance identities into `.svelte` component files during `vite dev`.
- **Authenticated HTTP API and MCP adapter ([ADR-0009](./adr/ADR-0009-secure-agent-http-api.md) & [ADR-0016](./adr/ADR-0016-mcp-adapter-over-authenticated-http.md))**: Every `/__svelte-devtools/api/*` request checks the `Host` header, validates the per-run `SVELTE_DEVTOOLS_TOKEN` bearer token, and restricts CORS to allow-listed origins. The open browser panel syncs runtime state to `/api/sync` every 2 seconds and polls `/api/commands` every 500 ms to execute acknowledged live state edits.
- **Request-scoped server traces and bounded observation ([ADR-0018](./adr/ADR-0018-request-scoped-server-traces.md), [ADR-0019](./adr/ADR-0019-explicit-synchronous-sqlite-observation.md), & [ADR-0020](./adr/ADR-0020-bounded-observation-and-live-value-separation.md))**: Server requests carry `traceId` and `spanId` in `AsyncLocalStorage` so child `fetch` calls and explicit synchronous `traceSqliteQuery` spans correlate without timestamp guessing. Display serialization (`toDisplayValue`) is separate from live editability checks (`isJsonEditable`).

## Package architecture

### Package dependency graph

```
types -> runtime -> vite-plugin
types -> client  -> vite-plugin
mcp   (standalone stdio client over the vite-plugin HTTP API)
```

`@fsodano/vite-plugin-svelte-devtools` depends on `@fsodano/svelte-devtools-types`, `@fsodano/svelte-devtools-runtime`, and `@fsodano/svelte-devtools-client` so installing the Vite plugin pulls in the prebuilt browser runtime and panel assets.

### Key libraries

| Library | Used in | Purpose |
|---------|---------|---------|
| `magic-string` | `vite-plugin` | Source-map-preserving code injection |
| `@babel/parser`, `@babel/types` | `vite-plugin` | JavaScript and TypeScript AST traversal for rune declarations |
| `svelte/compiler` | `vite-plugin` | Svelte 5 modern AST parsing for script extraction and DOM tagging |
| `@vitejs/devtools-kit` | `vite-plugin` | Dock registration (`ctx.docks`), RPC registration (`ctx.rpc`), and logs (`ctx.logs`) |
| `sirv` | `vite-plugin` | Static file serving for the prebuilt client UI |
| `launch-editor` | `vite-plugin` | Launching the local editor from source links |
| `vis-network` | `client` | Force-directed component relationship graph |
| `@modelcontextprotocol/sdk`, `zod` | `mcp` | Stdio MCP server and tool schema validation |
| `rolldown` | `root`, `runtime` | ESM bundling for the browser runtime |
| `vitest`, `happy-dom`, `@playwright/test` | `root` | Unit and end-to-end browser testing |

## Application architecture

### Data flow

```
.svelte file -> Vite plugin $inspect transform -> Browser runtime (early calls queued in __SVELTE_DEVTOOLS_QUEUE__) -> postMessage -> Client window bridge -> Runes stores -> Panel UI -> Periodic POST /__svelte-devtools/api/sync -> Authenticated HTTP API & MCP tools
```

### Communication channels

- **Runtime -> Client panel**: `window.postMessage` with `{ source: 'svelte-devtools', type, payload }`, received by `packages/client/src/lib/bridge/window-bridge.ts`.
- **Client panel -> Runtime**: Direct calls on `window.parent.__SVELTE_DEVTOOLS__` (or `window.opener.__SVELTE_DEVTOOLS__` when popped out) for `editComponentState`, `setComponentState`, `getWritableStateKeys`, `getAllComponents`, `refresh`, `enableInspector`, and `disableInspector`, plus same-origin `postMessage` for browser `fetch` mock rules.
- **Client panel -> Vite server**: Authenticated `fetch` requests (`Authorization: Bearer <token>`) to `/__svelte-devtools/api/sync` every 2 seconds and `/__svelte-devtools/api/commands` every 500 ms. Server traces are polled every 1 second on two routes: the timeline store uses the legacy `/__svelte-devtools/server-events` route (bare JSON array), and the Network panel uses `/__svelte-devtools/api/server-events` (`{ ok: true, events }`).
- **MCP server -> Vite server**: Authenticated HTTP requests (`Authorization: Bearer <token>`) to `/__svelte-devtools/api/*`.

## Focused verification scripts

Build all workspace packages (`npm run build`) and install the relevant fixture dependencies under `tests/apps/<app>` before running these scripts:

| Script | What it verifies | Ports and prerequisites |
|--------|------------------|-------------------------|
| `node scripts/verify-ssr-sql.mjs` | SvelteKit SSR, streaming HTML script injection, hydration, concurrent request trace isolation, native forms, SQLite CRUD, and correlated `server:sql` spans across HTTP, MCP, and the Network waterfall. | Starts `svelte-kit` on `5183` and `todo-sqlite` on `5184` against a temporary SQLite database. |
| `node scripts/verify-stress.mjs` | Mount, search, batch update, keyboard selection, and unmount cleanup across 1,000 instrumented `StressItem` instances. | Starts `svelte` on `5180`. |
| `node scripts/verify-editor.mjs` | Real `launch-editor` invocation with line/column arguments and project-root boundary checks. | Starts `svelte` on `5177` with a temporary recorder script in `LAUNCH_EDITOR`. |
| `node scripts/verify-production.mjs` | `noopHandle()` preservation of `globalThis.fetch` and absence of DevTools scripts, globals, dock, and routes in `vite preview`. | Starts built `svelte-kit` (`5185`) and `todo-sqlite` (`5186`) previews. |
| `node scripts/verify-package-consumer.mjs` | Packing all five workspaces into tarballs, installing them in an external temporary project, running `svelte-devtools init`, type-checking exports, querying MCP, and running production builds. | Uses port `5190` in a temporary directory outside the workspace. |
| `node scripts/verify-pokedex.mjs` | 20 distinct `PokemonCard` instances, `card -> page -> layout` ancestry, element inspection, and narrow Network layout. | Expects `pokedex` running on `5176` with `SVELTE_DEVTOOLS_TOKEN=svelte-devtools-local-audit-token` and log at `/tmp/svelte-audit-pokedex-server.log`. |
| `node scripts/verify-time-travel.mjs` | Spring counter snapshot recording (`2 / 2`), undo (`1 / 2`), and redo (`2 / 2`) without phantom snapshots. | Expects the SvelteKit app running as a dev server in tmux session `svelte-kit`, for example `tmux new-session -d -s svelte-kit -c tests/apps/svelte-kit "npx vite --port 5174 --strictPort --clearScreen false"`, with the panel built first (`npm run build:client`). |
| `node scripts/verify-fresh-install.mjs` | Counter interaction, live state sync, routes, and server events against an externally created SvelteKit project. | Takes `<base-url> <server-log-path> <expected-version> [output-dir]` with `SVELTE_DEVTOOLS_TOKEN` set. |

Media recording scripts (`scripts/record-readme-demo.mjs` and `scripts/record-sql-demo.mjs`) regenerate the walkthrough videos and screenshots in `docs/media/`.

## Development tips

- **Two separate credentials exist**: The Vite DevTools dock uses a six-digit `devframe auth code` printed in the terminal when the browser connects. The HTTP API and MCP server use the `SVELTE_DEVTOOLS_TOKEN` bearer token.
- **Client changes require a rebuild**: The Vite dev server serves the panel from `packages/client/dist/`. After editing `packages/client/src/`, run `npm run build:client` and restart the dev server.
- **Runtime build uses Rolldown**: `packages/runtime` builds with `tsc && rolldown -c` to produce a self-contained browser ESM bundle.
- **Verbose logging**: Set `SVELTE_DEVTOOLS_DEBUG=true` in the environment (or `window.__SVELTE_DEVTOOLS_DEBUG__ = true` in the browser) for transform, runtime, and bridge debug logs.
