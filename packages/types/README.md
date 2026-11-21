# Svelte DevTools — Shared contracts

**TypeScript contracts and shared value helpers for Svelte DevTools.**

`@fsodano/svelte-devtools-types` (`0.4.0`) sits at the bottom of the Svelte DevTools workspace pipeline (`types -> runtime -> vite-plugin -> client` and `mcp`). It defines the component, runtime event, snapshot, bridge, and plugin interfaces shared across the Vite plugin, browser runtime, client panel, and MCP adapter. Applications normally install `@fsodano/vite-plugin-svelte-devtools`; direct consumers must keep package versions aligned at `0.4.0`.

## Public entry points

- `@fsodano/svelte-devtools-types` (`dist/index.js`, `dist/index.d.ts`) — exports shared TypeScript types (`ComponentMeta`, `ComponentInstance`, `ComponentNode`, `TimelineEntry`, `BridgeMessage`, `SvelteDevToolsAPI`, `SvelteDevToolsPluginOptions`, `AgentResponse`), value helpers `isJsonEditable` (checks whether a live value can be edited safely as JSON) and `toDisplayValue` (converts live values into JSON-safe inspection previews), and re-exports all constants.
- `@fsodano/svelte-devtools-types/constants` (`dist/constants.js`, `dist/constants.d.ts`) — exports `DEVTOOLS_VERSION` (`'0.4.0'`), `EVENT_TYPES`, `RUNE_TYPES`, `RPC_METHODS`, `RPC_TYPES`, `DATA_ATTRIBUTES`, `DOCK_CONFIG`, `COMPONENT_ID_PREFIX` (`'svt-'`), `LIMITS`, and `mapRuntimeEventTypeToBridge`.

## Build and test

Run these commands from the repository root:

```bash
npm run build:types
npx vitest run tests/types/
```

For full workspace build order and API details, see the [developer guide](https://github.com/fsodano/svelte-devtools/blob/main/docs/INDEX.md) and [API reference](https://github.com/fsodano/svelte-devtools/blob/main/docs/06_api.md).

## Get started in an application

To add Svelte DevTools to a Svelte 5.20+ and Vite 8 application, install the [Vite plugin](https://www.npmjs.com/package/@fsodano/vite-plugin-svelte-devtools) and the tested Vite DevTools host:

```bash
npm install -D @fsodano/vite-plugin-svelte-devtools@0.4.0 @vitejs/devtools@0.4.8
npx svelte-devtools init
```

Follow the [configuration guide](https://github.com/fsodano/svelte-devtools#try-it-locally). SvelteKit applications also use a development-only server handle hook. Use Node.js 22.12+ or newer; the documented workflow and CI use Node.js 24.

Independent community project. Early development; APIs may change. [MIT licensed](https://github.com/fsodano/svelte-devtools/blob/main/LICENSE).
