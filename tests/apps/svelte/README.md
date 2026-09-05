# Plain Svelte fixture

Use this app to test component inspection without SvelteKit or server-side rendering. It uses Svelte 5, Vite 8.2.2, and `@vitejs/devtools` 0.4.8.

## Run locally

Use Node.js 22.12 or later. Run these commands from the repository root:

```sh
npm ci
npm run build
npm ci --prefix tests/apps/svelte
export SVELTE_DEVTOOLS_TOKEN=local-devtools-token
npm run dev --prefix tests/apps/svelte -- --port 5173 --strictPort
```

Open [localhost:5173](http://localhost:5173/). The fixture uses the local plugin through a `file:` dependency. The root build supplies its runtime and panel assets; no published package is required. Fixture dependencies are separate from the root npm workspaces.

Click **Unauthorized** in the Vite DevTools dock and enter the six-digit `devframe auth code` from the terminal. Then open **Svelte**. This code authorizes the dock. `SVELTE_DEVTOOLS_TOKEN` is a separate token for HTTP and MCP access.

After the panel opens, use another terminal with the same token:

```sh
export SVELTE_DEVTOOLS_TOKEN=local-devtools-token
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/components
```

Runtime API data comes from the open panel. A running server alone does not populate the component cache.

## Fixture pages

| URL | What to exercise |
| --- | --- |
| `/` | State, derived values, nested objects, Map/Set previews, destructuring, child props, effects, async updates, and motion |
| `/state-edit.html` | Two instances with independent scalar, object, and array state; read-only functions and derived values; edit and undo |
| `/spring-counter.html` | The actual SvelteKit welcome counter, mounted here to test Spring undo/redo |
| `/motion-unmount.html` | Remove an animated component and continue recording changes in its surviving parent |
| `/stress.html` | Mount, update, and unmount 1,000 components; inspect tree responsiveness and API synchronization |
| `/test-mock-resource.json` | A fixed JSON response for request inspection and mock-rule tests |

Time Travel starts paused. Click **Record** before app interactions. Saving a writable state value from Components also starts recording.

## Rebuild and verify

After changing extension code, run `npm run build` from the repository root and restart this server. The panel serves `packages/client/dist`; refreshing without rebuilding does not apply client source changes.

The root `npm run test:e2e` command starts its own plain Svelte server on 5173 and SvelteKit server on 5174. Stop manual servers on those ports first. `node scripts/verify-stress.mjs` starts and stops a separate server on 5180.

`npm run build --prefix tests/apps/svelte` builds the fixture for production. `npm run preview --prefix tests/apps/svelte -- --port 5183 --strictPort` previews that build. DevTools is a development-only extension and is absent from the production preview.

See the [developer guide](../../../docs/INDEX.md) for the full build and test workflow.
