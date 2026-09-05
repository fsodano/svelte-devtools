# SvelteKit fixture

Use this app to test SvelteKit routing, SSR responses, form actions, and Spring time travel. It uses Svelte 5, Vite 8.2.2, and `@vitejs/devtools` 0.4.8.

## Run locally

Use Node.js 22.12 or later. Run these commands from the repository root:

```sh
npm ci
npm run build
npm ci --prefix tests/apps/svelte-kit
export SVELTE_DEVTOOLS_TOKEN=local-devtools-token
npm run dev --prefix tests/apps/svelte-kit -- --port 5174 --strictPort
```

Open [localhost:5174](http://localhost:5174/). The fixture links the local plugin through `file:../../../packages/vite-plugin`; its dependencies are installed separately from the root workspaces.

Click **Unauthorized** in the Vite DevTools dock, enter the terminal's six-digit `devframe auth code`, and open **Svelte**. The dock code and the HTTP/MCP token are separate.

After opening the panel, run this in another terminal:

```sh
export SVELTE_DEVTOOLS_TOKEN=local-devtools-token
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5174/__svelte-devtools/api/components
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5174/__svelte-devtools/api/server-events
```

The component cache requires the open panel. Server events come from the SvelteKit hook in `src/hooks.server.ts`, which uses `svelteDevToolsHandle()` during development and `noopHandle()` for production.

## Routes and checks

| Route | What to exercise |
| --- | --- |
| `/` | Shared layout and header, the animated Spring counter, component hierarchy, and undo/redo |
| `/about` | Route navigation and load behavior |
| `/sverdle` | Form actions and game state |
| `/sverdle/how-to-play` | Nested routes |
| `/navigation-test` | `afterNavigate`, `invalidateAll`, and cancellation through `beforeNavigate` |

For the counter check, open Time Travel and click **Record**. Increment once, then use Undo and Redo after the Spring settles. The expected snapshot counts are **2 / 2**, **1 / 2**, then **2 / 2**. Redo must not create another snapshot.

From the repository root:

```sh
npm run check --prefix tests/apps/svelte-kit
npm run build --prefix tests/apps/svelte-kit
```

The root `npm run test:e2e` starts its own servers on 5173 and 5174. Stop manual servers on those ports first. The suite covers navigation and Spring regressions. The dedicated [time-travel script](../../../scripts/verify-time-travel.mjs) additionally documents its required tmux server setup.

After extension source changes, rebuild with root `npm run build` and restart the fixture. The panel uses prebuilt `packages/client/dist` assets. Production build/preview does not expose DevTools.

See the [developer guide](../../../docs/INDEX.md) for build order and verification details.
