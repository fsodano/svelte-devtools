# Vite 8 for Svelte DevTools Plugin Development

A practical guide to Vite 8 internals, plugin architecture, and the patterns used by the Svelte DevTools plugin. This doc assumes you know what Vite does at a high level. It focuses on what changed in Vite 8 and how to work with it effectively for DevTools plugin development.

## Contents

- [Vite 8 Overview](#vite-8-overview)
- [Plugin Architecture for Svelte DevTools](#plugin-architecture-for-svelte-devtools)
- [Vite 8 Plugin API](#vite-8-plugin-api)
- [Rolldown Compatibility](#rolldown-compatibility)
- [Vite 8 Migration Notes](#vite-8-migration-notes)
- [@vitejs/devtools-kit Integration](#vitejsdevtools-kit-integration)
- [Dev Server Configuration](#dev-server-configuration)
- [Svelte-Specific Considerations](#svelte-specific-considerations)

---

## Vite 8 Overview

Vite 8 is a major rewrite centered on **Rolldown**, a Rust-based bundler that replaces both esbuild and Rollup as the single production bundler. The core design goal is one unified tool for dev and production builds, removing the long-standing Rollup-vs-esbuild split.

### What Rolldown Changes

In Vite 7 and earlier, Vite used esbuild for dev (transforms, deps pre-bundling) and Rollup for production builds. This meant two different behaviors, two config schemas (`build.rollupOptions`), and subtle differences between dev and prod. Rolldown eliminates that gap:

- **Single bundler for dev and prod**. The same code path runs in both modes.
- **10-30x faster builds** vs Rollup for large projects. Rust-based, parallelized across CPU cores.
- **Rollup-compatible plugin API**. Most Rollup plugins work with minimal changes. Rolldown implements the Rollup plugin hook interface.

### Oxc Replaces esbuild

Vite 8 uses the [Oxc](https://oxc.rs) toolchain (Oxidation Compiler) for JavaScript/TypeScript transforms:

- **Transforms**: Oxc handles the JS transform pipeline (e.g. lowering modern syntax, stripping TypeScript).
- **Minification**: Lightning CSS replaces esbuild for CSS minification in production.
- **Oxc is Rust-based**, so it's fast. But it's also stricter in some edge cases.

What this means for Svelte DevTools: the plugin's `transform` hook still works exactly the same way. Oxc runs *before* your plugin in the pipeline (for `enforce: 'pre'` plugins like ours) or *after* (for `enforce: 'post'`). Vite manages this ordering.

### Baseline Browser Target

Vite 8 defaults to **Baseline Widely Available 2026-01-01** as the browser target. This is a newer baseline than Vite 7's `es2020` / `modules` target. Practically, it means:

- Vite 8 ships less polyfill and transform overhead for modern browsers.
- `import.meta.url`, optional chaining, nullish coalescing, top-level await, and `globalThis` are all assumed available.
- You do not need to configure `build.target` for modern browser support, but you can still set it if you need legacy compatibility.

---

## Plugin Architecture for Svelte DevTools

The Svelte DevTools plugin follows a standard Vite plugin pattern with one addition: it integrates with `@vitejs/devtools-kit` to register a dock in the Vite DevTools panel.

### The Three Layers

The plugin operates at three Vite extension points:

| Layer | Hook | Purpose |
|-------|------|---------|
| Config | `configResolved` | Detect SvelteKit, store resolved config |
| Dev server | `configureServer` | Serve runtime script, client UI, and API endpoints |
| Transform | `transform` | Inject `$inspect` hooks into `.svelte` files |
| HTML | `transformIndexHtml` | Inject runtime script tag into host page |
| DevTools | `devtools.setup` | Register dock and RPC methods with `@vitejs/devtools` |

### Dock Registration Pattern

The plugin registers a dock entry through the `devtools` property on the plugin object:

```typescript
const plugin: Plugin & { devtools: { setup: (ctx: DevToolsNodeContext) => void } } = {
  name: 'svelte-devtools',
  devtools: {
    setup(ctx) {
      ctx.docks.register({
        id: 'svelte-devtools',
        title: 'Svelte',
        icon: 'simple-icons:svelte',
        type: 'iframe',
        url: '/__svelte-devtools/'
      });
    }
  }
};
```

The `type: 'iframe'` dock tells Vite DevTools to render an iframe pointed at the given URL. The plugin serves that URL through a middleware on the Vite dev server.

### The Transform Pipeline for .svelte Files

The transform hook processes each `.svelte` file in four passes:

1. **Parse with `svelte/compiler`** — get the Svelte AST, extract the script content range.
2. **Parse script with `@babel/parser`** — get a JS AST of the script section only.
3. **Traverse for rune declarations** — find `$state()`, `$derived()`, `$props()`, and motion class instantiations.
4. **Inject `$inspect` hooks** — use `magic-string` to insert `$inspect().with(...)` calls at precise positions while preserving source maps.

---

## Vite 8 Plugin API

Vite plugins are objects with hook functions. The hooks relevant to Svelte DevTools are covered below.

### Hook Filters (Vite 6.3+ / 8)

Vite 6.3 introduced **hook filters** as a performance optimization. Instead of running every plugin's `transform` hook on every module, you can tell Vite which files the hook applies to:

```typescript
{
  name: 'svelte-devtools',
  transform: {
    order: 'pre',
    filter: {
      include: [/\.svelte$/],
      exclude: [/node_modules/, /\.svelte-kit\/generated/]
    },
    handler(code, id) {
      // Only called for matching files
    }
  }
}
```

Without a `filter` property, Vite calls the hook for every module in the graph. For a DevTools plugin that only cares about `.svelte` files, adding a filter is a free performance win.

### `createFilter`

Vite exports a `createFilter` utility that works identically to Rollup's:

```typescript
import { createFilter } from 'vite';

const filter = createFilter(
  [/\.svelte$/],     // include
  [/node_modules/]    // exclude
);

// Later in transform hook:
if (!filter(id)) return null;
```

The filter accepts strings (glob patterns), RegExps, or arrays of either. Include/exclude are optional.

### Core Hooks

#### `config`

Modifies the Vite config before it's resolved. Use sparingly. For Svelte DevTools, we don't need this hook because we don't change build behavior.

```typescript
config(userConfig, env) {
  return {
    // merge or override config values
  };
}
```

#### `configResolved`

Called after the full config is resolved. This is where we detect SvelteKit and store the resolved config:

```typescript
configResolved(resolvedConfig) {
  config = resolvedConfig;
  root = config.root;

  const hasSvelteKit = resolvedConfig.plugins.some(
    p => p?.name?.includes('sveltekit')
  );
  if (hasSvelteKit) {
    console.log('[Svelte DevTools] Detected SvelteKit. Add hooks.server.ts...');
  }
}
```

#### `configureServer`

Receives the ViteDevServer instance. This is where we:

- Register middlewares for the DevTools UI, runtime script, and API endpoints.
- Listen for WebSocket events.
- Set up global helpers.

```typescript
configureServer(server) {
  server.middlewares.use('/__svelte-devtools', handler);
  server.ws.on('svelte-devtools:open-in-editor', data => { ... });
}
```

#### `transformIndexHtml`

Injects content into the host HTML page. Only fires for plain Vite apps. **Does not fire for SvelteKit** (see [Svelte-Specific Considerations](#svelte-specific-considerations)).

```typescript
transformIndexHtml(html) {
  return html.replace(
    '</head>',
    `<script type="module" src="/__svelte-devtools/svelte-runtime.js"></script></head>`
  );
}
```

#### `transform`

The core hook for modifying source files. Called for every module (unless filtered). Must return `{ code, map }` or `null` (no change).

For our plugin, the transform hook:

1. Checks if the file matches include/exclude patterns.
2. Parses the `.svelte` file.
3. Injects component metadata, `$inspect` hooks, and effect tracking.
4. Returns the modified code with a source map.

```typescript
transform(code, id) {
  if (!filter(id)) return null;

  const s = new MagicString(code);
  // ... parse, inject, manipulate ...

  return s.hasChanged()
    ? { code: s.toString(), map: s.generateMap({ hires: true }) }
    : null;
}
```

#### `handleHotUpdate`

Customizes HMR behavior. When state changes in a component, you might want to do something beyond the default full-reload:

```typescript
handleHotUpdate(ctx) {
  // ctx.server, ctx.file, ctx.modules, ctx.read
  // Return modules to invalidate, or empty array to skip
  return ctx.modules;
}
```

For Svelte DevTools, HMR is handled by the Svelte plugin itself. Our plugin only modifies source at build time and doesn't need custom HMR logic.

### `apply` Property

Controls when a plugin is active:

```typescript
{
  apply: 'serve'  // Dev only
  // apply: 'build'  // Production only
  // apply: (config, env) => boolean  // Custom condition
}
```

The Svelte DevTools plugin uses `apply: 'serve'` because all injected code is dev-only. It has zero impact on production builds.

### `enforce` Property

Controls the order in which plugins run:

```typescript
{
  enforce: 'pre'   // Run before other plugins
  // enforce: 'post'  // Run after other plugins
  // (no enforce)     // Normal priority
}
```

Our plugin uses `enforce: 'pre'` so it transforms `.svelte` files before the Svelte plugin compiles them. This is required because we need to modify the script content before Svelte's compiler processes the template.

---

## Rolldown Compatibility

Since Vite 8 uses Rolldown as the bundler, there are a few compatibility notes relevant to Svelte DevTools.

### `@babel/parser` Works

The plugin uses `@babel/parser` to parse the JavaScript/TypeScript inside `.svelte` script blocks. This works in both esbuild and Rolldown environments because parsing happens inside the `transform` hook handler, not during bundling. The `@babel/parser` package has no dependency on esbuild or Rollup.

```typescript
import { parse as parseJS } from '@babel/parser';
import * as t from '@babel/types';

function parseJavaScript(code: string): t.File | null {
  try {
    return parseJS(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx']
    });
  } catch {
    return null;
  }
}
```

### `magic-string` Works

`magic-string` is the standard library for source-map-preserving string manipulation in Vite/Rollup plugins. It works identically under Rolldown because it operates on plain strings and produces source maps as plain objects.

Our plugin uses it in the transform hook:

```typescript
import MagicString from 'magic-string';

const s = new MagicString(code);
s.appendLeft(position, injectedCode);
return { code: s.toString(), map: s.generateMap({ hires: true }) };
```

### Detecting Rolldown

You can detect whether Rolldown is the bundler via `this.meta.rolldownVersion` inside a plugin hook:

```typescript
transform(code, id) {
  const roldownVer = this.meta.rolldownVersion;
  // e.g. '0.14.0' or undefined if using Rollup
}
```

This is rarely needed (most plugin code is bundler-agnostic) but useful if you need to work around a bundler-specific behavior.

### Module Type Detection

When returning from `load` or `transform` hooks, you can specify the module type explicitly:

```typescript
return {
  code: transformedCode,
  map: sourceMap,
  moduleType: 'js'  // or 'json', 'text', etc.
};
```

In Rolldown, explicitly returning `moduleType: 'js'` ensures Vite treats the output as a JavaScript module. This matters for files that might be misidentified (e.g. `.svelte` files that the transform hook converts to JS). In practice, Vite handles this correctly for `.svelte` through the Svelte plugin's own `moduleType` return.

---

## Vite 8 Migration Notes

If you are coming from Vite 7 (or earlier) plugin development, here are the key changes.

### `build.rollupOptions` -> `build.rolldownOptions`

The old Rollup-specific config has been renamed:

```typescript
// Vite 7
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['some-lib'],
      output: { globals: { ... } }
    }
  }
});

// Vite 8
export default defineConfig({
  build: {
    rolldownOptions: {
      external: ['some-lib'],
      output: { globals: { ... } }
    }
  }
});
```

If you need to support both Vite 7 and Vite 8, check which bundler is active in `configResolved` and use the corresponding config path.

### Oxc Replaces esbuild for JS Transforms

In Vite 7, esbuild handled TypeScript stripping, JSX transform, and syntax lowering during dev. In Vite 8, **Oxc** handles these transforms.

For a DevTools plugin, this is largely transparent. Your `transform` hook receives the original source code (before Oxc processes it when `enforce: 'pre'`) or the already-transformed code (when `enforce: 'post'`). Our plugin uses `enforce: 'pre'` and always sees the original `.svelte` source with its raw TypeScript.

### Lightning CSS Replaces esbuild for CSS

CSS minification during production builds now uses **Lightning CSS** instead of esbuild. This only matters if your plugin processes CSS files, which Svelte DevTools does not.

### `resolve.tsconfigPaths`

Vite 8 has built-in support for TypeScript path alias resolution via `resolve.tsconfigPaths`:

```typescript
export default defineConfig({
  resolve: {
    tsconfigPaths: true  // Reads paths from tsconfig.json
  }
});
```

This replaces the old `vite-tsconfig-paths` plugin. If your test app uses `@/` or `$lib/` aliases, enable this in the Vite config.

### Consistent CJS Interop

Vite 8 enforces consistent CommonJS interop. The heuristics for detecting CJS exports are stricter, and the behavior is consistent between dev and prod (since both now use Rolldown). This means:

- If a dependency has a broken or ambiguous CJS export, you're more likely to hit an error consistently (instead of `works in dev / breaks in build`).
- Use `resolve.conditions` and `resolve.mainFields` to control resolution behavior if needed.

---

## @vitejs/devtools-kit Integration

The `@vitejs/devtools` package provides a devtools panel that plugins can extend. Svelte DevTools registers itself as a dock within this panel.

### How It Works

The Vite DevTools package provides a plugin that you add to your Vite config:

```typescript
import { DevTools } from '@vitejs/devtools';

export default defineConfig({
  plugins: [DevTools(), svelteDevTools()]
});
```

The `DevTools()` plugin creates the iframe-based devtools panel with a dock system. Other plugins (like ours) can register docks within it.

### Registering Docks

A dock is a tab in the DevTools panel. Our plugin registers the `Svelte` tab:

```typescript
devtools: {
  setup(ctx) {
    ctx.docks.register({
      id: 'svelte-devtools',
      title: 'Svelte',
      icon: 'simple-icons:svelte',
      type: 'iframe',
      url: '/__svelte-devtools/'
    });
  }
}
```

The dock entry supports these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique dock identifier |
| `title` | string | Display name in the dock bar |
| `icon` | string | Icon ID (e.g. `simple-icons:svelte`) |
| `type` | `'iframe'` \| `'panel'` | How the dock renders |
| `url` | string | Iframe src URL (when `type: 'iframe'`) |

### Registering RPC Methods

The `@vitejs/devtools` kit supports RPC for communication between the client UI (iframe) and the server (plugin). The plugin registers handlers:

```typescript
ctx.rpc.register({
  name: 'getComponents',
  type: 'query',       // Read-only request
  handler: async () => {
    return Array.from(componentRegistry.values());
  }
});

ctx.rpc.register({
  name: 'openInEditor',
  type: 'mutation',    // Writes or side effects
  handler: async (data) => {
    // Open file in editor...
    return true;
  }
});
```

The client UI calls these via the RPC bridge provided by `@vitejs/devtools`.

### Messages API

The DevTools kit also provides a messages system for showing notifications:

```typescript
if (ctx.messages) {
  ctx.messages.add({
    message: 'Svelte DevTools initialized',
    description: 'Component tree and state inspection active',
    level: 'info',
    category: 'svelte-devtools'
  });
}
```

Messages support `info`, `warn`, and `error` levels. They appear in the DevTools panel's message area.

### WebSocket Communication

Beyond the DevTools kit's RPC, you can use Vite's `server.ws` for direct WebSocket communication:

```typescript
configureServer(server) {
  // Server sends to client
  server.ws.send('svelte-devtools:custom-event', { data: 'hello' });

  // Server listens from client
  server.ws.on('svelte-devtools:open-in-editor', (data) => {
    // handle request
  });
}
```

The client connects to `server.ws` via the standard Vite WebSocket client (`import.meta.hot`). This is useful for low-latency events that don't need the RPC round-trip pattern.

### Server-to-Client Flow

```
Plugin (transform hook) -> Component Registry
                    |
                    v
                RPC handler (getComponents)
                    |
                    v
            DevTools Client (iframe)
                    |
                    v
              Component Tree UI
```

### Client-to-Server Flow

```
Client (User clicks "open in editor")
                    |
                    v
                RPC call
                    |
                    v
             RPC handler (openInEditor)
                    |
                    v
            launch-editor opens file
```

---

## Dev Server Configuration

The plugin serves several types of content through the Vite dev server.

### Serving Static Assets

The `configureServer` hook adds Express-style middlewares:

```typescript
configureServer(server) {
  server.middlewares.use('/__svelte-devtools', (req, res, next) => {
    const url = req.url?.split('?')[0] || '';

    // 1. Serve runtime script at /__svelte-devtools/svelte-runtime.js
    if (url === '/svelte-runtime.js') {
      const runtimeFile = path.join(runtimePath, 'index.js');
      res.setHeader('Content-Type', 'application/javascript');
      fs.createReadStream(runtimeFile).pipe(res);
      return;
    }

    // 2. Serve built assets from dist/
    const fullPath = path.join(distPath, url.slice(1));
    if (fs.existsSync(fullPath)) {
      sirv(distPath, { dev: true })(req, res, next);
      return;
    }

    // 3. SPA fallback for client UI
    sirv(clientPath, { dev: true, single: true })(req, res, next);
  });
}
```

### SPA Fallback for Client UI

The DevTools client is a Svelte 5 app built separately. During dev, the compiled output lives in `client/dist/`. The `sirv` middleware with `single: true` serves `index.html` for any unmatched route under the prefix, enabling client-side routing.

### sirv Usage

[sirv](https://github.com/lukeed/sirv) is a static file server used by Vite internally. In our middleware, we use it in `dev` mode which disables aggressive caching:

```typescript
import sirv from 'sirv';
sirv(clientPath, { dev: true, single: true });
```

### `server.forwardConsole`

Vite 8 includes `server.forwardConsole`, which forwards browser console output to the terminal:

```typescript
export default defineConfig({
  server: {
    forwardConsole: true
  }
});
```

This is useful during DevTools development because the runtime's `console.log` calls appear in your terminal alongside Vite's own output. It works by injecting a WebSocket listener into the browser page that forwards `console.*` calls to the server.

---

## Svelte-Specific Considerations

### SSR and `transformIndexHtml`

**`transformIndexHtml` does not fire for SvelteKit.** SvelteKit handles HTML generation server-side, so Vite's normal HTML transform pipeline is bypassed. The `transformIndexHtml` hook only works for plain Vite apps.

**Workaround**: Use `transformPageChunk` in a SvelteKit `handle` hook:

```typescript
// src/hooks.server.ts
import { svelteDevToolsHandle } from '@svelte-devtools/vite-plugin/sveltekit';

export const handle = svelteDevToolsHandle();
```

This handle function injects both the Vite DevTools client script and the Svelte runtime script into every server-rendered HTML response. It uses SvelteKit's `transformPageChunk` API to insert `<script>` tags before `</body>`.

The Vite plugin detects SvelteKit during `configResolved` and logs a message telling the user to add this hook:

```
[Svelte DevTools] Detected SvelteKit. Add to src/hooks.server.ts:
  import { dev } from '$app/environment';
  import { svelteDevToolsHandle, noopHandle } from '@svelte-devtools/vite-plugin/sveltekit';
  export const handle = dev ? svelteDevToolsHandle() : noopHandle();
```

### The .svelte File Transform Pipeline

A deeper look at what happens in the `transform` hook:

```
.svelte source
    |
    v
svelte/compiler.parse()  -->  Svelte AST
    |                           |
    |                   Extract script content range
    |                           |
    v                           v
@babel/parser.parse()   -->  Babel AST (for script only)
    |
    v
Traverse for:
  - $state() / $derived() / $props() declarations
  - Spring / Tween new expressions
  - $effect / $effect.pre calls
    |
    v
magic-string.appendLeft() for each injection point
    |
    v
{ code, map }  -->  Vite
```

Each file gets:

1. **Component metadata** (registry entry + runtime registration) injected at the start of the `<script>` block.
2. **`data-svelte-devtools-id`** attribute added to the first non-void HTML element.
3. **`$inspect(...).with(...)`** calls inserted after each rune declaration.
4. **`$effect` tracking** code injected into effect callbacks.
5. **Component registry** updated with rune counts and migration analysis.

### Vite 8's Default Browser Target and Svelte

Vite 8's default browser target (Baseline Widely Available 2026-01-01) is well aligned with Svelte 5's output. Svelte 5 generates modern ES module code with native class syntax, optional chaining, and nullish coalescing. No special Vite config is needed for modern browser support.

If you need to test in older browsers, override the target:

```typescript
export default defineConfig({
  build: {
    target: 'es2020'
  }
});
```

### Generated Files

Files in `.svelte-kit/generated/` are skipped early in the transform:

```typescript
if (/\.svelte-kit\/generated/.test(id)) return null;
```

These are auto-generated SvelteKit files that don't correspond to user components. Transforming them would waste cycles and potentially cause issues.

---

## Summary

Vite 8 is a significant change from Vite 7, but the plugin API surface for DevTools plugins remains stable. The key things to remember:

- **Rolldown** replaces Rollup + esbuild. Most plugin code is unaffected.
- **Hook filters** (`transform.filter`) are the recommended way to limit which files your plugin processes.
- **Oxc and Lightning CSS** replace esbuild transforms and CSS minification, but your `transform` hook sees code before these run (with `enforce: 'pre'`).
- **`@vitejs/devtools-kit`** provides dock registration, RPC, and messages for DevTools plugins.
- **SvelteKit** bypasses `transformIndexHtml`. Use `transformPageChunk` via the handle export instead.
- **`magic-string` and `@babel/parser`** remain the right tools for source-code manipulation inside transform hooks.

The plugin's dependency on Vite is declared as `"vite": "^8.0.3"` in `package.json`. This range allows minor and patch updates while keeping the API surface stable.

---

## Audit Report — Vite 8 / Rolldown Compatibility

**Date:** 2026-07-19
**Scope:** `@svelte-devtools/vite-plugin` (packages/vite-plugin)
**Verdict:** Largely compatible — 4 issues found (2 high, 1 medium, 1 low), 3 optimization opportunities.

### 1. @babel/parser

**Status: ✅ PASS**

`@babel/parser` is a pure-JS synchronous parser called inside the `transform`
hook handler. Vite 8 itself depends on `@babel/parser ^7.29.2` as a devDep.
Rolldown does not interfere with parser libraries used inside transform handlers.

**No action required.**

### 2. magic-string

**Status: ✅ PASS**

The plugin returns `{ code, map }` from `transform`, which is the standard
`Rolldown.TransformResult` format. Vite 8 uses `magic-string ^0.30.21` internally.
The plugin's `^0.30.0` resolves to a compatible version.

**Recommendation (optional):** Bump to `^0.30.21` to match Vite 8 exactly.

### 3. Vite 8 Plugin API

#### 3a. Hook Imports

**Status: ✅ PASS**

Imports `Plugin`, `ResolvedConfig`, `ViteDevServer` from `vite` — all present
and unchanged in Vite 8. No deprecated imports.

#### 3b. DevToolsContext Type

**Status: ✅ RESOLVED**

The local `DevToolsContext` interface has been replaced with `DevToolsNodeContext`
from `@vitejs/devtools-kit`. The plugin now uses the typed `ctx.logs` API instead
of the cast-ridden `ctxAny.messages` pattern.

```typescript
import type { DevToolsNodeContext } from '@vitejs/devtools-kit';

// In the plugin object:
devtools: {
    setup(ctx: DevToolsNodeContext) {
        ctx.docks.register({ /* ... */ });
        ctx.logs.add({ /* ... */ });
        ctx.rpc.sharedState.get?.('svelte-devtools:agent-state', {
            initialValue: { lastBuildStatus: null, recentErrors: [], componentCount: 0 },
        }).catch(() => {});
    }
}
```

#### 3c. Hook Filters on `transform`

**Status: ⚠️ OPTIMIZE — Medium Priority**

The plugin currently calls `shouldProcess()` inside the transform body:

```typescript
transform(code: string, id: string) {
    if (/\.svelte-kit\/generated/.test(id)) return null;
    if (!shouldProcess(id, include, exclude)) return null;
    // ...
}
```

Rolldown supports hook-level `filter` on `transform`, `load`, and `resolveId`.
Adding a filter avoids invoking the function entirely for non-matching files:

```typescript
transform: {
    order: 'pre',
    filter: { id: /\.svelte$/ },
    handler(code: string, id: string) {
        // Still check for generated files (they match .svelte$ but should be excluded)
        if (/\.svelte-kit\/generated/.test(id)) return null;
        // ... rest of transform (remove shouldProcess call)
    }
}
```

This replaces the `shouldProcess()` call since the filter handles include/exclude.
The `.svelte-kit/generated` secondary check is still needed.

#### 3d. `this.meta.rolldownVersion`

**Status: ✅ INFORMATIONAL**

Available but unused. Useful if version-gated behavior is ever needed. No action.

#### 3e. `resolve.tsconfigPaths`

**Status: ✅ INFORMATIONAL**

Vite 8 supports `resolve.tsconfigPaths: true` natively. Not currently used by the
test apps, but useful to know for downstream consumers. No action.

### 4. Peer Dependencies

| Dependency | Declared | Installed / Compatible | Status |
|-----------|----------|----------------------|--------|
| `@vitejs/devtools` | `^0.1.0` | 0.1.11 ✅ | **PASS** |
| `vite` | `^8.0.3` | 8.0.3 ✅ | **PASS** |
| `@sveltejs/kit` | `^2.55.0` (optional) | 2.55.0 ✅ | **PASS** |
| `svelte` | `^5.0.0` | 5.55.1 ⚠️ | **PASS** (correct range) |
| `sirv` | `^2.0.4` | Vite 8 uses `^3.0.2` | **⚠️ SHOULD UPGRADE** |

`sirv` upgrade: change `^2.0.4` to `^3.0.2` in `packages/vite-plugin/package.json`.

### 5. Runtime Property `ctx.messages` vs `ctx.logs`

**Status: ❌ FAIL — High Priority**

At runtime, the plugin accesses `ctx.messages` (via an `as unknown` cast):

```typescript
const ctxAny = ctx as unknown as Record<string, unknown>;
if (ctxAny.messages) {
    messagesApi = ctxAny.messages as Record<string, (arg: unknown) => unknown>;
    // Used as: messagesApi.add({ message, level, category, ... })
}
```

The Vite 8 `DevToolsNodeContext` has `ctx.logs` (type `DevToolsLogsHost`), not
`ctx.messages`. The `.add()` method signatures are similar — both accept
objects with `message`, `description`, `level`, `category`, `autoDelete` fields.

**Fix:** Replace all `ctx.messages` access with `ctx.logs`. See §3b above.

### 6. SvelteKit SSR Handle

**Status: ✅ PASS**

`sveltekit.ts` uses `Handle` from `@sveltejs/kit` and `transformPageChunk` API —
both stable in @sveltejs/kit@2.55.0. The `__SVELTE_DEVTOOLS_INJECT_PATH__`
global pattern is unchanged between Vite 7 and Vite 8.

### 7. Rolldown-Specific: `build.rolldownOptions.devtools`

**Status: ✅ PASS**

The SvelteKit test app correctly enables devtools mode for static builds:

```typescript
build: {
    rolldownOptions: {
        devtools: {},
    },
}
```

No change needed.

### 8. TypeScript 6 Compatibility

**Status: ✅ INFORMATIONAL**

The workspace root has `typescript: ^6.0.2` as a devDep. TypeScript 6 string
enums and `satisfies` keyword are used appropriately in the proposal above.
No action required.

---

### Summary of Required Changes

#### 🔴 Must Fix

| # | File | Change | Severity |
|---|------|--------|----------|
| 1 | `index.ts:440-455` | Replace local `DevToolsContext` with `DevToolsNodeContext` from `@vitejs/devtools-kit` | **High** — type mismatch + missing properties |
| 2 | `index.ts:354-363` | Replace `ctxAny.messages` with `ctx.logs` (property renamed in Vite 8 devtools-kit) | **High** — messages silently dropped at runtime |
| 3 | `packages/vite-plugin/package.json` | Add `@vitejs/devtools-kit: "^0.1.11"` to dependencies | **High** — needed for #1 and #2 |
| 4 | `index.ts:369-372` | Remove `as unknown` cast on `ctx.rpc` — `sharedState` is typed on `RpcFunctionsHost` | **Medium** — type safety |

#### 🟡 Should Fix

| # | File | Change | Severity |
|---|------|--------|----------|
| 5 | `index.ts:376-428` | Add `filter: { id: /\.svelte$/ }` to `transform` hook, remove `shouldProcess()` | **Medium** — Rolldown hook filter performance |
| 6 | `packages/vite-plugin/package.json` | Upgrade `sirv` from `^2.0.4` to `^3.0.2` | **Low** — aligns with Vite 8 |

#### 🟢 Optional

| # | File | Change | Severity |
|---|------|--------|----------|
| 7 | `packages/vite-plugin/package.json` | Bump `magic-string` from `^0.30.0` to `^0.30.21` | **Low** — cosmetic alignment |
| 8 | `index.ts:8-9` | Import types from `@vitejs/devtools-kit` instead of local declarations | **Low** — cleanup |

### File-Level Impact Map

```
packages/vite-plugin/src/index.ts        ← 5 edits (lines 44, 253-374, 376-428, 440-455, 457-459)
packages/vite-plugin/package.json        ← 2 edits (add dep, bump sirv)
packages/vite-plugin/src/sveltekit.ts    ← 0 edits (no changes needed)
test-app/vite.config.ts                  ← 0 edits (no changes needed)
svelte-extension-test/vite.config.ts     ← 0 edits (no changes needed)
```

