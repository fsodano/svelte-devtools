# Svelte DevTools — Developer panel

**Inspect your running Svelte application in the Vite DevTools dock.**

Provides component inspection, JSON state editing, recorded undo/redo, request mocks, and correlated SSR/SQLite details. The panel uses resizable detail panes and persisted visual preferences. It is served from built assets by the Vite plugin.

## Get started

For application setup, install the [Vite plugin](https://www.npmjs.com/package/@fsodano/vite-plugin-svelte-devtools):

```bash
npm install -D @fsodano/vite-plugin-svelte-devtools@0.2.1 @vitejs/devtools@0.4.8
```

Follow the [configuration guide](https://github.com/fsodano/svelte-devtools#integrate-with-your-app). SvelteKit also needs a development-only handle hook. Requirements: Svelte 5.20+, Vite 8, and a supported Node.js version; Node.js 22.12+ is the documented workflow.

## Developer and agent workflows

Inspect individual component instances and source, edit writable JSON state with recorded undo/redo, mock captured browser fetches, and follow explicitly instrumented SQLite calls within SvelteKit request traces. Nine [MCP tools](https://github.com/fsodano/svelte-devtools/blob/main/docs/07_mcp.md) let an agent inspect the same data and make acknowledged state edits in a selected live session.

Runtime inspection requires an open, authorized panel. Browser mocks do not intercept server fetch or XMLHttpRequest. Query tracing is explicit and synchronous; Time Travel does not roll back database writes.

See the [sample apps](https://github.com/fsodano/svelte-devtools#sample-apps) and [local development guide](https://github.com/fsodano/svelte-devtools/blob/main/docs/INDEX.md). After editing panel source, rebuild the client and restart the example server.

Independent community project. Early development; APIs may change. [MIT licensed](https://github.com/fsodano/svelte-devtools/blob/main/LICENSE).
