# ADR-0005: Plugin Composition Pattern

## Status
Accepted

## Context
The original `index.ts` in the Vite plugin package grew to 832 lines with everything in one closure: config resolution, source transformation, middleware registration, RPC handling, and static file serving. Module-level globals like `COMPONENT_REGISTRY`, `viteServer`, and `logsApi` were shared across concerns via closure capture. There was no clear boundary between build-time and serve-time logic.

This caused several problems. Tests could not exercise transform logic without also setting up middleware. Adding a new concern meant threading another variable through the same monolithic closure. The single-plugin return value also meant Vite could not parallelize plugin hooks that are independent by nature.

## Decision
Return `Plugin[]` from `svelteDevTools()` instead of a single `Plugin`. Create a shared `PluginAPI` object to hold state that sub-plugins need to coordinate. Split the plugin into six sub-plugins, each in its own file:

- **configure** — resolves user options, sets up the shared `api` object
- **transform** — handles `transform` hook injecting `$inspect` runes into `.svelte` files
- **devtools-setup** — injects the DevTools setup script into the HTML page via `transformIndexHtml`
- **static-serve** — serves the DevTools client bundle and static assets during dev
- **virtual-runtime** — provides the runtime module as a virtual file (`virtual:svelte-devtools-runtime`)
- **optimizer** — excludes the runtime from Vite's dependency optimization

Each sub-plugin receives the shared `api` object at creation time. Vite auto-flattens nested `Plugin[]` arrays, so `svelteDevTools()` can safely return `[...configure(api), ...transform(api), ...]` and Vite treats them as individual plugins.

## Consequences
- Each sub-plugin is testable in isolation with its own minimal setup
- Shared `api` object eliminates module-level globals and makes state flow explicit
- Vite's hook pipeline can parallelize independent hooks across sub-plugins
- New concerns (SSR handling, SvelteKit integration, custom middleware) can be added as additional sub-plugins without touching existing ones
- Slightly more boilerplate at the composition site compared to a single closure
- The `api` object must be carefully versioned to avoid coupling between sub-plugins
