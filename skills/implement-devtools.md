---
name: implement-svelte-devtools
description: Use when installing or configuring @svelte-devtools/vite-plugin in a Vite or SvelteKit project. Covers npm install, vite.config.ts setup, SvelteKit hooks, plugin options, and verification.
---

# Implementing Svelte DevTools

Follow these steps to add Svelte DevTools to any Vite or SvelteKit project.

## Prerequisites

| Requirement | Minimum Version |
|---|---|
| Node.js | 20.19+ |
| Vite | 8+ |
| Svelte | 5 (runes mode) |
| @vitejs/devtools | latest |

The project must use Svelte 5 with runes mode enabled (`compilerOptions: { runes: true }` in svelte.config.js).

## Installation

```bash
# Install the devtools plugin and its peer dependency
npm install --save-dev @svelte-devtools/vite-plugin @vitejs/devtools
```

If you are working from the monorepo and the package is unpublished, link it instead:

```bash
# In the monorepo root
npm run build

# In your target project
npm install --save-dev @vitejs/devtools
npm link ../path/to/svelte-dev-extension/packages/vite-plugin
```

## Vite Config Setup

### Plain Vite + Svelte

Add the `DevTools()` and `svelteDevTools()` plugins to your `vite.config.ts`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { DevTools } from '@vitejs/devtools';
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

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
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

export default defineConfig({
  plugins: [
    DevTools(),
    sveltekit(),
    svelteDevTools()
  ]
});
```

The plugin order matters: `DevTools()` should come first, then the Svelte plugin, then `svelteDevTools()`.

## SvelteKit Hooks Setup

SvelteKit bypasses Vite's `transformIndexHtml` during SSR, so you need a hooks file to inject the runtime script. Create `src/hooks.server.ts`:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { svelteDevToolsHandle, noopHandle } from '@svelte-devtools/vite-plugin/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

The `dev` check ensures the hooks only run in development mode. In production, `noopHandle()` passes requests through unchanged.

When the plugin detects SvelteKit, it logs this exact snippet to stdout as a reminder.

## Plugin Options

```typescript
interface SvelteDevToolsPluginOptions {
  /** Enable state inspection via $inspect injection. Default: true */
  enableStateInspection?: boolean;

  /** File patterns to include. Default: [/\.svelte$/] */
  include?: RegExp[];

  /** File patterns to exclude. Default: [/node_modules/] */
  exclude?: RegExp[];
}
```

### Examples

**Minimal setup with defaults:**
```typescript
svelteDevTools()
```

**Only inspect specific directories:**
```typescript
svelteDevTools({
  include: [/src\/lib\/components\//],
  exclude: [/node_modules/, /\.test\.svelte$/]
})
```

**Disable state inspection (only use component tree):**
```typescript
svelteDevTools({
  enableStateInspection: false
})
```

## How It Works

The plugin injects three things into each `.svelte` file at build time:

1. **Component registration** -- stores metadata (`id`, `name`, `filename`) in `window.__SVELTE_DEVTOOLS_REGISTRY__`
2. **`data-svelte-devtools-id` attribute** -- on the first non-void HTML element for DOM correlation
3. **`$inspect` hooks** -- wraps `$state`, `$derived`, `$props` declarations to track value changes

## Verification

After starting the dev server:

1. Open the browser to your app (typically `http://localhost:5173`)
2. Look for the Vite DevTools overlay at the bottom-right corner of the page
3. Click the Vite DevTools icon to open the dock
4. Select the **Svelte** tab
5. You should see the component tree populated with your Svelte components

If everything is working:

- Components appear in the tree with their names
- Selecting a component shows its current state values
- Changing state in the app updates the DevTools view in real time
- The status indicator shows "Connected" with component count

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Plugin does not load in SvelteKit | Missing `hooks.server.ts` or wrong hooks setup | Add `src/hooks.server.ts` with `svelteDevToolsHandle()` and `noopHandle()` for production guard |
| Runtime not found (blank iframe) | Runtime package was not built or path resolution failed | Rebuild the runtime: `npm run build:runtime -w @svelte-devtools/runtime` or `npm run build` from the monorepo root |
| Blank iframe for the Svelte tab | Client UI package was not built | Rebuild the client: `npm run build:client -w @svelte-devtools/client` or `npm run build` from the monorepo root |
| Transform not applied to a component | Include/exclude patterns filter it out, or it's in `.svelte-kit/generated/` | Check your `include` and `exclude` patterns. Generated files in `.svelte-kit/generated/` are automatically skipped. |
| Component not in tree | Component ID collision or registration timing | Check `window.__SVELTE_DEVTOOLS_REGISTRY__` in the browser console. Each component should have a unique `svt-*` ID. |
| State values do not update | `$inspect` injection did not fire, or the runtime is not loaded | Verify the runtime script is in the page HTML. Check `window.__SVELTE_DEVTOOLS_RUNTIME__` in the console. |
| `@vitejs/devtools` peer dependency error | DevTools kit is not installed | Run `npm install --save-dev @vitejs/devtools` |
| Svelte 4 patterns not detected | File is already fully migrated, or runes mode is off | Verify `svelte.config.js` has `compilerOptions: { runes: true }` |
| "Unknown entry" error during dock registration | Wrong dock config structure | Use flat structure: `{ id, title, icon, type: 'iframe', url }`, not nested `view` object |
