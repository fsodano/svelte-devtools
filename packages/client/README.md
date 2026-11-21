# Svelte DevTools — Developer panel

**Inspect your running Svelte application in the Vite DevTools dock.**

`@fsodano/svelte-devtools-client` (`0.4.0`) is the Svelte 5 runes UI panel in the Svelte DevTools pipeline (`.svelte file -> vite-plugin $inspect injection -> browser runtime -> postMessage -> client panel -> HTTP API`). It receives events from the browser runtime over `postMessage`, provides ten debugging tabs (Info, Components, Events, Time Travel, Graph, Network, Router, Assets, Migrate, and Settings), executes acknowledged state edits, and syncs cached runtime state every 2 seconds to the Vite plugin's authenticated HTTP API at `/__svelte-devtools/api/sync`.

## Serving and entry points

The panel is a prebuilt Vite application (`dist/index.html` and static assets with base path `/__svelte-devtools/`). The Vite plugin serves `packages/client/dist/` statically inside the Vite DevTools dock iframe (`/__svelte-devtools/`) and injects the per-run `window.__SVELTE_DEVTOOLS_TOKEN__` into `index.html`.

**If you edit `packages/client/src/`, you must rebuild the client and restart the example dev server.** The application dev server does not compile panel source on demand.

## Build and test

Run these commands from the repository root:

```bash
npm run build:client
npx vitest run tests/client/
```

See [client UI architecture](https://github.com/fsodano/svelte-devtools/blob/main/docs/04_client.md), [design guidelines](https://github.com/fsodano/svelte-devtools/blob/main/docs/design-guidelines.md), and the [developer guide](https://github.com/fsodano/svelte-devtools/blob/main/docs/INDEX.md).

## Get started in an application

Applications do not install `@fsodano/svelte-devtools-client` directly; it is bundled as a dependency of the [Vite plugin](https://www.npmjs.com/package/@fsodano/vite-plugin-svelte-devtools):

```bash
npm install -D @fsodano/vite-plugin-svelte-devtools@0.4.0 @vitejs/devtools@0.4.8
npx svelte-devtools init
```

Follow the [configuration guide](https://github.com/fsodano/svelte-devtools#try-it-locally). Runtime inspection requires an open, authorized panel in Chromium. Browser fetch mocks do not intercept server `fetch` or `XMLHttpRequest`, and state time travel does not roll back database writes.

Independent community project. Early development; APIs may change. [MIT licensed](https://github.com/fsodano/svelte-devtools/blob/main/LICENSE).
