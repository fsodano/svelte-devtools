# Svelte DevTools — Browser runtime

**Connect Svelte component instrumentation to the development panel.**

`@fsodano/svelte-devtools-runtime` (`0.4.0`) is the browser runtime in the Svelte DevTools pipeline (`.svelte file -> vite-plugin $inspect injection -> browser runtime -> postMessage -> client panel -> HTTP API`). It tracks mounted component instances, records state and effect events, drives the DOM element inspector, and intercepts browser `fetch` calls for inspection and mocking. The Vite plugin serves this bundle at `/__svelte-devtools/svelte-runtime.js`; applications install `@fsodano/vite-plugin-svelte-devtools` rather than importing this package directly.

## Public entry points and browser globals

- `@fsodano/svelte-devtools-runtime` (`dist/index.js`, `dist/index.d.ts`) — exports `runtime` and installs the browser globals when loaded in a document.
- `window.__SVELTE_DEVTOOLS_RUNTIME__` — internal runtime object called by code injected at build time (`registerComponent`, `unregisterComponent`, `handleState`, `handleEffect`, `_registerState`, `setComponentState`, `refresh`). Calls that fire before the runtime module finishes loading are queued in `window.__SVELTE_DEVTOOLS_QUEUE__` and drained in order on startup.
- `window.__SVELTE_DEVTOOLS_REGISTRY__` — `Map` of per-instance metadata (`id`, `parentId`, `name`, `filename`, `propKeys`) populated by the build transform.
- `window.__SVELTE_DEVTOOLS__` — public inspection API used by the DevTools panel (`getComponentTree`, `getAllComponents`, `getComponentById`, `getWritableStateKeys`, `editComponentState`, `getTimeline`, `subscribe`, `enableInspector`, `disableInspector`).

## Build and test

The runtime builds with TypeScript and Rolldown (`tsc && rolldown -c`). Run these commands from the repository root:

```bash
npm run build:runtime
npx vitest run tests/runtime/
```

See [runtime architecture](https://github.com/fsodano/svelte-devtools/blob/main/docs/03_runtime.md), [API reference](https://github.com/fsodano/svelte-devtools/blob/main/docs/06_api.md), and the [developer guide](https://github.com/fsodano/svelte-devtools/blob/main/docs/INDEX.md).

## Get started in an application

To use Svelte DevTools in a Svelte 5.20+ and Vite 8 application, install the [Vite plugin](https://www.npmjs.com/package/@fsodano/vite-plugin-svelte-devtools) and the tested Vite DevTools host:

```bash
npm install -D @fsodano/vite-plugin-svelte-devtools@0.4.0 @vitejs/devtools@0.4.8
npx svelte-devtools init
```

Follow the [configuration guide](https://github.com/fsodano/svelte-devtools#try-it-locally). SvelteKit applications also use a development-only server handle hook. Use Node.js 22.12+ or newer; the documented workflow and CI use Node.js 24.

Independent community project. Early development; APIs may change. [MIT licensed](https://github.com/fsodano/svelte-devtools/blob/main/LICENSE).
