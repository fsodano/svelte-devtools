# Changelog

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
