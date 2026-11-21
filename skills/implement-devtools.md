---
name: implement-svelte-devtools
description: Use when installing or configuring @fsodano/vite-plugin-svelte-devtools in a Vite or SvelteKit project.
---

# Implementing Svelte DevTools

Follow these steps to add Svelte DevTools (release 0.4.0) to a Vite or SvelteKit project.

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 22.12+ documented minimum workflow (CI tests Node.js 22 and Node.js 24; `package.json` `engines` also permits `^20.19.0`) |
| Vite | 8.0.3+ (fixtures test Vite 8.2.2) |
| Svelte | 5.20+ (runes mode; required for `$props.id()` instance identity) |
| `@vitejs/devtools` | 0.4.8 (tested host) |

Use Svelte 5 runes in application components. Keep the generated compiler options. Current Svelte CLI projects configure these inside `sveltekit(...)` in `vite.config.ts`; older projects use `svelte.config.js`.

## Installation

In the application directory, install `@fsodano/vite-plugin-svelte-devtools@0.4.0` and `@vitejs/devtools@0.4.8`, then run `npx svelte-devtools init`:

```bash
npm install -D @fsodano/vite-plugin-svelte-devtools@0.4.0 @vitejs/devtools@0.4.8
npx svelte-devtools init
npm run dev
```

Keep the application's normal Svelte compiler integration (`@sveltejs/vite-plugin-svelte@^7` for plain Vite, or `sveltekit()` for SvelteKit). The [installation guide](../docs/02_vite-plugin.md#installation) also covers source development and local fixtures.

`npx svelte-devtools init` preserves the generated Vite configuration and adds the development-only SvelteKit hook (`src/hooks.server.ts` or `.js`). Use `npx svelte-devtools init --dry-run` to preview edits. Repeating the command does not duplicate edits. If your Vite config is dynamic or your server hook already contains custom logic, the command leaves the files unchanged and points to the manual setup below.

## Vite config setup

Skip this section if `npx svelte-devtools init` succeeded.

### Plain Vite + Svelte

Add `DevTools()` and `svelteDevTools()` to `vite.config.ts`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { DevTools } from '@vitejs/devtools';
import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools';

export default defineConfig({
  plugins: [
    DevTools(),
    svelte(),
    svelteDevTools({
      // Optional: customize plugin behavior
      enableStateInspection: true,
      include: [/\.svelte$/],
      exclude: [/node_modules/]
    })
  ]
});
```

### SvelteKit

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { DevTools } from '@vitejs/devtools';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools';

export default defineConfig({
  plugins: [
    DevTools(),
    sveltekit(),
    svelteDevTools()
  ]
});
```

Plugin order is required: place `DevTools()` first, then `svelte()` or `sveltekit()`, then `svelteDevTools()`.

## SvelteKit hooks setup

SvelteKit bypasses Vite's `transformIndexHtml` during server-side rendering (SSR), so you must configure a server handle hook to inject the runtime script and trace SSR requests. Create `src/hooks.server.ts`:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

If `src/hooks.server.ts` already defines a `handle`, compose it with SvelteKit's `sequence` helper. Keep the `dev` check so the hook only runs in development mode. In production, `noopHandle()` passes requests through unchanged without installing fetch interception.

The plugin logs this reminder only when `SVELTE_DEVTOOLS_DEBUG=true` is set. Use `npx svelte-devtools init` or add the hook explicitly.

## Plugin options

```typescript
interface SvelteDevToolsPluginOptions {
  /** File patterns to include. Default: [/\.svelte$/] */
  include?: RegExp[];

  /** File patterns to exclude. Default: [/node_modules/] */
  exclude?: RegExp[];

  /** Enable state inspection via $inspect injection. Default: true. */
  enableStateInspection?: boolean;

  /** Extra CORS origins allowed to call the agent HTTP API. Localhost/127.0.0.1/[::1] are always allowed. */
  allowedOrigins?: string[];

  /** Extra Host header values allowed to call the agent HTTP API. Localhost/127.0.0.1/[::1] are always allowed. */
  allowedHosts?: string[];
}
```

### Examples

**Minimal setup with defaults:**
```typescript
svelteDevTools()
```

**Inspect only specific directories:**
```typescript
svelteDevTools({
  include: [/src\/lib\/components\//],
  exclude: [/node_modules/, /\.test\.svelte$/]
})
```

**Component tree only (disable state injection):**
```typescript
svelteDevTools({
  enableStateInspection: false   // skips $inspect and state setter injection
})
```

## How it works

