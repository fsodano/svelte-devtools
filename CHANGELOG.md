# Changelog

## 0.4.0 — 2026-11-15

### Removed

- The passive runtime placeholder. `getInitScript()` and `createPassiveRuntime()` shipped in the runtime package, but the Vite plugin never injected them. The plugin loads the runtime module directly and buffers early calls in `window.__SVELTE_DEVTOOLS_QUEUE__`. The unused `getInitScript` export is gone.

### Fixed

- The runtime guide described a "Phase 1 — passive buffer" that the plugin did not implement. It now describes the real loading and queueing behavior.
- The `window.__SVELTE_DEVTOOLS_RUNTIME__` type described the placeholder runtime. It now describes the live runtime, so the type no longer lists members the runtime does not have.

### Changed

- CI now runs on Node.js 24. The build, type check, unit test, and package gate jobs run on Node.js 22 and Node.js 24, so a change cannot break the declared minimum. The browser suite runs on Node.js 24.
- The documented Node.js workflow is Node.js 24. The declared minimums are unchanged.
- The dependencies move to their latest releases. `@babel/parser` and `@babel/types` move to 8, `magic-string` to 1, `vis-network` to 10, and `happy-dom` to 21. The rest move to their latest patch or minor release.
- The lockfiles are generated with npm 12. npm 11 leaves out the optional wasm dependencies that the `@rolldown/binding-wasm32-wasi` entry needs, so a lockfile it writes fails `npm ci` on Linux. `CONTRIBUTING.md` records the regeneration steps.
- The Todo SQLite fixture approves the `better-sqlite3` install script. npm 12 does not run dependency install scripts unless they are approved, and the native driver would otherwise go unbuilt.

### Security

- The `happy-dom` advisory for parsing untrusted HTML is resolved by the major update. Four low severity advisories remain in the SvelteKit 2 dependency chain (`cookie`, `deepmerge`, `@sveltejs/kit`, `@sveltejs/vite-plugin-svelte`). They live in SvelteKit itself, so they affect a consumer only while that consumer runs SvelteKit 2. The plugin declares `peerDependencies: "@sveltejs/kit": "^2.55.0"` and the fixtures test that line. SvelteKit 3 moved the `Handle` type to `@sveltejs/kit/hooks`, so supporting it changes the public type surface and the peer range. That belongs in its own change, not in a dependency refresh.

## 0.3.5 — 2026-11-15

### Fixed

- Searching the Components tab no longer takes down the panel. A query that matched no component threw `TypeError: Cannot convert object to primitive value` and left the panel blank. State values reach the panel through `toDisplayValue`, which returns objects with a null prototype, and the filter called `String()` on them.
- The component search filter and the tree filter now use one shared predicate. They had drifted apart, and only the tree filter matched state values.
- The JSON tree no longer calls `String()` on a symbol, which throws.

### Added

- A browser test for the component search. It covers a match on a state value, a query with no match, and clearing the query with Escape.
- A browser test for the component graph. It finds a node on the canvas and checks that a double-click opens the component in the tree.

## 0.3.4 — 2026-11-15

### Fixed

- The inline runtime init script and the TypeScript passive runtime now expose the same methods. The script was missing `unregisterComponent`, `startInspectBatch`, `endInspectBatch`, and `flushAllEffects`, and its drain loop had no `unregisterComponent` case. A call to one of those methods before activation was dropped instead of queued.

### Changed

- The init script binds a missing runtime method to a no-op instead of throwing during activation.

## 0.3.3 — 2026-11-15

### Added

- The changelog entries for releases 0.2.0, 0.2.1, and 0.2.2. The three releases shipped without a changelog entry.

### Fixed

- The API endpoint table in `AGENTS.md` listed four implemented endpoints as missing: `GET /api/status`, `DELETE /api/server-events`, `GET /api/commands`, and `POST /api/commands/result`.
- The release context in `docs/VITE.md` and `docs/inspiration.md` named an old release.

## 0.3.2 — 2026-11-15

### Added

- A Svelte error boundary around the panel views. When a view throws, the panel shows the error message and a retry button instead of going blank. The header and sidebar stay usable.
- The Components tab search matches state values, not only state keys. Press Escape to clear the query.

### Changed

- The search filter moved to `packages/client/src/lib/component-search.ts` with unit tests. State values are searched two levels deep, so a large nested object cannot stall the filter.

## 0.3.1 — 2026-11-15

### Removed

- Unused panel code. `packages/client/src/panel.ts` was a second, older panel bootstrap with no entry point. `ServerView.svelte` was superseded by the Network panel. `SearchBox.svelte` and `ErrorBoundary.svelte` were never imported.
- The unused `beaconUrl` helper in the client API module. The panel sends every request with `apiFetch`, which sets an `Authorization` header.
- `scripts/release.sh`, a wrapper that only ran `scripts/publish.sh`. The publish script remains the entry point.

