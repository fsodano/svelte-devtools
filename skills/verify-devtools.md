---
name: verify-svelte-devtools
description: Use when validating Svelte DevTools changes, checking browser authorization, or diagnosing differences between runtime data and the panel.
---

# Verify Svelte DevTools

This reference targets release 0.2.1 and the tested `@vitejs/devtools` 0.4.8 host. Start with [source installation](../docs/02_vite-plugin.md#installation). The installation guide covers npm packages and source development.

## Build and run the maintained tests

Run from the repository root:

```bash
npm ci
npm ci --prefix tests/apps/svelte
npm ci --prefix tests/apps/svelte-kit
npm run build
npm run check
npx vitest run --maxWorkers=2
npx playwright install chromium
npm run test:e2e
```

The browser suite starts its fixture servers on ports 5173 and 5174. Stop conflicting servers first. It covers component identity, source opening, live edits, time travel, mocks, settings, resize behavior, and cleanup. Use the assertions in `tests/e2e/` as the maintained examples.

Client changes require a rebuild. The application server serves `packages/client/dist/`; it does not compile panel source on demand. Restart an existing fixture server after rebuilding.

For the full release validation gate, run `bash scripts/publish.sh --dry-run`. This builds, checks, runs unit and browser tests, and validates package contents. Do not use `--publish` unless publishing is explicitly authorized. `npm run release:check` checks existing build artifacts; it does not replace the full gate.

## Authorize and open the panel

The API bearer token and dock authorization code are separate credentials. Set `SVELTE_DEVTOOLS_TOKEN` before starting a manual fixture server to make the API token predictable. Keep it local.

1. Open the application in Chromium.
2. Read the latest six-digit `devframe auth code` from the server terminal. Remove ANSI escapes before extracting the digits from a captured log.
3. Click the dock's **Unauthorized** button.
4. Fill the six fields named **Digit 1 of 6** through **Digit 6 of 6**. The last digit submits authorization.
5. Open the Svelte dock entry. Its button does not have a `title="Svelte"` attribute in host 0.4.8; use the dock tooltip to identify it.
6. Find the panel frame by a URL containing `__svelte-devtools`.

Use the maintained helper for automation:

```js
import { openDevToolsPanel } from './tests/e2e/panel-helpers.mjs';
const panel = await openDevToolsPanel(page, 'http://localhost:5173/', readLatestCode);
```

`readLatestCode` returns the current six-digit code from your server log. Do not wait for a newly printed code on every browser connection. See `scripts/verify-pokedex.mjs` for a log reader. Legacy Manual Auth Token and `auth-verify` examples are not the supported host workflow.

## Verify live data without changing state

Use [MCP discovery](../docs/07_mcp.md) first when an MCP client is available. The server has eight inspection tools and one acknowledged state-edit tool. It reads the same HTTP API as scripts.

For direct HTTP access:

```bash
curl -fsS -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/
```

Read the status response and select the intended browser session. Open the Svelte panel so it can sync. Pass that exact `sessionId` on runtime queries. Start with component metadata to avoid retrieving large state values:

```bash
# Set SESSION_ID to the selected session from status.
curl -fsS -G -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  --data-urlencode "sessionId=$SESSION_ID" \
  --data-urlencode 'includeState=false' --data-urlencode 'limit=20' \
  http://localhost:5173/__svelte-devtools/api/components
```

Select a mounted instance ID from this response, then request that ID with state included. Do not use a build-time file ID as a mounted instance ID. Inspect `cachedAt`; an empty or stale panel cache does not prove that the application has no components. `cachedAt: 0` means no panel sync has arrived. Refresh the page and verify the panel connection before drawing conclusions.

Check timeline, snapshots, and server events for the same session where supported. Component, timeline, and snapshot endpoints support pagination. The [API reference](../docs/06_api.md) defines exact query fields and scope. Server traces include HTTP requests and explicit synchronous SQLite query spans. Correlate `traceId`, `spanId`, and `parentSpanId`; do not infer parentage from URL or timing.

## Verify an authorized live edit

`POST /api/set-state` is implemented. Its body requires `{sessionId, componentId, key, value}`. It waits for a result from the selected browser session. The MCP tool `svelte_set_state` exposes this operation. Use it only when changing application state is authorized.

Select a writable key from fresh inspection data. JSON-compatible `$state` values can be edited. Props, derived values, and display markers for unsupported values are read-only. A successful edit is acknowledged by the runtime; then verify the app's visible value, the timeline, and a fresh component query.

A timeout can mean the outcome is unknown. Inspect the live value before deciding what happened. Do not automatically retry an edit with an unknown outcome. The API does not expose remote snapshot restore.

## Verify time travel in the browser

Open Time Travel and click **Record** before interacting. The panel starts paused.

For the SvelteKit Spring counter regression:

1. Start recording, increment once, and wait for the Spring to settle.
2. Confirm two snapshots and counter value 1.
3. Undo. Confirm snapshot position 1/2 and counter value 0.
4. Redo. Confirm position 2/2 and counter value 1.
5. Confirm no third snapshot appears after settlement.
6. Edit state while recording and verify undo/redo also restores the edited value.

The maintained browser suite checks these behaviors. `scripts/verify-time-travel.mjs` is an additional standalone check that requires the built SvelteKit fixture already running on port 5174 in a tmux session named `svelte-kit`.

## Check the UI as well as the API

Verify repeated components stay separate, source links launch the editor, detail panes resize with pointer and keyboard, and long values remain scrollable. Test settings after a reload.

For Network, create a mock from an observed browser request, enable it, and repeat that request. Verify the application's received response as well as the panel label. Mocks affect browser `fetch` only; native XMLHttpRequest, server fetches, and DevTools infrastructure pass through. The panel retains at most 500 combined network rows. A bounded preview may be incomplete; review a generated mock body before using it.

Report the commands run, the app tested, and any uncovered boundaries. A successful HTTP query alone does not verify rendering or editor launch.

## Verify SSR and SQL observations

Run `node scripts/verify-ssr-sql.mjs` after a root build and dependency installation for the SvelteKit and Todo fixtures. It starts servers on 5183/5184 and uses a temporary SQLite database through `TODO_SQLITE_DB_PATH`. Read the evidence output. Verify native form failures as well as enhanced actions, then compare SQL span IDs in the HTTP API, MCP, and Network trace details.

Use MCP `svelte_server_events` with `last` between 1 and 500. Confirm measured duration, statement truncation flags, and direct parent IDs. Do not expect bindings, result rows, automatic transaction spans, or database rollback. See [server capture semantics](../docs/05_server.md).
