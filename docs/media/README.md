# Product recordings

These images, silent videos, and capture metadata files show the included plain Svelte and Todo + SQLite fixtures running with the real Svelte DevTools panel. The recording scripts make actual MCP tool calls, form submissions, and browser fetches, and assert application state and server traces before writing the output files. No product UI is generated or composited.

## Artifact inventory

| File | Source script | Fixture & port | What it shows |
|---|---|---|---|
| [`components.png`](./components.png) | `scripts/record-readme-demo.mjs` | `tests/apps/svelte` (`5182`) | The **Components** tab inspecting two mounted `StateEditInstance` components and their writable state |
| [`agent-state-edit.mp4`](./agent-state-edit.mp4) | `scripts/record-readme-demo.mjs` | `tests/apps/svelte` (`5182`) | 12-second H.264 MP4 of an MCP `svelte_set_state` edit (`count` `1 -> 7` on the first instance) followed by panel **Undo** (`1 / 2`) and **Redo** (`2 / 2`) |
| [`agent-state-edit.gif`](./agent-state-edit.gif) | `scripts/record-readme-demo.mjs` | `tests/apps/svelte` (`5182`) | Animated GIF preview generated from `agent-state-edit.mp4` |
| [`network-mocking.mp4`](./network-mocking.mp4) | `scripts/record-readme-demo.mjs` | `tests/apps/svelte` (`5182`) | 11-second H.264 MP4 of capturing `/test-mock-resource.json` (`200`), creating and enabling a `201` mock rule (`{"mocked":true}`), verifying the mocked fetch, and disabling the rule (`200`) |
| [`network-mocking.png`](./network-mocking.png) | `scripts/record-readme-demo.mjs` | `tests/apps/svelte` (`5182`) | Screenshot of the mocked request selected in the **Network** tab |
| [`capture.json`](./capture.json) | `scripts/record-readme-demo.mjs` | `tests/apps/svelte` (`5182`) | Metadata recording the fixture path, clip timestamps, MCP tool flow (`svelte_status`, `svelte_components`, `svelte_set_state`), verified assertions, and panel crop geometry |
| [`todo-save-trace.mp4`](./todo-save-trace.mp4) | `scripts/record-sql-demo.mjs` | `tests/apps/todo-sqlite` (`5192`) | 9-second H.264 MP4 of creating a Todo item, opening the SSR `POST /?/create` request in **Network**, and inspecting its child `INSERT INTO todos` SQLite span and measured durations |
| [`todo-save-trace.gif`](./todo-save-trace.gif) | `scripts/record-sql-demo.mjs` | `tests/apps/todo-sqlite` (`5192`) | Animated GIF preview generated from `todo-save-trace.mp4` |
| [`todo-save-trace.png`](./todo-save-trace.png) | `scripts/record-sql-demo.mjs` | `tests/apps/todo-sqlite` (`5192`) | Detailed screenshot of the SSR `POST /?/create` trace waterfall and `INSERT INTO todos` SQLite span details |
| [`todo-save-capture.json`](./todo-save-capture.json) | `scripts/record-sql-demo.mjs` | `tests/apps/todo-sqlite` (`5192`) | Metadata recording clip timing, verified assertions, and the correlated `server:ssr` and `server:sql` span IDs, durations, and SQL template (without tokens or bound values) |
| [`sql-traces.png`](./sql-traces.png) | `scripts/verify-ssr-sql.mjs` | `tests/apps/todo-sqlite` (`5184`) | Screenshot of the **Network** tab's **SQL** filter showing synchronous SQLite query spans after native and enhanced CRUD operations |

## Agent state edit (`agent-state-edit.mp4`, `agent-state-edit.gif`, `components.png`)

[Watch the 12-second MP4](./agent-state-edit.mp4), view the [animated preview](./agent-state-edit.gif), or inspect the [Components screenshot](./components.png).

1. Open `/state-edit.html` and select the first of two `StateEditInstance` components (`components.png` is captured here). Its `count` is `1`.
2. The MCP client calls `svelte_status` and `svelte_components` to discover the active panel session and mounted instance ID, then calls `svelte_set_state` to set `count` to `7`.
3. The first instance updates to `7`. The sibling instance remains at `1`.
4. **Time Travel** shows the baseline and edited state: `2 / 2` snapshots.
5. **Undo** restores `count` to `1` and selects snapshot `1 / 2`. **Redo** restores `count` to `7` and selects `2 / 2`.
6. Return to the **Components** tab to view the component's current state.

