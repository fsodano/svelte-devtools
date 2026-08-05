# SvelteKit Test App (svelte-extension-test)

A SvelteKit 2 test application used to develop and verify the Svelte DevTools plugin in a full SSR environment. This is a development fixture — it wires the devtools plugin directly from the monorepo via `file:` dependency.

## What It Exercises

- **SSR DevTools injection** — `src/hooks.server.ts` uses `svelteDevToolsHandle()` / `noopHandle()` so the runtime and Vite DevTools client are injected into server-rendered responses
- **Server request tracing** — SSR page loads are traced with `routeId`, status, headers, and response previews
- **Multiple routes** — `/`, `/about`, and `/sverdle` (game) with a shared `+layout.svelte`, header, and counter components
- **Cross-route time travel** — snapshot restore across route changes via `__SVELTE_DEVTOOLS_REAL_GOTO__`
- **Migration analysis** — components in `src/routes/` are scored for Svelte 4 → 5 migration

## Developing

```bash
# From the monorepo root, build the packages first
npm run build

# Then run this app (port 5174)
cd tests/apps/svelte-kit
npm run dev
```

The Vite config (`vite.config.ts`) includes `DevTools()`, `sveltekit()`, and `svelteDevTools()` in the correct order.

## Hooks

```typescript
// src/hooks.server.ts
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteDevToolsHandle, noopHandle } from '@svelte-devtools/vite-plugin/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

The `dev` guard means production builds (`npm run build`) have zero devtools overhead via `noopHandle()`.

## Verifying

```bash
# API health check (dev server must be running)
curl http://localhost:5174/__svelte-devtools/api/

# Components after opening the page
curl http://localhost:5174/__svelte-devtools/api/components | jq '.count'
```
