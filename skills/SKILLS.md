---
name: svelte-devtools-skills
description: Use when adding Svelte DevTools to a project, debugging Svelte 5 runes, inspecting component state, or verifying extension behavior. Covers implementation, configuration, debugging, and verification of @fsodano/vite-plugin-svelte-devtools.
---

# Svelte DevTools skills

This directory holds skill files for AI agents working with the Svelte DevTools plugin (release 0.4.0).

## Skill files

| File | Purpose |
|---|---|
| [`SKILLS.md`](./SKILLS.md) | Index of the four Svelte DevTools agent skill files in this directory |
| [`implement-devtools.md`](./implement-devtools.md) | Install and configure `@fsodano/vite-plugin-svelte-devtools` in a Vite or SvelteKit project |
| [`debug-with-devtools.md`](./debug-with-devtools.md) | Inspect live state and debug Svelte 5 apps via MCP, HTTP API, browser console, or RPC |
| [`verify-devtools.md`](./verify-devtools.md) | Run end-to-end browser, dock authorization, time-travel, and SSR/SQL verification |

### [implement-devtools.md](./implement-devtools.md)

Step-by-step guide to add Svelte DevTools to any project. Covers:

- Installing release 0.4.0 (`@fsodano/vite-plugin-svelte-devtools@0.4.0`) with the tested `@vitejs/devtools@0.4.8` host and running `npx svelte-devtools init`
- Configuring Vite manually for plain Svelte and SvelteKit projects (plugin ordering)
- Setting up SvelteKit server hooks (`svelteDevToolsHandle` and `noopHandle`) for SSR and request tracing
- Adding opt-in synchronous SQLite query tracing with `traceSqliteQuery`
- Plugin options (`include`, `exclude`, `enableStateInspection`, `allowedOrigins`, `allowedHosts`)
- Verification and troubleshooting

Use this skill when the task involves installing or configuring the DevTools plugin in a new or existing project.

### [debug-with-devtools.md](./debug-with-devtools.md)

Guide for AI agents to debug Svelte 5 apps using the DevTools agent interfaces. Covers:

- MCP-first discovery with nine tools (`svelte_status`, `svelte_components`, `svelte_timeline`, `svelte_snapshots`, `svelte_routes`, `svelte_migration`, `svelte_server_events`, `svelte_source`, `svelte_set_state`)
- Token-authenticated HTTP REST API at `/__svelte-devtools/api/*` (status, components, timeline, server-events, snapshots, migration, routes, remote, source, set-state, commands, sync)
- Build metadata RPC methods (6 live: `build-status`, `get-components`, `component-state`, `migration-score`, `open-in-editor`, `rescan`)
- Browser console globals (`__SVELTE_DEVTOOLS_RUNTIME__`, `__SVELTE_DEVTOOLS_QUEUE__`, `__SVELTE_DEVTOOLS_REGISTRY__`, `__SVELTE_DEVTOOLS__`)
- Common scenarios and fixes

Use this skill when the task involves inspecting component state, debugging runes reactivity, following SSR/SQLite traces, or troubleshooting DevTools behavior at runtime.

### [verify-devtools.md](./verify-devtools.md)

End-to-end verification workflow for the Svelte DevTools plugin. Covers:

- Building packages and starting the four sample apps (ports 5173, 5174, 5175, 5176)
- Vite DevTools 0.4.8 authorization flow (six-digit `devframe auth code`, separate from `SVELTE_DEVTOOLS_TOKEN`)
- Opening the DevTools panel with `openDevToolsPanel` from `tests/e2e/panel-helpers.mjs`
- Maintained Playwright suite (`npm run test:e2e`) and verification scripts (`scripts/verify-*.mjs`)
- HTTP API verification and acknowledged live state edits
- Time-travel verification (Record button, undo/redo, snapshot counting)
- SSR and SQLite observability verification (`scripts/verify-ssr-sql.mjs` on ports 5183/5184)

Use this skill when verifying that DevTools works after changes, debugging authorization flow problems, or running automated verification.
