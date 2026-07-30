# ADR-0004: Virtual Runtime Module Pattern

## Status
Accepted

## Context
The runtime script was injected via `transformIndexHtml` as `<script src="/__svelte-devtools/svelte-runtime.js"></script>`. This approach works for plain Vite apps where `transformIndexHtml` fires on every HTML request, but it breaks under SvelteKit SSR. SvelteKit handles HTML generation through its own pipeline, and `transformIndexHtml` is not invoked during SSR. A workaround using `transformPageChunk` inside `svelteDevToolsHandle()` was required, duplicating the injection logic across two separate code paths.

The URL-based script injection also meant the runtime script lived outside Vite's module graph. It could not benefit from HMR, dependency resolution, or module-level caching. The runtime was loaded as a raw asset, bypassing Vite's transform pipeline entirely. Any change to the runtime required a full page reload even in dev mode.

With the runtime outside the module graph, the `__SVELTE_DEVTOOLS_QUEUE__` mechanism had to bridge the gap between component initialization and script loading. Components that mounted before the runtime loaded would queue their registration calls, adding complexity to both the plugin and the runtime.

## Decision
Use Vite's virtual module pattern to deliver the runtime script through the module graph.

The plugin registers a virtual module via `resolveId`:

```
resolveId('virtual:svelte-devtools-runtime')
  → '\0virtual:svelte-devtools-runtime'
```

The `load()` hook reads the runtime JavaScript file from disk and returns it as a module. A minimal `transformIndexHtml` injection creates an inline module script:

```html
<script type="module">
  import("virtual:svelte-devtools-runtime");
</script>
```

This keeps the HTML injection simple and uniform. The dynamic `import()` triggers Vite's module resolution, which routes through `resolveId` back to the plugin's `load` hook. The runtime becomes a first-class citizen in Vite's module graph, eligible for HMR and dependency caching.

A fallback to URL-based loading is maintained for environments where the virtual module pattern is not available (custom integrations, non-Vite builds, or test harnesses that load the runtime directly). The fallback checks `window.__SVELTE_DEVTOOLS_RUNTIME__` before attempting the module import.

## Consequences
- Runtime script appears in Vite's module graph with proper dependency tracking
- HMR works for runtime changes during development, avoiding full page reloads
- SvelteKit SSR still requires `transformPageChunk` for HTML injection (the virtual module only handles the client-side loading path)
- The `svelteDevToolsHandle()` SvelteKit workaround remains, but its scope narrows to SSR HTML injection only
- Virtual module setup adds ~15 lines of plugin configuration, comparable to the URL-based approach
- Dynamic `import()` call in `transformIndexHtml` is deferred, so the runtime loads asynchronously without blocking page rendering
- The queue mechanism is no longer needed for standard setups (virtual module resolves before component mount in most cases), but is kept as a safety net for edge cases
