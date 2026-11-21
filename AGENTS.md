# Svelte DevTools — Agent Guide

> Full-stack debugging for Svelte 5.20+ and SvelteKit on Vite 8, built on Vite DevTools Kit.
> **Status**: Early development (v0.4.0) — APIs may change.

## Quick Reference

| What | Where |
|------|-------|
| Extension code | `packages/` (`vite-plugin`, `runtime`, `client`, `types`, `mcp`) |
| npm workspace | Repository root (`workspaces: ["packages/*"]`) |
| Plain Vite test app | `tests/apps/svelte/` (port 5173, `--strictPort`) |
| SvelteKit test app | `tests/apps/svelte-kit/` (port 5174, `--strictPort`) |
| Todo SQLite test app | `tests/apps/todo-sqlite/` (port 5175, `--strictPort`) |
| Pokédex test app | `tests/apps/pokedex/` (port 5176, `--strictPort`) |
| Agent skills | `skills/` (`SKILLS.md`, `implement-devtools.md`, `debug-with-devtools.md`, `verify-devtools.md`) |
| Unit tests | `tests/` (Vitest + happy-dom) |
| E2E tests | `tests/e2e/` (Playwright; ports `SVELTE_E2E_PORT`=5173, `SVELTE_E2E_KIT_PORT`=5174) |
| Documentation | [README.md](README.md) (overview) and `docs/` ([developer map](docs/INDEX.md), architecture, API, MCP, Vite 8) |
| Design decisions and verification | [ADRs](docs/adr/README.md) and [validation records](docs/validation/devtools-completion-audit.md) |

## ⚠️ Critical: DevTools Client Served from dist/

The DevTools panel at `/__svelte-devtools/` is served from **`packages/client/dist/`**, NOT compiled on-the-fly by the dev server.

**Any changes to `packages/client/src/` require a rebuild to take effect:**
```bash
cd packages/client && npm run build
# Then restart the dev server
kill $(lsof -ti:5174) && npx vite dev --port 5174
```

**Without rebuilding, your changes will NOT appear in the DevTools panel.** The Vite dev server for the test app does NOT compile the client source on demand — it serves the pre-built `dist/` directory.

```
.svelte file → [Vite Plugin] → $inspect injection → Runtime → postMessage → DevTools iframe UI
```

Svelte 5 runes (`$state`, `$derived`) are compile-time transforms. The plugin injects `$inspect` hooks at build time; the runtime catches state changes and emits them via `postMessage` to an iframe-based DevTools UI.

## Agent Skills

Four skill files are available in `skills/` for AI agents working with this project:

| Skill | File | When to Use |
|-------|------|-------------|
| **Skills Index** | `skills/SKILLS.md` | Overview and entry point for the available Svelte DevTools agent skills |
| **Implement DevTools** | `skills/implement-devtools.md` | Adding and configuring Svelte DevTools in a Vite or SvelteKit project |
| **Debug with DevTools** | `skills/debug-with-devtools.md` | Inspecting live state and debugging Svelte 5 apps via MCP, HTTP API, or RPC |
| **Verify DevTools** | `skills/verify-devtools.md` | Running end-to-end browser, dock auth, time-travel, and SSR/SQL verification |

## Svelte AI MCP Tools

This project works with two MCP servers:

