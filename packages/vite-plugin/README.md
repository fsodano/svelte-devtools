# Svelte DevTools

**See what your Svelte app is doing. Give your agent the same view.**

Inspect live component instances, edit state, replay snapshots, and follow requests into SQLite. Svelte DevTools runs in the Vite DevTools dock during development, with no browser extension to install.

![Svelte DevTools component inspection](https://raw.githubusercontent.com/fsodano/svelte-devtools/main/docs/media/components.png)

- Inspect individual component instances, props, state, and parent relationships. Open the selected source in your editor.
- Edit writable JSON state and undo or redo recorded changes.
- Create browser fetch mock rules from captured requests.
- Follow SvelteKit request, fetch, and explicit SQLite spans with measured durations and parent relationships.
- Connect an agent through nine MCP tools, including acknowledged state edits in a selected live session.
- Resize detail panes and choose theme, text size, and motion settings.

Independent community project. Early development; APIs may change. Requires Svelte 5.20+, Vite 8, and a supported Node.js release. Use Node.js 22.12+ for the documented workflow. The tested Vite DevTools host is 0.4.8; Chromium is the tested browser.

## Install

For an existing Vite + Svelte project:

```bash
npm install -D @fsodano/vite-plugin-svelte-devtools@0.2.1 @vitejs/devtools@0.4.8
```

The project also needs its normal Svelte compiler integration. For plain Vite, use `@sveltejs/vite-plugin-svelte@^7` with Svelte 5 and Vite 8. SvelteKit projects use their existing `sveltekit()` integration.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { DevTools } from '@vitejs/devtools';
import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools';

export default defineConfig({
  plugins: [DevTools(), svelte(), svelteDevTools()]
});
```

Start the application, open the Vite dock, enter the terminal's six-digit devframe authorization code, and select **Svelte**.

## SvelteKit

Replace `svelte()` with `sveltekit()` imported from `@sveltejs/kit/vite`. Add the development hook:

```ts
// src/hooks.server.ts
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

If you already have a handle, compose it with SvelteKit's `sequence` helper. Keep the development guard. See [server integration](https://github.com/fsodano/svelte-devtools/blob/main/docs/05_server.md).

## Connect an agent

Start your app with a local API token:

```bash
export SVELTE_DEVTOOLS_TOKEN=replace-with-your-local-token
npm run dev
```

Keep the authorized Svelte panel open. Configure an MCP-compatible client with the same token and the actual app URL:

```json
{
  "mcpServers": {
    "svelte-devtools": {
      "command": "npx",
      "args": ["-y", "@fsodano/svelte-devtools-mcp@0.2.1"],
      "env": {
        "SVELTE_DEVTOOLS_URL": "http://localhost:5173",
        "SVELTE_DEVTOOLS_TOKEN": "replace-with-your-local-token"
      }
    }
  }
}
```

Ask your agent to call `svelte_status`, select a live session, discover component IDs with `svelte_components`, and inspect the target instance before editing it with `svelte_set_state`. The other tools expose timeline events, snapshot metadata, routes, migration analysis, source, and server events.

Runtime reads reject missing or stale caches. State edits require a specific live session and acknowledge the actual setter. If an edit reports `OUTCOME_UNKNOWN`, inspect before retrying. The API token is separate from dock authorization. Do not commit real tokens. See [MCP setup and limits](https://github.com/fsodano/svelte-devtools/blob/main/docs/07_mcp.md).

## Trace a SQLite operation

Wrap an actual synchronous call in server code:

```ts
import { dev } from '$app/environment';
import { traceSqliteQuery } from '@fsodano/vite-plugin-svelte-devtools/sqlite';

const statement = db.prepare('SELECT * FROM todos WHERE id = @id');
const todo = traceSqliteQuery({
  enabled: dev,
  database: 'todos',
  operation: 'get',
  statement: statement.source,
  captureStatement: true
}, () => statement.get({ id }));
```

Inspect the resulting span in Network's SQL filter, through HTTP, or with `svelte_server_events`. The native return value or error passes through unchanged. Statement capture is opt-in and limited to 4,096 characters. Bindings and result rows are omitted. Use safe templates: literal SQL can still contain sensitive values.

The wrapper requires an active traced request and measures synchronous execution. It does not automatically trace transactions, lazy iterators, or asynchronous database calls. State time travel does not roll back database writes. Browser fetch mocks do not affect SQL, server fetch, or XMLHttpRequest.

[![Save a Todo and follow the request into SQLite](https://raw.githubusercontent.com/fsodano/svelte-devtools/main/docs/media/todo-save-trace.gif)](https://github.com/fsodano/svelte-devtools/blob/main/docs/media/todo-save-trace.mp4)

*Actual Todo save, SSR POST request, executed INSERT, and measured per-span timings. [Detailed screenshot](https://raw.githubusercontent.com/fsodano/svelte-devtools/main/docs/media/todo-save-trace.png).*

## Examples and contribution

The repository ships [plain Svelte](https://github.com/fsodano/svelte-devtools/tree/main/tests/apps/svelte), [SvelteKit](https://github.com/fsodano/svelte-devtools/tree/main/tests/apps/svelte-kit), a [SQLite todo app](https://github.com/fsodano/svelte-devtools/tree/main/tests/apps/todo-sqlite), and a [Pokédex](https://github.com/fsodano/svelte-devtools/tree/main/tests/apps/pokedex).

See the [project README](https://github.com/fsodano/svelte-devtools), [developer guide](https://github.com/fsodano/svelte-devtools/blob/main/docs/INDEX.md), and [agent workflows](https://github.com/fsodano/svelte-devtools/tree/main/skills). The panel is served from built assets; contributors must rebuild it after source edits.

[MIT licensed](https://github.com/fsodano/svelte-devtools/blob/main/LICENSE).
