---
name: svelte-devtools-skills
description: Use when adding Svelte DevTools to a project, debugging Svelte 5 runes, or inspecting component state. Covers implementation, configuration, and troubleshooting of the @fsodano/vite-plugin-svelte-devtools.
---

# Svelte DevTools Skills

This directory holds skill files for AI agents working with the Svelte DevTools plugin.

## Available Skills

### [implement-devtools.md](./implement-devtools.md)

Step-by-step guide to add Svelte DevTools to any project. Covers:

- Building release 0.2.2 from source and installing the local plugin with the pinned host
- Configuring Vite for plain Svelte and SvelteKit projects (plugin ordering)
- Setting up SvelteKit hooks for SSR support
- Plugin options (include, exclude, enableStateInspection)
- Verification and troubleshooting

Use this skill when the task involves installing or configuring the devtools plugin in a new or existing project.

### [debug-with-devtools.md](./debug-with-devtools.md)

Guide for AI agents to debug Svelte 5 apps using the devtools agent API. Covers:

- MCP-first discovery with nine tools (eight inspection tools and one acknowledged state edit)
- Build metadata RPC methods (6 live: `build-status`, `get-components`, `component-state`, `migration-score`, `open-in-editor`, `rescan`)
- HTTP REST API at `/__svelte-devtools/api/*` (token-authenticated: components, timeline, server-events, snapshots, migration, routes, source)
- Agent response schema (`AgentResponse<T>`)
- Debugging flow from health check to component inspection
- Browser console globals (`__SVELTE_DEVTOOLS_RUNTIME__`, `__SVELTE_DEVTOOLS_REGISTRY__`, `__SVELTE_DEVTOOLS__`)
- Common scenarios and fixes

Use this skill when the task involves inspecting component state, debugging runes reactivity, or troubleshooting devtools behavior at runtime.

### [verify-devtools.md](./verify-devtools.md)

End-to-end verification workflow for the Svelte DevTools plugin. Covers:

- Building and starting a test app
- Vite DevTools 0.4.8 authorization flow (six-digit devframe code)
- Opening the DevTools panel (iframe dock entry; Vite DevTools Kit decides popup vs embedded)
- Maintained Playwright suite and shared panel helper
- HTTP API verification for all endpoints (token-authenticated: components, timeline, server-events, snapshots, migration, source, routes)
- Time-travel verification (Record button, undo/redo, snapshot counting)
- Common issues and troubleshooting checklist

Use this skill when verifying the devtools work after changes, debugging auth flow problems, or running automated verification in CI.
