---
name: implement-svelte-devtools
description: Use when installing or configuring @fsodano/vite-plugin-svelte-devtools in a Vite or SvelteKit project.
---

# Implementing Svelte DevTools

Follow these steps to add Svelte DevTools to any Vite or SvelteKit project.

## Prerequisites

| Requirement | Minimum Version |
|---|---|
| Node.js | 20.19+ |
| Vite | 8.0.3+ |
| Svelte | 5.20+ (runes mode) |
| @vitejs/devtools | 0.4.8 (tested host) |

Use Svelte 5 runes in application components. Keep the generated compiler options. Current Svelte CLI projects configure these inside `sveltekit(...)` in `vite.config.ts`; older projects use `svelte.config.js`.

## Installation

Install `@fsodano/vite-plugin-svelte-devtools@0.2.2` and `@vitejs/devtools@0.4.8` with `npm install -D`. Keep the application's normal Svelte compiler integration. The [installation guide](../docs/02_vite-plugin.md#installation) also covers source development and local fixtures.

Run `npx svelte-devtools init` in the application directory, then `npm run dev`. The command preserves the generated config and adds the SvelteKit hook. Use `--dry-run` to preview edits. Existing custom hooks and dynamic configs require the manual setup below.

## Vite Config Setup

### Plain Vite + Svelte

Add the `DevTools()` and `svelteDevTools()` plugins to your `vite.config.ts`:

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

The plugin order matters: `DevTools()` should come first, then the Svelte plugin, then `svelteDevTools()`.

## SvelteKit Hooks Setup

SvelteKit bypasses Vite's `transformIndexHtml` during SSR, so you need a hooks file to inject the runtime script. Create `src/hooks.server.ts`:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

The `dev` check ensures the hooks only run in development mode. In production, `noopHandle()` passes requests through unchanged.

The plugin prints this reminder only when debug logging is enabled. Use the setup command or add the hook explicitly.

## Plugin Options

```typescript
interface SvelteDevToolsPluginOptions {
  /** File patterns to include. Default: [/\.svelte$/] */
  include?: RegExp[];

  /** File patterns to exclude. Default: [/node_modules/] */
  exclude?: RegExp[];

  /** Enable state inspection via $inspect injection. Default: true. */
  enableStateInspection?: boolean;
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

**Only use the component tree (no state injection):**
```typescript
svelteDevTools({
  enableStateInspection: false   // disables state inspection injection
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
3. Click the Vite DevTools icon to open the dock (authorize with the six-digit devframe code printed in the server terminal on first use)
4. Select the **Svelte** tab
5. You should see the component tree populated with your Svelte components

If everything is working:

- Components appear in the tree with their names
- Selecting a component shows its current state values (Props/State/DOM/Source sub-tabs)
- Changing state in the app updates the DevTools view in real time
- The status indicator shows "Connected" with component count
- The Events tab shows mount/state/effect entries as you interact

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Plugin does not load in SvelteKit | Missing `hooks.server.ts` or wrong hooks setup | Add `src/hooks.server.ts` with `svelteDevToolsHandle()` and `noopHandle()` for production guard |
| Runtime not found (blank iframe) | Runtime package was not built or path resolution failed | For npm users, reinstall the latest plugin and restart the app. Contributors must rebuild the runtime from the monorepo root |
| Blank iframe for the Svelte tab | Client UI package was not built | For npm users, reinstall the latest plugin and restart the app. Contributors must rebuild the client from the monorepo root |
| Transform not applied to a component | Include/exclude patterns filter it out, or it's in `.svelte-kit/generated/` | Check your `include` and `exclude` patterns. Generated files in `.svelte-kit/generated/` are automatically skipped. |
| Component not in tree | Component ID collision or registration timing | Check `window.__SVELTE_DEVTOOLS_REGISTRY__` in the browser console. Each mounted instance has a unique ID; repeated instances share file metadata but must remain separate in the tree. |
| State values do not update | `$inspect` injection did not fire, or the runtime is not loaded | Verify the runtime script is in the page HTML. Check `window.__SVELTE_DEVTOOLS_RUNTIME__` in the console. |
| `@vitejs/devtools` peer dependency error | DevTools kit is not installed | Run `npm install --save-dev @vitejs/devtools@0.4.8` |
| Svelte 4 patterns not detected | File is already fully migrated, or runes mode is off | Verify `svelte.config.js` has `compilerOptions: { runes: true }` |
| "Unknown entry" error during dock registration | Wrong dock config structure | Use flat structure: `{ id, title, icon, type: 'iframe', url }`, not nested `view` object |

## Add explicit SQLite observations

Keep database code on the server. Import `traceSqliteQuery` from `@fsodano/vite-plugin-svelte-devtools/sqlite` and wrap the actual synchronous call:

```ts
const result = traceSqliteQuery({
  enabled: dev, database: 'todos', operation: 'get',
  statement: statement.source, captureStatement: true
}, () => statement.get({ id }));
```

Use the framework's `dev` flag. Statement capture is off by default; opt in only for safe templates without expanded user values. The wrapper keeps native return/error behavior and records no bindings or result rows. It requires an active traced request. It does not automatically instrument promises, iterators, or transaction boundaries. See [server integration](../docs/05_server.md).
