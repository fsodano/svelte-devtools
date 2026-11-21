# Server integration

Svelte DevTools records server-side SvelteKit requests, server `fetch` calls, and opt-in synchronous SQLite queries during development. You can inspect these correlated events in the Network panel, through the token-authenticated HTTP API (`/api/server-events`), or with the `svelte_server_events` MCP tool.

All server tracing code lives in `@fsodano/vite-plugin-svelte-devtools` (`packages/vite-plugin`). There is no separate server package.

## Enable SvelteKit request tracing

SvelteKit renders HTML on the server and does not run Vite's `transformIndexHtml` hook. To inject the DevTools browser scripts and record server-side requests, export `svelteDevToolsHandle()` from `src/hooks.server.ts` during development and `noopHandle()` in production:

```ts
// Current fixture pattern (tests/apps/svelte-kit/src/hooks.server.ts)
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

- `svelteDevToolsHandle()`: returns a SvelteKit `Handle` function (`({ event, resolve }) => Promise<Response>`). When called, it installs the global server `fetch` interceptor, wraps `event.fetch`, injects the DevTools script tags into HTML responses via `transformPageChunk`, and records a root trace span for each eligible request.
- `noopHandle()`: returns a pass-through `Handle` function (`({ event, resolve }) => resolve(event)`) with zero tracing overhead and no script injection.
- `dev`: SvelteKit's `$app/environment` boolean. If `dev` is `false`, selecting `noopHandle()` avoids installing `fetch` interception or injecting development scripts into production responses.

### Compose with an existing handle

If your application already defines a `handle` hook in `src/hooks.server.ts`, combine it with SvelteKit's `sequence` helper so `svelteDevToolsHandle()` runs outermost during development:

```ts
// Illustrative composition with an existing SvelteKit handle
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

const appHandle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};

