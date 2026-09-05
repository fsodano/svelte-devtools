# Pokédex fixture

Use this app to inspect repeated components in a realistic interface. It exercises 20 cards per page, parent relationships, asynchronous data, search, filtering, pagination, and request mocking. It uses Svelte 5, Vite 8.2.2, and `@vitejs/devtools` 0.4.8.

## Run locally

Use Node.js 22.12 or later. Run these commands from the repository root:

```sh
npm ci
npm run build
npm ci --prefix tests/apps/pokedex
export SVELTE_DEVTOOLS_TOKEN=local-devtools-token
npm run dev --prefix tests/apps/pokedex -- --port 5176 --strictPort
```

Open [localhost:5176](http://localhost:5176/). The explicit port overrides the package script's 5174 default so this app can run beside the SvelteKit fixture. Do not start a second server if this port is already in use.

The app depends on the public PokeAPI for Pokémon names, types, and details, and on remote artwork images. It requires network access but no API key or database setup. The page load fetches types; browser requests fetch the list and details. Request failures can therefore affect different parts of the page.

The plugin is a local `file:` dependency. Build the root packages before starting the fixture; the extension does not need to be installed from npm.

## Inspect the app

Click **Unauthorized** in the dock, enter the terminal's six-digit `devframe auth code`, and open **Svelte**. The code authorizes the dock; HTTP and MCP clients use the separate `SVELTE_DEVTOOLS_TOKEN`.

- In Components, check that each `PokemonCard` has a distinct instance. Use the inspector to select different visible cards.
- In Graph, check the `+layout` → `+page` → `PokemonCard` relationships.
- Search by name or ID, filter by type, change pages, or open a card's details to generate state changes and requests.
- In Network, select a browser request and use **Mock this request** to prepare a rule. Review and enable the rule, then repeat the interaction. Rules intercept future requests; they do not replace data already loaded.
- In Components → Source, use **Open … in editor**. The editor runs on the dev-server machine. Set `LAUNCH_EDITOR` before starting Vite if you need to choose it explicitly.

With the panel open, use another terminal:

```sh
export SVELTE_DEVTOOLS_TOKEN=local-devtools-token
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  'http://localhost:5176/__svelte-devtools/api/components?name=PokemonCard&includeState=false'
```

The API returns cached panel data. Inspect `cachedAt` as well as the component count.

## Development checks

```sh
npm run check --prefix tests/apps/pokedex
npm run build --prefix tests/apps/pokedex
```

The fixture uses `adapter-static` with an `index.html` fallback. A production preview excludes DevTools; use the development server for extension testing.

After extension source changes, run root `npm run build` and restart the fixture. The DevTools panel serves `packages/client/dist`, so a browser refresh alone does not apply client changes.

See the [developer guide](../../../docs/INDEX.md) for the shared workflow.
