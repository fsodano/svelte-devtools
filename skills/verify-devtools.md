---
name: verify-svelte-devtools
description: Use when validating Svelte DevTools changes, checking browser authorization, or diagnosing differences between runtime data and the panel.
---

# Verify Svelte DevTools

This reference targets Svelte DevTools release 0.4.0 and the tested `@vitejs/devtools` 0.4.8 host on Vite 8.2.2 and Svelte 5.20+. Start with [source installation](../docs/02_vite-plugin.md#installation).

## Build and run the maintained tests

Run from the repository root (Node.js 22.12+ is the documented minimum workflow; CI tests Node.js 22 and Node.js 24):

```bash
npm ci
npm ci --prefix tests/apps/svelte
npm ci --prefix tests/apps/svelte-kit
npm ci --prefix tests/apps/todo-sqlite
npm run build
npm run check
npx vitest run --maxWorkers=2
npx playwright install chromium
npm run test:e2e
```

Install `tests/apps/todo-sqlite` before running `npx vitest run` so `tests/vite-plugin/sqlite.test.ts` can load the native `better-sqlite3` driver.

The Playwright browser suite (`npm run test:e2e`) starts its own fixture servers on port `5173` (`tests/apps/svelte`, override with `SVELTE_E2E_PORT`) and port `5174` (`tests/apps/svelte-kit`, override with `SVELTE_E2E_KIT_PORT`). Stop manual servers on those ports first. The suite (`tests/e2e/devtools.spec.ts`, `tests/e2e/navigation.spec.ts`, `tests/e2e/panel-workflows.spec.ts`) covers component identity, source opening, live edits, time travel, mocks, settings, resize behavior, navigation, and cleanup.

**Client changes require a rebuild.** The application dev server serves `packages/client/dist/`; it does not compile panel source on demand. Run `npm run build:client` (or `npm run build`) and restart any running fixture server after editing `packages/client/src/`.

For the full release validation gate, run `bash scripts/publish.sh --dry-run`. This builds, checks, runs unit and browser tests, and validates package contents. Do not pass `--publish` unless publishing is explicitly authorized. `npm run release:check` checks existing build artifacts; it does not replace the full gate.

## Sample apps and verification scripts

Always run `npm ci && npm run build` at the repository root before installing or starting a sample app.

| Target | Port | Setup & command from repository root | What it verifies |
|---|---|---|---|
| Plain Svelte (`tests/apps/svelte`) | `5173` | `npm ci --prefix tests/apps/svelte && npm run dev --prefix tests/apps/svelte -- --port 5173 --strictPort` | Counters, state edits, repeated instances, Spring counter, stress page, fetch mocks |
| SvelteKit (`tests/apps/svelte-kit`) | `5174` | `npm ci --prefix tests/apps/svelte-kit && npm run dev --prefix tests/apps/svelte-kit -- --port 5174 --strictPort` | SSR, routes, layout relationships, Spring counter, `/devtools-check` traces |
| Todo + SQLite (`tests/apps/todo-sqlite`) | `5175` | `npm ci --prefix tests/apps/todo-sqlite && npm run dev --prefix tests/apps/todo-sqlite -- --port 5175 --strictPort` | Persistent SQLite CRUD (`data/todos.db`), enhanced forms, correlated `server:sql` spans |
| Pokédex (`tests/apps/pokedex`) | `5176` | `npm ci --prefix tests/apps/pokedex && npm run dev --prefix tests/apps/pokedex -- --port 5176 --strictPort` | 20 repeated `PokemonCard` instances, external fetches, element inspector, mock rules |
| `scripts/verify-time-travel.mjs` | `5174` | Expects the SvelteKit app running as a dev server in tmux session `svelte-kit` on `SVELTE_E2E_KIT_PORT` (default `5174`), for example `tmux new-session -d -s svelte-kit -c tests/apps/svelte-kit "npx vite --port 5174 --strictPort --clearScreen false"`, with `npm ci --prefix tests/apps/svelte-kit` and the panel built first (`npm run build:client`) | Spring counter record (`2 / 2`), undo (`1 / 2` at `0`), redo (`2 / 2` at `1`, no phantom `3 / 3`) |
| `scripts/verify-pokedex.mjs` | `5176` | Requires built Pokédex running on `5176` with `SVELTE_DEVTOOLS_TOKEN=svelte-devtools-local-audit-token` and log `/tmp/svelte-audit-pokedex-server.log` | 20 distinct `PokemonCard` IDs, `+layout -> +page -> PokemonCard` ancestry, inspector, source button |
| `scripts/verify-editor.mjs` | `5177` | `node scripts/verify-editor.mjs` (starts and stops its own plain Svelte server on `5177`) | `POST /__svelte-devtools/open-in-editor` launches configured `LAUNCH_EDITOR` with file/line/column and rejects outside or missing paths |
| `scripts/verify-stress.mjs` | `5180` | `node scripts/verify-stress.mjs` (starts and stops its own plain Svelte server on `5180`) | Mount, update, keyboard-select, and unmount 1,000 `StressItem` instances |
| `scripts/verify-ssr-sql.mjs` | `5183`, `5184` | `node scripts/verify-ssr-sql.mjs` (starts and stops its own SvelteKit and Todo servers with a temporary `TODO_SQLITE_DB_PATH`) | No-JS SSR HTML, streaming, hydration, concurrent trace isolation, SQLite CRUD, HTTP/MCP/UI span parity |
| `scripts/verify-production.mjs` | `5185`, `5186` | `node scripts/verify-production.mjs` (requires `vite build` in `tests/apps/svelte-kit` and `tests/apps/todo-sqlite` first; starts preview servers) | `noopHandle()` preservation and absence of DevTools scripts, globals, dock, and endpoints (`404`) in production previews |
| `scripts/verify-package-consumer.mjs` | `127.0.0.1:5190` | `node scripts/verify-package-consumer.mjs` (packs workspace tarballs into a temp directory and runs a consumer server on `127.0.0.1:5190`) | `npx svelte-devtools init`, package exports, TypeScript types, runtime/panel serving, MCP 9 tools, and production build isolation |

## Authorize and open the panel (host 0.4.8)

The HTTP/MCP bearer token (`SVELTE_DEVTOOLS_TOKEN`) and the dock authorization code (`devframe auth code`) are separate credentials. Set `SVELTE_DEVTOOLS_TOKEN` before starting a manual fixture server to make the API token predictable. Keep it local.

1. Open the application in Chromium.
2. Read the latest six-digit `devframe auth code` from the server terminal. Strip ANSI escape sequences before extracting the digits from a captured log.
3. Click the dock's **Unauthorized** button inside `vite-devtools-dock-embedded`.
4. Locate the frame containing the textbox named **Digit 1 of 6** and fill **Digit 1 of 6** through **Digit 6 of 6**. Filling the sixth digit submits authorization automatically.
5. Wait until **Unauthorized** disappears, then iterate `.vite-devtools-dock-entry` elements: dispatch `pointerenter`, check `.z-floating-tooltip` for exact text `Svelte`, and click that entry's button. (Host 0.4.8 does not set `title="Svelte"` on the dock button.)
6. Find the panel frame by matching `frame.url().includes('__svelte-devtools')` and wait for `.sidebar`.

Use the maintained helper in `tests/e2e/panel-helpers.mjs` for Playwright automation:

```js
import { openDevToolsPanel } from './tests/e2e/panel-helpers.mjs';
const panel = await openDevToolsPanel(page, 'http://localhost:5173/', readLatestCode);
```

`readLatestCode` must return the latest six-digit code from the server log. Do not wait for a newly printed code on every browser connection. Legacy single-input `Manual Auth Token` and `auth-verify` scripts apply only to older hosts and fail on `@vitejs/devtools` 0.4.8.

## Verify live data without changing state

Use [MCP discovery](../docs/07_mcp.md) first when an MCP client is available. The MCP server exposes eight read-only tools and one acknowledged state-edit tool over the same HTTP API.

For direct HTTP access:

```bash
curl -fsS -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/
```

Read the status response and select the intended browser session from `capabilities.sessions`. Open the Svelte panel in Chromium so it syncs. Pass that exact `sessionId` on runtime queries. Start with component metadata (`includeState=false`) to avoid retrieving large state payloads:

```bash
# Set SESSION_ID to the selected session from status.
curl -fsS -G -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  --data-urlencode "sessionId=$SESSION_ID" \
  --data-urlencode 'includeState=false' --data-urlencode 'limit=20' \
  http://localhost:5173/__svelte-devtools/api/components
```

Select a mounted instance ID (`svt-<hash36>:<uid>`) from this response, then request that ID with state included. Do not use a build-time file ID (`svt-<hash36>`) as a mounted instance ID. Inspect `cachedAt`; an empty or stale panel cache does not prove that the application has no components. `cachedAt: 0` means no panel sync has arrived. Refresh the page and verify the panel connection before drawing conclusions.

Check timeline (`/api/timeline`), snapshots (`/api/snapshots`), and server events (`/api/server-events`) for the same session where supported. Component, timeline, and snapshot endpoints support `offset` and `limit` pagination. The [API reference](../docs/06_api.md) defines exact query fields and scope. Server traces include HTTP requests and explicit synchronous SQLite query spans (`server:sql`). Correlate `traceId`, `spanId`, and `parentSpanId`; do not infer parentage from URL or timing.

## Verify an authorized live edit

`POST /__svelte-devtools/api/set-state` and MCP `svelte_set_state` require `{ sessionId, componentId, key, value }` and wait for acknowledgement from the selected browser panel session. Use them only when changing application state is authorized.

Select a writable key from fresh inspection data. JSON-compatible `$state` values can be edited. Props, `$derived` values, and display markers for unsupported values (`[Function]`, `[DOM Node]`, etc.) are read-only. A successful edit is acknowledged by the runtime and enables recording; verify the app's visible DOM value, the timeline, and a fresh component query after the next 2-second sync.

A timeout or `409` with `OUTCOME_UNKNOWN` means the command was delivered without acknowledgement. Inspect the live value before deciding what happened. Do not automatically retry an edit with an unknown outcome. The API does not expose remote snapshot restore.

## Verify time travel in the browser

Open the **Time Travel** tab and click **Record** (`.record-btn`) before interacting. The panel starts in **Paused** state.

For the SvelteKit Spring counter regression (`scripts/verify-time-travel.mjs`):

1. Start recording, click the **Increase** button once, and wait for the Spring to settle.
2. Confirm snapshot counter `.count` reads `2 / 2` and the counter digit is `1`.
3. Click Undo (`.tb-btn` first button) and wait for the Spring to settle. Confirm `.count` reads `1 / 2` and the counter digit is `0`.
4. Click Redo (`.tb-btn` second button) and wait for the Spring to settle. Confirm `.count` reads `2 / 2` and the counter digit is `1`.
5. Confirm no third snapshot (`3 / 3`) appears after settlement.
6. Edit writable state while recording and verify undo/redo also restores the edited value.

## Check the UI as well as the API

Verify that repeated components stay separate, source links launch the editor, detail panes resize with pointer and keyboard, and long values remain scrollable. Test settings (theme, font scale, reduce motion) after a reload.

For **Network**, create a mock rule from an observed browser request (**Mock this request**), enable it (**Enable mock rule**), and repeat that request. Verify the application's received response as well as the panel badge. Mocks affect browser `fetch` only; native `XMLHttpRequest`, server fetches, and DevTools infrastructure requests pass through. The panel retains at most 500 combined network rows. A bounded preview may be truncated; review a generated mock body before saving it.

Report the commands run, the app tested, and any uncovered boundaries. A successful HTTP query alone does not verify rendering or editor launch.

## Verify SSR and SQL observations

Run `node scripts/verify-ssr-sql.mjs` after a root build and dependency installation for `tests/apps/svelte-kit` and `tests/apps/todo-sqlite`. It starts servers on ports `5183` and `5184` and uses a temporary SQLite database through `TODO_SQLITE_DB_PATH`. Read the JSON evidence output. Verify native form failures as well as enhanced actions, then compare SQL span IDs across the HTTP API, MCP `svelte_server_events`, and the **Network** tab's **SQL** filter and **Trace waterfall**.

Use MCP `svelte_server_events` with `last` between 1 and 500. Confirm measured `duration`, `statementTruncated` flags, and direct `parentSpanId` values. Do not expect bindings, result rows, automatic transaction spans, or database rollback. See [server capture semantics](../docs/05_server.md).