The plugin injects three things into each matching `.svelte` file at build time during `vite dev`:

1. **Per-instance component registration** — combines a stable file ID (`svt-<hash36>`) with Svelte 5.20+'s `$props.id()`, tracks parent-child relationships via Svelte context, stores metadata (`id`, `parentId`, `name`, `filename`, `propKeys`) in `window.__SVELTE_DEVTOOLS_REGISTRY__`, and registers/unregisters the mounted instance with `window.__SVELTE_DEVTOOLS_RUNTIME__` (buffering early calls in `window.__SVELTE_DEVTOOLS_QUEUE__`).
2. **`data-svelte-devtools-id` and `data-svelte-component` attributes** — added to owned HTML elements for DOM correlation and element inspection.
3. **`$inspect` hooks and state setters** — wraps `$state`, `$derived`, and `$props` declarations (plus `$effect` tracking and `Spring`/`Tween` watchers) to emit state changes and register `_registerState` setters for live state edits and time-travel restore.

## Verification

After starting the dev server:

1. Open the application in Chromium (for example, `http://localhost:5173`).
2. Locate the Vite DevTools dock button at the bottom-right corner of the page.
3. If the dock shows **Unauthorized**, click it and enter the six-digit `devframe auth code` printed in the server terminal. (This code authorizes the dock; `SVELTE_DEVTOOLS_TOKEN` is a separate bearer token for the HTTP API and MCP server.)
4. Select the **Svelte** dock entry.
5. Confirm that the component tree displays your mounted Svelte components.

When everything is working:

- Mounted component instances appear in the **Components** tab with their names.
- Selecting a component displays its current **Props**, **State**, **DOM**, and **Source** sub-tabs.
- Changing state in the app updates the DevTools view in real time.
- The top status bar shows **Connected**.
- The **Events** tab records mount, unmount, state, effect, and request entries as you interact.

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Plugin does not load in SvelteKit | Missing `src/hooks.server.ts` or wrong hooks setup | Add `src/hooks.server.ts` with `svelteDevToolsHandle()` and `noopHandle()` guarded by `dev` |
| Runtime not found (blank iframe) | Runtime package was not built or path resolution failed | For npm users, reinstall `@fsodano/vite-plugin-svelte-devtools@0.4.0` and restart the app. Contributors must run `npm run build` from the repository root |
| Blank iframe for the Svelte tab | Client UI package was not built | For npm users, reinstall the plugin and restart the app. Contributors must run `npm run build:client` (or `npm run build`) from the repository root and restart the dev server (`packages/client/dist/` is served statically) |
| Transform not applied to a component | `include`/`exclude` patterns filter it out, or it is in `.svelte-kit/generated/` | Check `include` and `exclude` patterns. Generated files in `.svelte-kit/generated/` are skipped automatically |
| Component not in tree | Registration timing or unmounted component | Check `window.__SVELTE_DEVTOOLS_REGISTRY__` in the browser console. Each mounted instance has a unique ID (`svt-<hash>:<uid>`) |
| State values do not update | `$inspect` injection was disabled or the runtime is not loaded | Verify `/__svelte-devtools/svelte-runtime.js` is in the page HTML and check `window.__SVELTE_DEVTOOLS_RUNTIME__` in the console |
| `svelte-devtools init` fails with `Install the plugin and host first:` | `@fsodano/vite-plugin-svelte-devtools` or `@vitejs/devtools` is missing from `package.json` `dependencies` or `devDependencies` | Run `npm install -D @fsodano/vite-plugin-svelte-devtools@0.4.0 @vitejs/devtools@0.4.8` |
| Svelte 4 patterns not detected | File is already migrated, or file has not been transformed yet | Open a page that imports the component so Vite transforms the `.svelte` file |
| "Unknown entry" error during dock registration | Wrong dock config structure | Use the flat structure `{ id, title, icon, type: 'iframe', url }`, not a nested `view` object |

## Add explicit SQLite observations

Keep database code on the server. Import `traceSqliteQuery` from `@fsodano/vite-plugin-svelte-devtools/sqlite` and wrap the actual synchronous call:

```ts
const result = traceSqliteQuery({
  enabled: dev,
  database: 'todos',
  operation: 'get',
  statement: statement.source,
  captureStatement: true
}, () => statement.get({ id }));
```

Use the framework's `dev` flag. Statement capture is off by default; opt in only for fixed templates without expanded user values. The wrapper preserves native return and error behavior and records no bindings or result rows. It requires an active traced request. It does not automatically instrument promises, iterators, or transaction boundaries. See [server integration](../docs/05_server.md).
