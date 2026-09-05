# Todo + SQLite fixture

Use this app to test a SvelteKit CRUD workflow with persistent data. It exercises form actions, enhanced forms, repeated `TodoItem` components, local edit state, filters, and HTTP request traces. It uses Svelte 5, Vite 8.2.2, and `@vitejs/devtools` 0.4.8.

## Run locally

Use Node.js 22.12 or later. Run these commands from the repository root:

```sh
npm ci
npm run build
npm ci --prefix tests/apps/todo-sqlite
export SVELTE_DEVTOOLS_TOKEN=local-devtools-token
npm run dev --prefix tests/apps/todo-sqlite -- --port 5175 --strictPort
```

Open [localhost:5175](http://localhost:5175/). The fixture installs its own dependencies, including the native `better-sqlite3` package. It links the plugin from `../../../packages/vite-plugin`; the root build supplies the extension assets.

No database service, connection string, migration command, or seed command is required. During development, `src/lib/db.js` creates `data/todos.db` and the `todos` table when first imported. A new database starts empty. Add tasks through the app.

The database uses WAL mode. The `.db`, `.db-wal`, and `.db-shm` files are ignored by Git. Tasks persist across app restarts. The current database path is defined in code; there is no `DATABASE_URL` setting.

## Inspect the workflow

Click **Unauthorized** in the dock and enter the terminal's six-digit `devframe auth code`. Then open **Svelte**. This code is separate from the bearer token used by HTTP and MCP clients.

1. Create two tasks and inspect their distinct `TodoItem` instances.
2. Edit a title, toggle completion, and switch between All, Active, and Completed.
3. Watch component state and props as enhanced form actions refresh the page data.
4. Use the authenticated server-events API or the `svelte_server_events` MCP tool to inspect SvelteKit request traces. The Network panel currently has a server-event display gap.

`src/hooks.server.ts` enables request tracing during development. **Individual SQL queries are not currently traced.** The SQLite dependency makes this a database-backed example; it does not add a SQL inspection panel.

Time Travel restores supported client state. It does not roll back SQLite writes or replay database transactions.

After opening the panel, use another terminal:

```sh
export SVELTE_DEVTOOLS_TOKEN=local-devtools-token
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  'http://localhost:5175/__svelte-devtools/api/components?name=TodoItem'
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5175/__svelte-devtools/api/server-events
```

Runtime component data is cached from the panel. Create tasks first; an empty database has no `TodoItem` instances.

## Development checks

`npm run build --prefix tests/apps/todo-sqlite` builds this fixture. It has no package-level `check` script. Use root `npm run check` for the extension and the [developer guide](../../../docs/INDEX.md) for the shared test workflow.

After changing extension source, run root `npm run build` and restart the fixture. The panel serves prebuilt `packages/client/dist` assets. Production builds use `noopHandle()` and do not expose DevTools.