export const handle: Handle = sequence(
  dev ? svelteDevToolsHandle() : noopHandle(),
  appHandle
);
```

Placing the DevTools handle first ensures that downstream handlers and `load` functions inherit the active request trace context.

### What the development handle does

When `svelteDevToolsHandle()` resolves an incoming SvelteKit request:

1. **Marks the request as SvelteKit-handled**: The outer Vite dev-server middleware creates a root trace context for every non-asset request. When the SvelteKit handle runs, it sets `handledByKit = true` on that context so the outer Vite middleware does not emit a duplicate root span when the response finishes.
2. **Injects DevTools scripts once per HTML page**: Using SvelteKit's `transformPageChunk` hook, the handle inserts three `<script type="module">` tags before `</head>` (or before `</body>` / `</html>` if `</head>` was not present):
   - `/@fs<path>/dist/client/inject.js` (when `@vitejs/devtools` is installed in the project root)
   - `/@svelte-devtools-navigation-bridge` (exposes SvelteKit's real `goto` function on `window.__SVELTE_DEVTOOLS_REAL_GOTO__` for cross-route time travel without intercepting application imports; see [ADR-0012](adr/ADR-0012-stop-stubbing-app-navigation.md))
   - `/__svelte-devtools/svelte-runtime.js` (the browser instrumentation runtime)
   The chunk transformer holds at most a 6-character prefix when a chunk ends with a partial `</head>` tag. It never buffers the entire HTML response, so streamed SvelteKit responses continue to stream immediately.
3. **Traces `event.fetch` and global `fetch`**: The handle wraps `event.fetch` and `globalThis.fetch` so outbound requests and internal in-process SvelteKit data fetches create child spans linked to the current request.
4. **Captures bounded previews asynchronously**: Request and response bodies are cloned and read on a background branch with a 250 ms collection deadline. Neither uploads nor streamed responses wait for preview capture to finish.

Requests to `/__svelte-devtools/*`, `/.devtools/*`, and static asset extensions (`.svelte`, `.js`, `.ts`, `.css`, `.ico`, `.svg`, `.png`, `.woff`, `.woff2`) are skipped and do not emit trace spans.

## Request-scoped trace identity

Every traced server request receives a root `traceId` and `spanId` (UUID v4 strings) stored in a Node.js `AsyncLocalStorage` context ([ADR-0018](adr/ADR-0018-request-scoped-server-traces.md)).

- **Module-instance sharing**: Vite can load plugin code and SSR server modules in separate module instances. The trace store is shared through `Symbol.for('svelte-devtools.trace-context.v1')` on `globalThis` so `svelteDevToolsHandle()`, `globalThis.fetch`, and `traceSqliteQuery()` read the same active request context.
- **Child spans**: When code inside a request calls `fetch`, `event.fetch`, or `traceSqliteQuery()`, the child span inherits the request's `traceId`, generates a new `spanId`, and records the calling span's ID in `parentSpanId`.
- **In-process `event.fetch`**: If a SvelteKit `load` function calls `event.fetch('/api/items')` and SvelteKit dispatches that request to another server route in-process, the inner route run detects `fetchInProgress` on the inherited context, generates a fresh `spanId`, and records the outer span in `parentSpanId`.
- **Concurrent request isolation**: Identity comes strictly from `AsyncLocalStorage`, never from URL matching or timing windows. Two concurrent requests to the same route receive distinct `traceId` values, and each request's child fetches and SQL queries remain attached to their own root span.
- **Per-server buffer and cleanup**: Each `ViteDevServer` instance owns an isolated in-memory ring buffer of up to 1,000 server events (`packages/vite-plugin/src/server-events.ts`). Global `fetch` interception is reference-counted per running dev server and restored when the last server closes.

## Observe a synchronous SQLite query

To correlate SQLite queries with the HTTP request that triggered them, wrap each synchronous query call with `traceSqliteQuery` from `@fsodano/vite-plugin-svelte-devtools/sqlite` ([ADR-0019](adr/ADR-0019-explicit-synchronous-sqlite-observation.md)):

```ts
// Current fixture pattern (tests/apps/todo-sqlite/src/lib/db.js)
import { dev } from '$app/environment';
import { traceSqliteQuery } from '@fsodano/vite-plugin-svelte-devtools/sqlite';
import Database from 'better-sqlite3';

const db = new Database('data/todos.db');
const getStmt = db.prepare('SELECT * FROM todos WHERE id = @id');

export function getTodo(id: number) {
  return traceSqliteQuery(
    {
      enabled: dev,
      database: 'todos',
      operation: 'get',
      statement: getStmt.source,
      captureStatement: true,
    },
    () => getStmt.get({ id })
  );
}
```

### `SqliteTraceOptions` fields

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | `boolean` | Yes | Pass your framework development flag (`dev`). If `enabled` is `false`, `traceSqliteQuery` calls the callback immediately and emits nothing. |
| `database` | `string` | Yes | Logical database label (truncated to 128 characters). Use a short name such as `'todos'`, not a filesystem path. |
| `operation` | `'get' \| 'all' \| 'run' \| 'exec' \| 'pragma'` | Yes | Execution method label recorded on the span. This label also determines how `rowCount` is read from the return value. |
| `statement` | `string` | No | Prepared SQL template string (such as `statement.source`). Never pass expanded query strings that contain bound user values. |
| `captureStatement` | `boolean` | No | Defaults to `false`. Set to `true` to include `statement` (up to 4,096 characters) in the emitted `server:sql` span. |

### Execution and safety rules

- **Native return values and exceptions**: `traceSqliteQuery(options, execute)` does not wrap or proxy the database client or statement object. It measures `execute()` with `performance.now()`, emits a `server:sql` event in a `try / catch` block that ignores telemetry errors, and returns the callback's exact result or rethrows its exact exception.
- **Active request context required**: If `traceSqliteQuery` runs outside an active request trace context (for example, during top-level module initialization when creating tables), `getTraceContext()` returns `undefined` and `traceSqliteQuery` executes the callback without emitting an event.
- **Privacy and bounding**:
  - Statement text is omitted unless `captureStatement: true` and a string `statement` are both provided. When captured, statements are truncated to 4,096 characters and `statementTruncated: true` is set if the template exceeded 4,096 characters.
  - Bound parameters and result rows are never collected. Even with bindings omitted, literal values written directly into a SQL string can appear in captured templates—pass only prepared statement templates.
  - When `execute()` throws, the span records `status: 'error'` and extracts only an uppercase SQLite error code matching `/^SQLITE_[A-Z0-9_]+$/` (up to 128 characters, such as `SQLITE_CONSTRAINT_UNIQUE`), or falls back to `'SQLITE_QUERY_FAILED'`. Raw `error.message` strings are omitted because SQLite error messages can echo SQL literals or bound values.
- **Row count derivation**: When a query succeeds, `rowCount` is derived without invoking property getters:
  - `operation: 'all'`: own `length` data property of a returned array.
  - `operation: 'get'`: `0` when the return value is `undefined`, otherwise `1`.
  - `operation: 'run'`: own numeric `changes` data property on a returned object.
  - `operation: 'exec'` or `'pragma'`: `rowCount` is omitted (`undefined`).
  The `operation` label always reflects the wrapper option you passed: an `INSERT ... RETURNING *` statement executed with `stmt.get()` and `operation: 'get'` records `operation: 'get'` and `rowCount: 1`.
- **Scope limits**: `traceSqliteQuery` measures one synchronous callback. It does not trace asynchronous database drivers, lazy iterators (`stmt.iterate()`), or implicit transaction boundaries (`BEGIN` / `COMMIT`). A `server:sql` span with `status: 'success'` means that individual synchronous call returned without throwing; it does not prove that an enclosing transaction later committed. Time Travel restores client component state in the browser and never rolls back SQLite writes.

## Server event contract

All server trace events share the outer envelope `{ id, type, timestamp, duration, data }`:

- `id`: string span ID (`spanId`).
- `type`: `'server:ssr'` (root HTTP request with status `< 400`), `'server:request'` (outbound or internal `fetch` call that resolved), `'server:error'` (root HTTP request with status `>= 400`, thrown handler error, aborted response, or thrown `fetch` error), or `'server:sql'` (synchronous SQLite span).
- `timestamp`: epoch milliseconds (`Date.now()`) when the operation started.
- `duration`: elapsed milliseconds measured with `performance.now()`. For HTTP requests, `duration` measures time until `resolve(event)` or `fetch()` settles, not the full lifetime of a streamed response body.

### HTTP and SSR span `data` fields (`server:ssr`, `server:request`, `server:error`)

| Field | Type | Description |
|-------|------|-------------|
| `traceId` | `string` | Request trace UUID shared by all spans in the request. |
| `spanId` | `string` | Unique UUID for this span (matches outer `event.id`). |
| `parentSpanId` | `string \| undefined` | Calling span's `spanId` for child `fetch` calls and in-process `event.fetch` sub-requests; `undefined` on root requests. |
| `routeId` | `string \| null \| undefined` | SvelteKit route ID (for example `'/todos/[id]'`) when handled by SvelteKit. |
| `url` | `string` | Request pathname and query string (or full URL for outbound `fetch`). |
| `method` | `string` | HTTP method (`GET`, `POST`, etc.). |
| `statusCode` | `number \| undefined` | HTTP response status code (`0` on network failure in `fetch`). |
| `_handler` | `'sveltekit' \| 'fetch-interceptor' \| 'generic'` | Producer that recorded the span. |
| `contentType` | `string` | Response `content-type` header value. |
| `requestBody` | `string \| undefined` | UTF-8 request body preview (up to 2,000 bytes). Non-string `RequestInit.body` values record `'(stream or binary body)'`. |
| `requestBodyTruncated` | `boolean \| undefined` | `true` if the request preview exceeded 2,000 bytes, timed out after 250 ms, or was a non-string stream/binary payload. |
| `responsePreview` | `string` | UTF-8 response body preview. Limited to 2,000 bytes when `content-type` contains `'json'`, or 500 bytes for HTML and other content types, with a 250 ms read deadline. |
| `responseBodyTruncated` | `boolean` | `true` if the response body exceeded the preview byte limit or the 250 ms read deadline. |
| `responseSize` | `number \| undefined` | Exact response byte count when known and not truncated (`undefined` on truncated SvelteKit/fetch clone streams). |
| `reqHeaders` | `Record<string, unknown>` | Request headers. On generic Vite middleware spans, only `content-type`, `accept`, and `cookie: '[present]'` are kept. On SvelteKit and `fetch` spans, headers are copied from the `Headers` object without automatic redaction. |
| `resHeaders` | `Record<string, unknown>` | Response headers. |
| `error` | `{ message: string } \| undefined` | Present on thrown handler or `fetch` errors (`message` truncated to 2,000 characters). |

### SQLite span `data` fields (`server:sql`)

| Field | Type | Description |
|-------|------|-------------|
| `traceId` | `string` | Request trace UUID inherited from the active HTTP request. |
| `spanId` | `string` | Unique UUID for this SQL span. |
| `parentSpanId` | `string` | `spanId` of the enclosing request or `fetch` span that invoked `traceSqliteQuery`. |
| `routeId` | `string \| null \| undefined` | SvelteKit route ID inherited from the active request context. |
| `database` | `string` | Logical database label (up to 128 characters). |
| `operation` | `'get' \| 'all' \| 'run' \| 'exec' \| 'pragma'` | Configured SQLite execution method. |
| `statement` | `string \| undefined` | Prepared SQL template (up to 4,096 characters) when `captureStatement: true`; otherwise `undefined`. |
| `statementTruncated` | `boolean` | `true` when `statement` was longer than 4,096 characters. |
| `rowCount` | `number \| undefined` | Returned row count (`all`, `get`) or `changes` count (`run`) when available. |
| `status` | `'success' \| 'error'` | Execution outcome. |
| `error` | `string \| undefined` | Safe SQLite error code (`/^SQLITE_[A-Z0-9_]+$/` or `'SQLITE_QUERY_FAILED'`) when `status === 'error'`. |

## Inspect server traces in the Network panel, HTTP API, or MCP

### Network panel (`NetworkDesk.svelte`)

There is no separate Server tab. The **Network** tab in the DevTools panel polls `GET /__svelte-devtools/api/server-events` every 1,000 ms and merges server spans with browser `client:request` events:

- **Filters**: Switch between **All**, **SSR** (`server:ssr` and `server:request`), **SQL** (`server:sql`), **Errors** (`server:error`, SQL `status === 'error'`, or HTTP status `>= 400` / `0`), **Client** (`client:request`), and **Mocked**.
- **Trace waterfall**: Click any server or SQL row to open the **Server trace details** pane (`ServerTraceDetail.svelte`). It displays the `traceId`, `spanId`, `parentSpanId`, SQL template or HTTP previews, and an interactive waterfall of all retained spans sharing that `traceId`. Click any span in the waterfall to jump to it.
- **Window retention**: The server buffer holds the newest 1,000 server events, and the Network panel retains up to 500 combined browser and server rows (`NetworkHistory(500, 1000)`). If a root span ages out of the retained window while a child span remains, the waterfall marks the child with `Parent not retained in this buffer` instead of fabricating a parent link. Clicking **Clear** in the Network panel dismisses currently visible rows without deleting the server buffer or replaying dismissed IDs on the next poll.
- **Client-only mocking**: The **Mock this request** button and **Mock Rules** editor appear only for browser `client:request` rows. Browser mock rules intercept `window.fetch` in the client runtime; they never intercept SSR `fetch`, `XMLHttpRequest`, or SQLite queries.

### Authenticated HTTP API and MCP

Server events are recorded directly by the Vite dev server and do not require an open browser panel. Query them with the per-run bearer token (`SVELTE_DEVTOOLS_TOKEN`; see [API Reference](06_api.md) and [Agent access with MCP](07_mcp.md)):

```bash
export SVELTE_DEVTOOLS_TOKEN=your-local-token

# Read the newest 100 server and SQL spans
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  'http://localhost:5175/__svelte-devtools/api/server-events?last=100'

# Clear the dev server's event buffer
curl -X DELETE -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  'http://localhost:5175/__svelte-devtools/api/server-events'
```

- `GET /__svelte-devtools/api/server-events` accepts optional `last` (positive integer) and `sinceId` (returns events recorded after the matching event `id`) query parameters and returns `{ ok: true, events: [...] }`.
- `DELETE /__svelte-devtools/api/server-events` empties the server event buffer and returns `{ ok: true }`.
- Legacy `GET /__svelte-devtools/server-events` requires the same bearer token and returns the raw `ServerEvent[]` array instead of `{ ok, events }`.
- In MCP, call `svelte_server_events` with `{ "last": 100 }` (range `1`–`500`) and optional `sinceId`. The returned event `id`, `traceId`, `spanId`, and `parentSpanId` values match the HTTP API and Network panel.

## Verify against the sample applications

To run the automated end-to-end SSR and SQLite verification suite from the repository root:

```bash
npm run build
npm ci --prefix tests/apps/svelte-kit
npm ci --prefix tests/apps/todo-sqlite
npx playwright install chromium
node scripts/verify-ssr-sql.mjs
```

`scripts/verify-ssr-sql.mjs` starts isolated Vite dev servers on ports `5183` (`tests/apps/svelte-kit`) and `5184` (`tests/apps/todo-sqlite` with `TODO_SQLITE_DB_PATH` pointed at a temporary directory). It does not touch your local `tests/apps/todo-sqlite/data/todos.db` file. The script verifies:

1. Initial SSR HTML and streamed responses with JavaScript disabled, confirming each DevTools script is injected once.
2. Client hydration and navigation without page errors.
3. Redirect (`307`), error (`418`), `__data.json`, large upload body, and Server-Sent Events (SSE) stream preservation.
4. Concurrent same-route SSR requests producing distinct `traceId` values with correlated child fetch spans.
5. Native form and hydrated CRUD operations in the [Todo + SQLite fixture](../tests/apps/todo-sqlite/README.md), emitting `SELECT`, `INSERT`, `UPDATE`, and `DELETE` `server:sql` spans with valid parent spans and zero leaked parameter bindings.
6. Parity across the authenticated HTTP API, the `svelte_server_events` MCP tool over stdio, and the Network panel's trace waterfall.
