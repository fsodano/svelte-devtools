# Server integration

Inspect SvelteKit requests, server fetches, and explicitly instrumented SQLite queries in Network. The authenticated HTTP API and MCP expose the same server events. All implementation lives in `packages/vite-plugin`; there is no separate server package.

## Enable SvelteKit tracing

```ts
// src/hooks.server.ts
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

If another handle already exists, compose it with SvelteKit's `sequence` helper. Keep the development guard. Importing the module or selecting `noopHandle()` does not install fetch interception.

The development handle injects each DevTools script once into HTML responses, including streamed responses. It measures request resolution and captures bounded previews asynchronously. It does not wait for an SSE stream to close. Generic Vite middleware supplies tracing for other eligible requests.

## Trace identity

Each request receives `traceId` and `spanId` values. An AsyncLocalStorage context carries them through asynchronous work. Server fetches and SQL calls create child spans with `parentSpanId`. Internal SvelteKit `event.fetch` requests retain that parentage. Concurrent requests to the same URL remain separate traces; URLs and timing windows are not used to infer identity.

Each dev server owns its event buffer and tracing lifecycle. The buffer retains the newest 1,000 events. Request context marks Kit-handled requests so the outer middleware does not emit a duplicate root span.

## Observe a SQLite query

Use the server-only `@fsodano/vite-plugin-svelte-devtools/sqlite` export around an actual synchronous call:

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

The database and statement remain native objects. The callback's returned value or thrown error passes through unchanged. Durations use a monotonic clock and measure the callback, not preparation or result rendering. Supported operation labels are `get`, `all`, `run`, `exec`, and `pragma`.

`enabled` is required. When disabled, the wrapper calls the callback directly. Outside an active request context, it emits nothing. Use a logical database name, not a filesystem path.

Statement capture defaults to off. If you enable it, supply a fixed prepared template without expanded values. SQL literals can contain secrets even when bindings are omitted. Captured statements are limited to 4,096 characters; `statementTruncated` identifies a shortened value. Database labels and safe error codes are limited to 128 characters. The wrapper collects neither bindings nor result rows. Errors expose a SQLite code such as `SQLITE_CONSTRAINT_UNIQUE`, or `SQLITE_QUERY_FAILED`; arbitrary error messages are omitted.

`rowCount` is the number of returned rows for `all`, zero or one for `get`, and the native `changes` value for `run`. It is absent when unavailable. Result getters are not invoked to compute it. The operation label describes the method: an `INSERT ... RETURNING` executed with `get` still has operation `get`.

This wrapper does not automatically trace transactions, lazy iterators, asynchronous work, or other database clients. Wrap each synchronous operation you need to observe. Time Travel does not undo database writes.

## Event contract

Events retain the envelope `{ id, type, timestamp, duration, data }`. Timestamps are epoch milliseconds; durations are milliseconds. Server types include `server:ssr`, `server:request`, `server:error`, and `server:sql`.

SQL data contains:

| Field | Meaning |
|---|---|
| `traceId`, `spanId`, `parentSpanId` | Request correlation and direct parent relationship. |
| `routeId` | SvelteKit route when available. |
| `database`, `operation` | Logical database name and execution method. |
| `statement`, `statementTruncated` | Optional bounded template and truncation indicator. |
| `rowCount` | Returned or affected count when available. |
| `status`, `error` | `success` or `error`, with a safe error code on failure. |

HTTP events include URL, method, status, route, headers, and bounded previews. These can contain application data; they are not a general redaction system. Request previews are limited to 2,000 bytes. Kit response previews use 2,000 bytes for JSON and 500 for other content, with a 250 ms collection deadline. A truncated preview is not the full response. Request duration measures resolution, not necessarily the lifetime of a streamed body.

## Inspect in Network or through an agent

Open Network and use the SSR, SQL, or Errors filters. Select a row to inspect its details and trace waterfall. Select another span in that trace to follow the request/query relationship. The panel retains at most 500 combined browser and server rows; a parent can be outside the retained window. There is no separate Server tab.

The panel polls the canonical authenticated API. Clear dismisses visible history without immediately replaying retained rows. Browser mock actions apply only to browser fetches, not SQL or server requests.

```bash
export SVELTE_DEVTOOLS_TOKEN=your-local-token
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  'http://localhost:5175/__svelte-devtools/api/server-events?last=100'
```

`GET /__svelte-devtools/api/server-events` returns an object with `events` and `count`; `DELETE` clears the server buffer. The legacy `/__svelte-devtools/server-events` GET returns an array. Both require the bearer token. `last` and `sinceId` select recent events. The MCP `svelte_server_events` tool accepts `last` from 1 to 500 and an optional `sinceId`. Runtime component caches need an open panel; server events come from observed server requests independently.

## Verify against real applications

```bash
npm run build
npm ci --prefix tests/apps/svelte-kit
npm ci --prefix tests/apps/todo-sqlite
npx playwright install chromium
node scripts/verify-ssr-sql.mjs
```

The script owns ports 5183 and 5184 and creates a temporary SQLite database. It checks SSR, hydration, streaming, navigation, request isolation, Todo CRUD, SQL parentage, HTTP/MCP parity, and the visible trace details. Read its reported evidence before declaring a change verified.

The [Todo fixture](../tests/apps/todo-sqlite/README.md) uses `TODO_SQLITE_DB_PATH` for isolated runs. Production uses the no-op handle and disabled query wrapper. The plugin itself runs only during development. Server mocking and automatic instrumentation of arbitrary database drivers remain outside the current scope.