1. **Local Svelte DevTools MCP server** (`@fsodano/svelte-devtools-mcp`, in `packages/mcp/`): exposes 9 tools (`svelte_status`, `svelte_components`, `svelte_timeline`, `svelte_snapshots`, `svelte_routes`, `svelte_migration`, `svelte_server_events`, `svelte_source`, `svelte_set_state`) over the token-authenticated HTTP API. Requires an open, authorized Svelte DevTools panel in the browser. See [docs/07_mcp.md](docs/07_mcp.md).
2. **Official [Svelte MCP server](https://svelte.dev/docs/ai/mcp)** (`@sveltejs/mcp`): provides Svelte 5 documentation and static analysis:

| Tool | Purpose |
|------|---------|
| `list-sections` | Discover Svelte 5/SvelteKit documentation sections |
| `get-documentation` | Fetch full docs for relevant sections |
| `svelte-autofixer` | Static analysis — run before finalizing any Svelte component |
| `playground-link` | Generate ephemeral Svelte playground URLs |

**Setup**: `npx -y @sveltejs/mcp` (via stdio or remote `https://mcp.svelte.dev/mcp`)

See [Svelte AI Docs](https://svelte.dev/docs/ai/overview) for detailed setup per client.

## Common Agent Tasks

| Task | Approach |
|------|----------|
| **Modify transform logic** | Work in `packages/vite-plugin/src/index.ts` — AST traversal with Babel |
| **Add a runtime feature** | Work in `packages/runtime/src/index.ts` — `handleState`, `registerComponent` |
| **Add a UI panel** | Work in `packages/client/src/` — Svelte 5 components, runes-based store |
| **Add shared types** | Work in `packages/types/src/index.ts` — imported by sibling packages |
| **Update MCP tools** | Work in `packages/mcp/src/` — stdio tools backed by the authenticated HTTP API |
| **Fix a SvelteKit SSR issue** | Check `packages/vite-plugin/src/sveltekit.ts` — `transformPageChunk` injection |
| **Write a unit test** | Add to `tests/<package>/` — Vitest + happy-dom |
| **Write an e2e test** | Add to `tests/e2e/` — Playwright (`*.spec.ts`) |
| **Debug via MCP / HTTP / RPC** | Prefer MCP (`docs/07_mcp.md`) or HTTP API; use `svelte-devtools:*` RPC for build metadata (see `skills/debug-with-devtools.md`) |
| **Run the test app(s)** | See [README.md](README.md#sample-apps), [docs/INDEX.md](docs/INDEX.md), and each app's README in `tests/apps/*/` |
| **Verify via HTTP API** | `curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" http://localhost:5173/__svelte-devtools/api/` — every endpoint requires the per-run token |

## Verifying Work via HTTP API

The DevTools exposes a token-authenticated REST API at `/__svelte-devtools/api/` that agents can use to verify their changes.

- **Two separate credentials**: Dock authorization uses the **six-digit `devframe auth code`** printed by the Vite host in the server terminal. The HTTP API and MCP server use the **`SVELTE_DEVTOOLS_TOKEN` bearer token**.
- **Authentication**: Every `/__svelte-devtools/api/*` request requires the per-run token. Send it as an `Authorization: Bearer <token>` header. Use the `?token=<token>` query parameter only for beacon-only requests (`navigator.sendBeacon`) that cannot set headers. Requests without a valid token receive `401`. Set `SVELTE_DEVTOOLS_TOKEN` before starting the dev server to fix the token, or copy it from the server terminal.
- **CORS allow-list**: CORS is allow-listed, not wildcard. Origins are reflected only for `http://localhost:*`, `http://127.0.0.1:*`, and configured origins (paired with `Vary: Origin`). Requests without an `Origin` header receive no CORS header.
- **Panel sync dependency**: Runtime endpoints (`components`, `timeline`, `snapshots`, `remote`, `set-state`) read from the panel cache synced by an open, authorized Svelte DevTools panel.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/` or `/api/status` | Plugin status, version, sessions, available endpoints |
| `GET` | `/api/components` | Session-scoped registered components with state (supports filters, pagination, `includeState=false`) |
| `GET` | `/api/timeline` | Timeline events (mounts, state changes, effects) |
| `GET` | `/api/server-events` | Server request and SQLite traces with bounded response previews |
| `DELETE` | `/api/server-events` | Clear the server event buffer |
| `GET` | `/api/migration` | Svelte 4→5 migration scores; `overall` is `null` until components are scored |
| `GET` | `/api/snapshots` | Snapshot branch tree (`parentId`, `branchId`, timestamps) |
| `GET` | `/api/routes` | SvelteKit route inventory from the resolved routes directory (`src/routes` fallback) |
| `GET` | `/api/remote` | Remote-debugging payload synced from the panel |
| `GET` | `/api/commands?sessionId=<id>&url=<url>` | (internal) Panel command polling |
| `POST` | `/api/commands/result` | (internal) Panel command acknowledgement |
| `POST` | `/api/set-state` | Acknowledged live edit (`{sessionId, componentId, key, value}`); select a session from API status |
| `GET` | `/api/source?file=<path>` | Source code file lookup (confined to project root) |
| `POST` | `/api/sync` | (internal) Client syncs runtime state here |

### Verification Workflow (MANDATORY)

1. **Build** → `npm run build`
2. **API Check** → `curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" http://localhost:5173/__svelte-devtools/api/<endpoint>` to verify JSON data
3. **UI Check** → Refresh browser at `http://localhost:5173` and inspect the open DevTools panel to verify visual result

This two-step verification (API + UI) is REQUIRED for every change. The API proves data correctness; the UI proves rendering correctness.

```bash
# 1. Check plugin is loaded and running
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/

# 2. Check components are registered
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/components | jq '.count, .components[].name'

# 3. Check timeline events are flowing
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/timeline | jq '.count'

# 4. Check server traces (after navigating a SvelteKit test app)
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'

# 5. Check migration scores
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/migration
```

### Real-World Usage

When modifying the transform, runtime, or client: start or refresh the test app page in the browser with the Svelte panel open, then query the API to verify:
- **Components**: Did the new component appear in the tree?
- **Timeline**: Are mount/state/effect events being emitted?
- **State**: Are the correct values being tracked?

### API Response Format

```json
{
  "ok": true,
  "count": 3,
  "components": [{"id": "svt-xxx", "name": "App", ...}],
  "cachedAt": 1712345678000
}
```

- `cachedAt: 0` means no client panel has synced yet (open and authorize the panel in a browser)
- `count` is present on the paginated list endpoints (`components`, `timeline`, `snapshots`, `routes`); `server-events` returns `{ ok: true, events }` without `count`
- Components, timeline, and snapshots are cached per panel session via periodic authenticated `fetch` sync from the browser

## Dock Rendering and Authorization (Vite DevTools)

The plugin registers its dock entry as `type: 'iframe'` (`DOCK_CONFIG` in `packages/types/src/constants.ts`). Vite DevTools Kit renders it as a **DocumentPictureInPicture popup window** in supported Chromium browsers, or as an **embedded iframe** in headless mode. Access it via `page.frames()` in Playwright. The Vite DevTools icon at the bottom-right opens the dock; the panel opens when the Svelte dock entry is clicked.

**Host version matters:** The supported `@vitejs/devtools` 0.4.8 host uses a six-digit `devframe auth code`. Older hosts used a single-use `Manual Auth Token` and must not be applied blindly to 0.4.8. Keep the API bearer token (`SVELTE_DEVTOOLS_TOKEN`) separate from dock authorization. The canonical 0.4.8 workflow is implemented in `tests/e2e/panel-helpers.mjs` and used by both browser tests and `scripts/verify-time-travel.mjs`.

For the supported `@vitejs/devtools` 0.4.8 host, use this sequence:

1. Read the six-digit `devframe auth code` from the server log. Strip ANSI color codes before matching it.
2. Click the dock's `Unauthorized` button.
3. Find the authorization frame containing the textbox named `Digit 1 of 6`.
4. Fill the six textboxes named `Digit 1 of 6` through `Digit 6 of 6`. Filling the last digit submits the form automatically.
5. Wait until `Unauthorized` disappears.
6. Find `.vite-devtools-dock-entry` elements. Trigger `pointerenter`, check the `.z-floating-tooltip` text for `Svelte`, and click that entry's button. Host 0.4.8 does not put the entry name in the button's `title` attribute.
7. Find the frame whose URL contains `__svelte-devtools`.

For a runnable example from the repository root:

```js
import { openDevToolsPanel } from './tests/e2e/panel-helpers.mjs';
const frame = await openDevToolsPanel(page, 'http://localhost:5174/', readLatestCode);
```

`readLatestCode` must return the latest six-digit code from the server log. See `scripts/verify-pokedex.mjs` for a log-file implementation. Do not wait for a new code on each browser connection: current hosts can print the code before the browser connects.

### Legacy host reference (pre-0.4.8)

Older `@vitejs/devtools` hosts printed a single-use `Manual Auth Token : <token>` in the terminal and used a single text input plus an `Authorize` button in `vite-devtools-dock-embedded`. On those legacy hosts, each new WebSocket handshake invalidated the previous token, and `/auth-verify` returned `403` plain text (`"Invalid or expired auth token"`, not JSON) on failure. Do not use `auth-verify` or the legacy single-input dialog against `@vitejs/devtools` 0.4.8.

## Browser Testing Workflow (Playwright)

Use the maintained Playwright suite (`npm run test:e2e`) or this workflow for interactive end-to-end testing of time travel, branch visualization, and state changes.

### Setup

```bash
# 1. Build all packages from the repository root
npm run build

# 2. Start the test server in a tmux session
kill $(lsof -ti:5173) 2>/dev/null; sleep 0.5
tmux kill-session -t svelte-plain 2>/dev/null; sleep 0.5
tmux new-session -d -s svelte-plain \
  -c tests/apps/svelte \
  "npx vite --port 5173 --strictPort --clearScreen false"
sleep 4

# 3. Verify the server is up
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
# Should print: 200
```

### Authorization and Opening the DevTools (Host 0.4.8)

```mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { openDevToolsPanel } from './tests/e2e/panel-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const readLatestCode = () => {
  const log = execFileSync('tmux', ['capture-pane', '-t', 'svelte-plain', '-p', '-S', '-200'], {
    encoding: 'utf8',
  }).replace(/\x1b\[[0-9;]*m/g, '');
  return [...log.matchAll(/devframe auth code\s*(\d{6})/g)].at(-1)?.[1] ?? '';
};

// Authorize the dock and open the Svelte DevTools iframe
const iframe = await openDevToolsPanel(page, 'http://localhost:5173/', readLatestCode);

// Switch to the Events / Timeline tab
await iframe.locator('button', { hasText: 'Events' }).click();
await page.waitForTimeout(1000);
```

### Interacting with the App

Use `page.evaluate()` to click buttons when the Vite DevTools dock could overlap the target area:

```mjs
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent === 'Increment');
  if (btn) btn.click();
});
await page.waitForTimeout(200);
```

### Verifying Time Travel

**Prerequisite:** The Time Travel panel starts in "Paused" state. You MUST click the Record button (`.record-btn`) before interacting with the app, otherwise no snapshots are captured and the panel shows "No snapshots — Click Record and interact with your app".

```mjs
// Enable snapshot capture first — toggle "Paused" → "Recording"
await iframe.locator('button', { hasText: 'Time Travel' }).click();
await page.waitForTimeout(500);
await iframe.locator('.record-btn').click();
await page.waitForTimeout(500);

// Read DOM state
let dom = await page.locator('p:has-text("count:")').first().textContent();
console.log('Before:', dom);

// Click a snapshot dot to restore
const dots = await iframe.locator('.snap-dot').all();
await dots[2].click();  // Restore to snapshot index 2
await page.waitForTimeout(3000);

dom = await page.locator('p:has-text("count:")').first().textContent();
console.log('After restore:', dom);

// Increment after restore to verify component isn't frozen
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent === 'Increment');
  if (btn) btn.click();
});
await page.waitForTimeout(500);

dom = await page.locator('p:has-text("count:")').first().textContent();
console.log('After increment:', dom);

// Check branch grid layout
const gridInfo = await iframe.evaluate(() => {
  const grid = document.querySelector('.snap-list');
  return {
    exists: !!grid,
    children: grid?.children.length ?? 0,
  };
});
console.log('Snap-list:', gridInfo);
```

### Complete Test Scripts

See `tests/e2e/` (`devtools.spec.ts`, `navigation.spec.ts`, `panel-helpers.mjs`) and `scripts/` (`verify-time-travel.mjs`, `verify-ssr-sql.mjs`, `verify-pokedex.mjs`, `verify-stress.mjs`, `verify-editor.mjs`, `verify-production.mjs`, `verify-package-consumer.mjs`) for maintained end-to-end verification scripts.

### Common Pitfalls

- **Dock overlay blocks clicks**: Use `page.evaluate()` instead of `locator.click()` for buttons near the bottom-right of the page (the Vite DevTools dock overlays this area).
- **Host auth mismatch**: Host 0.4.8 uses the six-digit `devframe auth code` and floating tooltip discovery (`.z-floating-tooltip`), not `button[title="Svelte"]` or the legacy single-input Manual Auth Token dialog. Use `openDevToolsPanel` from `tests/e2e/panel-helpers.mjs`.
- **Early runtime calls**: Component initialization can run before the runtime module finishes loading. The plugin buffers early calls in `window.__SVELTE_DEVTOOLS_QUEUE__` until `window.__SVELTE_DEVTOOLS_RUNTIME__` initializes and drains the queue.
- **Iframe vs popup**: In headless Chromium, `DocumentPictureInPicture` is not used and the panel renders as an embedded iframe reachable via `page.frames()`.

## Mandatory: Time Travel Verification Procedure

> **Note:** On the supported `@vitejs/devtools` 0.4.8 host, `scripts/verify-time-travel.mjs` runs this exact assertion sequence using `openDevToolsPanel` (six-digit `devframe auth code`). The procedure block below is preserved verbatim as the mandatory specification.

Before declaring any time-travel fix complete, you MUST execute THIS exact test:

```mjs
// 1. Authenticate (tmux method)
await page.goto('http://localhost:5174/');
const token = execSync("bash -c 'sleep 0.2; tmux capture-pane -t svelte-kit -p -S -10'")
  .toString().match(/Manual Auth Token : (\S+)/)?.[1];
await page.evaluate(() => {
  const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  dock?.querySelector('button')?.click();
});
await page.locator('input').first().fill(token);
await page.evaluate(() => {
  const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  Array.from(dock.querySelectorAll('button')).find(b => b.textContent?.includes('Authorize'))?.click();
});
await page.waitForTimeout(2000);

// 2. Open Svelte DevTools
await page.evaluate(() => {
  document.querySelector('vite-devtools-dock-embedded')?.shadowRoot
    ?.querySelector('button[title="Svelte"]')?.click();
});
await page.waitForTimeout(4000);

// 3. Open Time Travel tab AND click Record to enable snapshot capture
//    The panel starts in "Paused" state — NO snapshots are captured until
//    the Record button (.record-btn) is clicked. Without this, the panel
//    shows "No snapshots — Click Record and interact with your app".
const iframe = page.frames().find(f => f.url().includes('svelte-devtools'));
await iframe.locator('button', { hasText: 'Time Travel' }).click();
await page.waitForTimeout(1000);
await iframe.locator('.record-btn').click(); // Toggles "Paused" → "Recording"
await page.waitForTimeout(500);

// 4. Now interact: click counter ONCE and wait for Spring settlement
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find(b => b.getAttribute('aria-label')?.includes('Increase'))
    ?.click();
});
await page.waitForTimeout(5000);

// 5. VERIFY: 2 snapshots (mount + state)
const snap1 = await iframe.locator('.count').textContent();
console.assert(snap1?.trim() === '2 / 2', 'Expected 2/2 snapshots, got ' + snap1);

// 6. Click UNDO — wait for Spring to settle
await iframe.locator('.tb-btn').first().click();
await page.waitForTimeout(4000);

// 7. VERIFY: counter at 0, snap 1/2
const snap2 = await iframe.locator('.count').textContent();
console.assert(snap2?.trim() === '1 / 2', 'Expected 1/2 after undo, got ' + snap2);

// 8. Click REDO — wait for Spring to settle  
await iframe.locator('.tb-btn').nth(1).click();
await page.waitForTimeout(5000);

// 9. CRITICAL VERIFY: snapshots still 2/2 (NOT 3/3)
const snap3 = await iframe.locator('.count').textContent();
console.assert(snap3?.trim() === '2 / 2', 'Expected 2/2 after redo, got ' + snap3);

// 10. Counter value correct
const counter = await page.locator('.counter-digits strong:not(.hidden)').textContent();
console.assert(counter?.trim() === '1', 'Expected counter 1, got ' + counter);
```

**FAILURE CONDITIONS:**
- If step 9 shows `3/3`, the fix is **not working**. Debug the `lastRestoredSnapshotJSON` dedup in `doCapture`.
- If the iframe locator fails, the DevTools panel may have opened as a popup instead. Fall back to `page.evaluate()` for iframe access.

**CRITICAL: After any change to `packages/client/src/`, rebuild:**
```bash
cd packages/client && npm run build
```
Then restart the dev server. Without this, the changes are NOT served.

## Reading Order

1. **This file** (`AGENTS.md`) — agent operating manual and project rules
2. [Overview & Quick Start](README.md) — user-facing overview, installation, MCP setup, and sample apps
3. [Developer Docs Index](docs/INDEX.md) — build order, test suites, package map, and verification scripts
4. [Architecture](docs/01_architecture.md) — system design and data flow
5. [Vite Plugin](docs/02_vite-plugin.md) — transforms, middleware, HTTP API
6. [Runtime](docs/03_runtime.md) — state handling, early call queue, and `postMessage` protocol
7. [Client UI](docs/04_client.md) — DevTools panel implementation
8. [Server Integration](docs/05_server.md) — SvelteKit request and SQLite tracing
9. [API Reference](docs/06_api.md) — public APIs and type definitions
10. [Agent MCP Guide](docs/07_mcp.md) — MCP tools, session targeting, freshness, and limits
11. [Vite 8 Guide](docs/VITE.md) — Vite 8 / Rolldown internals and compatibility audit

## Existing Extension Docs

The repository documentation under `docs/` covers both architecture and contributor workflows:

- `docs/INDEX.md` — Developer documentation map, build order, and test workflows
- `docs/01_architecture.md` — System design, data flow, sequence diagrams
- `docs/02_vite-plugin.md` — Build-time transforms, middleware, and configuration
- `docs/03_runtime.md` — Runtime state handling, queueing, and `postMessage` events
- `docs/04_client.md` — DevTools UI (iframe) implementation
- `docs/05_server.md` — SvelteKit request and SQLite query tracing
- `docs/06_api.md` — Type definitions, HTTP API, and public APIs
- `docs/07_mcp.md` — Local MCP server setup, tools, and payload bounds
- `docs/VITE.md` — Vite 8 / Rolldown guide and compatibility audit
- `docs/design-guidelines.md` — Visual system, layout resizing, settings, and interaction contracts
- `docs/COMPARISON.md` — Feature comparison with file-level evidence
- `docs/inspiration.md` — Design inspirations and background
- `docs/adr/README.md` — Canonical Architecture Decision Records index (`ADR-0001` through `ADR-0020`)
- `docs/validation/` — Point-in-time verification records (`devtools-completion-audit.md`, `ssr-sql-observability-validation.md`, `package-consumer-validation.md`, `fresh-npm-install.md`, `svelte-autofixer-review.md`)

## Writing Style: ASD-STE100 Principles

Use ASD-STE100 Simplified Technical English principles for technical and
agent-authored text: https://www.asd-ste100.org/

- Write short sentences. Keep one topic in each sentence.
- Use active voice. Write instructions as direct commands.
- Use one clear meaning for each word. Reuse the same term consistently.
- Put conditions before the main clause: "If X, then Y."
- Use American English spelling.
- Review AI-generated text before use. Clear text is not proof of compliance.

These are STE-inspired guidelines, not an official STE implementation. ASD-STE100
is a copyright and trademark of ASD, Brussels, Belgium. Do not claim STE
compliance or certification.

## Project Rules

- All packages use **ESM** (`"type": "module"`)
- Svelte 5 runes mode (`compilerOptions: { runes: true }`)
- TypeScript strict mode
- No production code shipped — everything is `apply: 'serve'`
- `svelte-code-writer` skill available for Svelte 5 component work
- **NO timeline/restore/store capture code changes without explicit user approval**
- no time-bound cooldowns, no capture gating based on timestamps, no restore-related changes
- **NO commits unless the user explicitly says "commit", "push", or "PR"** — ask first, always