### Changed

- The Settings scale list comes from the shared `UI_SCALES` value. The two lists can no longer drift apart.

## 0.3.0 — 2026-11-15

### Added

- Open a component instance from the graph. Double-clicking a node switches the panel to the Components tab and selects that instance. The graph header states the shortcut.
- A feature comparison document that maps panel behavior against React and Vite-like DevTools, with file-level evidence for every row.

### Fixed

- The graph double-click handler reads the node from the double-click event. A stale single-click selection can no longer open the wrong instance.

### Changed

- Release version references now come from the shared `DEVTOOLS_VERSION` constant in tests. A version bump no longer requires editing test expectations.

## 0.2.2 — 2026-09-05

### Added

- `npx svelte-devtools init` configures a standard Vite or SvelteKit app. The command adds the host and plugin calls and creates a development-only SvelteKit hook. It preserves generated options and does not evaluate application configuration. Use `--dry-run` to inspect the edits. Repeating the setup does not add duplicate imports.
- A fresh installation verification script checks a new project against the published packages.

## 0.2.1 — 2026-09-05

### Fixed

- The published packages ship the assets a consumer needs. A clean install no longer fails on a missing client build.
- Isolated consumer projects are verified against the packed tarballs.

### Changed

- Each package carries a `LICENSE` file and the publish metadata the npm registry needs.
- Release evidence and the accepted architecture decisions are preserved in `docs/`.

## 0.2.0 — 2026-09-05

### Added

- SQLite query tracing in the server adapter. The panel shows the statement, the database, the row count, and the execution time for each query.
- A correlated server and SQLite trace view. A server request shows its child SQL spans as a waterfall, with trace ID, span ID, and parent span ID.
- A Todo fixture app with SQLite, used to verify the tracing end to end.

### Fixed

- Server traces correlate to the request that produced them. Streaming responses return without waiting for the trace preview.
- Simultaneous trace parents sort before their children.
- SQL execution timings keep their precision.
- SQLite row counts are read without reading value getters.

### Changed

- Release validation covers real SSR and SQLite workflows, bounded mixed client and server history, and production preview isolation.

## 0.1.1 — 2026-09-05

- Bound Network panel history to 500 requests across client and server events. Prune clear-history markers so long sessions do not retain unbounded request data.
- Complete the official Svelte analyzer review locally and record contextual findings and their disposition.

## 0.1.0 — 2026-09-05

This is an early-development release for Svelte 5.20+ and Vite 8. APIs and behavior may change before 1.0.

### Added

- Distinct IDs for mounted component instances, with instance-targeted state editing and undo/redo history.
- Source navigation through the configured local editor, with project-root checks and visible launch errors.
- Nine MCP tools for agent inspection and acknowledged state edits. Runtime reads support explicit panel sessions, freshness checks, and server-side pagination.
- Metadata-only component discovery and bounded MCP HTTP responses and tool results.
- Resizable inspection panes, keyboard resizing, responsive layouts, and working display preferences.
- Request-to-mock configuration, plus regression coverage across plain Svelte and SvelteKit fixtures.

### Fixed

- Repeated components no longer collapse into a single registry entry.
- Streaming fetch and SSR responses return without waiting for trace previews. Preview reads are bounded.
- Production no-op tracing imports preserve global fetch.
- Component graphs preserve layout/page ancestry. Updated props and large panel syncs reach the HTTP cache.
- Non-JSON values display safely and remain read-only. Panel sessions stay isolated.
- Tree indexing removes repeated full-tree scans during large unmounts. Destroyed animation bookkeeping no longer blocks later recording.
- Release validation includes all five packages in dependency order and runs build, types, unit tests, browser tests, and package checks before publishing.

### Current boundaries

- The supported mocking workflow targets browser `fetch`. Browser mock rules do not intercept server-side fetches. Do not assume full XHR parity.
- Instrumentation covers component `.svelte` source. Standalone rune modules and precompiled libraries are outside the current coverage.
- Runtime inspection uses cached panel syncs. Keep an authorized Svelte panel open. Fresh timestamps do not prove the app is still connected.
- State edits require a live setter and JSON-compatible values. Derived values and non-JSON values remain read-only. Remote snapshot restore is not available through MCP.
- MCP limits each HTTP response to 4 MiB and each serialized tool result to 512 KiB. Oversized results return actionable errors.
- A live 1,000-component fixture verifies mount, update, keyboard selection, and unmount cleanup. Timings are local observations. They do not establish a general performance budget or full feature parity with Vue DevTools.
