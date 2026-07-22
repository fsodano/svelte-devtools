---
name: svelte-devtools-skills
description: Use when adding Svelte DevTools to a project, debugging Svelte 5 runes, or inspecting component state. Covers implementation, configuration, and troubleshooting of the @svelte-devtools/vite-plugin.
---

# Svelte DevTools Skills

This directory holds skill files for AI agents working with the Svelte DevTools plugin.

## Available Skills

### [implement-devtools.md](./implement-devtools.md)

Step-by-step guide to add Svelte DevTools to any project. Covers:

- Installing `@svelte-devtools/vite-plugin` and `@vitejs/devtools`
- Configuring Vite for plain Svelte and SvelteKit projects
- Setting up SvelteKit hooks for SSR support
- Plugin options (include, exclude, enableStateInspection)
- Verification and troubleshooting

Use this skill when the task involves installing or configuring the devtools plugin in a new or existing project.

### [debug-with-devtools.md](./debug-with-devtools.md)

Guide for AI agents to debug Svelte 5 apps using the devtools agent API. Covers:

- RPC methods (`build-status`, `get-components`, `component-state`, `migration-score`, `rescan`)
- Agent response schema (`AgentResponse<T>`)
- Debugging flow from health check to component inspection
- Browser console globals (`__SVELTE_DEVTOOLS_RUNTIME__`, `__SVELTE_DEVTOOLS_REGISTRY__`, `__SVELTE_DEVTOOLS__`)
- Common scenarios and fixes

Use this skill when the task involves inspecting component state, debugging runes reactivity, or troubleshooting devtools behavior at runtime.

### [verify-devtools.md](./verify-devtools.md)

End-to-end verification workflow for the Svelte DevTools plugin. Covers:

- Building and starting a test app
- Vite DevTools authorization flow (terminal token, manual auth URL)
- Opening the DevTools panel via DocumentPictureInPicture
- Full Playwright automation script
- HTTP API verification for all endpoints (components, timeline, server-events, snapshots, migration, set-state, source)
- Common issues and troubleshooting checklist

Use this skill when verifying the devtools work after changes, debugging auth flow problems, or running automated verification in CI.