The API token and dock authorization screens are excluded from the published clip (`authenticationExcluded: true` in [`capture.json`](./capture.json)).

## Request-to-mock workflow (`network-mocking.mp4`, `network-mocking.png`)

[Watch the 11-second MP4](./network-mocking.mp4) or view the [Network screenshot](./network-mocking.png).

1. Fetch `/test-mock-resource.json?readme-demo` and inspect its real HTTP `200` response (`{"mocked":false}`).
2. Click **Mock this request**. The draft pre-fills the request URL and `GET` method.
3. Change the response status to `201` and the response body to `{"mocked":true}`, then click **Enable mock rule**.
4. Repeat the browser fetch and inspect the mocked HTTP `201` response (`network-mocking.png` is captured here).
5. Open **Mock Rules** and disable the rule. The next fetch returns the original HTTP `200` response again.

### Reproduce the plain Svelte recordings

From the repository root, build all workspace packages and install `tests/apps/svelte`. Install Playwright Chromium and ensure `ffmpeg` is available on your `PATH`:

```bash
npm ci
npm run build
npm ci --prefix tests/apps/svelte
npx playwright install chromium
node scripts/record-readme-demo.mjs
```

`scripts/record-readme-demo.mjs` starts its own Vite server on port `5182` (`--strictPort`) with a temporary random `SVELTE_DEVTOOLS_TOKEN` and records raw video in `/tmp/svelte-readme-recording`. It stops its server on exit and writes `components.png`, `agent-state-edit.mp4`, `agent-state-edit.gif`, `network-mocking.mp4`, `network-mocking.png`, and [`capture.json`](./capture.json) in `docs/media/`.

## Save a Todo and inspect each span (`todo-save-trace.mp4`, `todo-save-trace.gif`, `todo-save-trace.png`)

[Watch the 9-second MP4](./todo-save-trace.mp4), view the [animated preview](./todo-save-trace.gif), or inspect the [detailed screenshot](./todo-save-trace.png).

1. After dock authorization, type a new Todo title (`Inspect the save request and SQL timings`) and click **Add**.
2. Open the **Network** tab, filter by **SSR**, and select the `POST /?/create` request row.
3. Confirm the **Trace waterfall** displays two correlated spans: the parent `server:ssr` request and its child `server:sql` `get` span (`INSERT INTO todos (title) VALUES (@title) RETURNING *`).
4. Select the SQL span (`Inspect get span`) to view its SQL template, measured durations, and correlation IDs (`todo-save-trace.png` is captured here).

### Reproduce the Todo + SQLite recording

From the repository root, build all workspace packages and install `tests/apps/todo-sqlite`. Playwright Chromium and `ffmpeg` are required:

```bash
npm ci
npm run build
npm ci --prefix tests/apps/todo-sqlite
npx playwright install chromium
node scripts/record-sql-demo.mjs
```

`scripts/record-sql-demo.mjs` starts its own Vite server on port `5192` (`--strictPort`) with a random `SVELTE_DEVTOOLS_TOKEN` and an isolated temporary SQLite database (`TODO_SQLITE_DB_PATH`). It verifies persistence, `parentSpanId` correlation, `SELECT` visibility, and non-negative durations, then writes `todo-save-trace.mp4`, `todo-save-trace.gif`, `todo-save-trace.png`, and [`todo-save-capture.json`](./todo-save-capture.json).

## SQLite trace inspection (`sql-traces.png`)

[`sql-traces.png`](./sql-traces.png) shows actual SQLite calls from `tests/apps/todo-sqlite` in the **Network** tab's **SQL** filter after native and enhanced CRUD operations. The selected statement belongs to the displayed request trace. Durations measure synchronous query execution; bindings and result rows are omitted.

To generate fresh verification screenshots, build the root packages, install both `tests/apps/svelte-kit` and `tests/apps/todo-sqlite`, and run:

```bash
node scripts/verify-ssr-sql.mjs
```

The verifier runs on ports `5183` and `5184` with a temporary database and writes `sql-network.png`, `sql-network-narrow.png`, and `evidence.json` to its reported temporary directory. `sql-traces.png` was selected from a verified run of that script.
