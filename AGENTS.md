# Svelte DevTools — Agent Guide

> Full-stack debugging for Svelte 5 and SvelteKit, built on Vite DevTools Kit.
> **Status**: Early development — APIs may change.

## Quick Reference

| What | Where |
|------|-------|
| Extension code | `svelte-dev-extension/packages/` |
| npm workspace | `svelte-dev-extension/` (workspaces: `packages/*`) |
| SvelteKit test app | `svelte-dev-extension/tests/apps/svelte-kit/` |
| Plain Vite test app | `svelte-dev-extension/tests/apps/svelte/` |
| Agent skills | `svelte-dev-extension/skills/` (implement-devtools.md, debug-with-devtools.md) |
| Unit tests | `svelte-dev-extension/tests/` |
| E2E tests | `svelte-dev-extension/tests/e2e/` |
| Existing docs | `svelte-dev-extension/docs/` (architecture, API, Vite 8) |
| Release plan | `svelte-dev-extension/.sisyphus/plans/v0.0.1.md` |

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

Two skills are available for AI agents working with this project:

| Skill | File | When to Use |
|-------|------|-------------|
| **Implement DevTools** | `svelte-dev-extension/skills/implement-devtools.md` | Adding the devtools to a Svelte/SvelteKit project |
| **Debug with DevTools** | `svelte-dev-extension/skills/debug-with-devtools.md` | Using the devtools to debug Svelte 5 issues via RPC |

## Svelte AI MCP Tools

This project works with the official [Svelte MCP server](https://svelte.dev/docs/ai/mcp) (`@sveltejs/mcp`). The MCP provides:

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
| **Add shared types** | Work in `packages/types/src/index.ts` — auto-imported by all packages |
| **Fix a SvelteKit SSR issue** | Check `packages/vite-plugin/src/sveltekit.ts` — `transformPageChunk` injection |
| **Write a unit test** | Add to `svelte-dev-extension/tests/<package>/` — vitest + happy-dom |
| **Write an e2e test** | Add to `svelte-dev-extension/tests/e2e/` — Playwright |
| **Debug via RPC** | Use `svelte-devtools:*` RPC methods (see debug-with-devtools.md skill) |
| **Run the test app(s)** | See [docs/INDEX.md](docs/INDEX.md) (build/test) and `tests/apps/svelte-kit/README.md` |
| **Verify via HTTP API** | `curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" localhost:5173/__svelte-devtools/api/` — every endpoint requires the per-run token |

## Verifying Work via HTTP API

The DevTools exposes a REST API at `/__svelte-devtools/api/` that agents can use to verify their changes without opening a browser. Every request requires the per-run token: send it as an `Authorization: Bearer <token>` header, or as a `?token=<token>` query parameter for `navigator.sendBeacon` calls, which cannot set headers. Requests without a valid token get `401`. Set `SVELTE_DEVTOOLS_TOKEN` before starting the dev server to fix the token, or copy it from the server terminal.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/` | Plugin status, available endpoints |
| `GET` | `/api/components` | All registered components with state |
| `GET` | `/api/timeline` | Timeline events (mounts, state changes, effects) |
| `GET` | `/api/server-events` | Server request traces with response bodies |
| `GET` | `/api/migration` | Svelte 4→5 migration scores; `overall` is `null` until components are scored |
| `GET` | `/api/snapshots` | Snapshot branch tree (parentId, branchId, timestamps) |
| `GET` | `/api/routes` | SvelteKit route map scanned from `src/routes` |
| `GET` | `/api/remote` | Remote-debugging payload synced from the panel |
| `POST` | `/api/set-state` | Not implemented: returns `501` (`{componentId, key, value}`) |
| `GET` | `/api/source?file=<path>` | Source code file lookup |
| `POST` | `/api/sync` | (internal) Client syncs runtime state here |

### Verification Workflow

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

# 4. Check server traces (after navigating the test app)
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'

# 5. Check migration scores
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/migration
```

### Verification Workflow (MANDATORY)

1. **Build** → `npm run build`
2. **API Check** → `curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" localhost:5173/__svelte-devtools/api/<endpoint>` to verify JSON data
3. **UI Check** → Refresh browser at `localhost:5173` to verify visual result

The plugin registers its dock entry as `type: 'iframe'` (`DOCK_CONFIG` in `packages/types/src/constants.ts`); the Vite DevTools Kit then renders it — in supported Chromium browsers as a **DocumentPictureInPicture popup window**, in headless mode as an **embedded iframe**. The Vite DevTools icon at the bottom-right opens a command palette — the panel opens when a dock entry is triggered.

### Authorization (Vite DevTools)

**Host version matters:** The supported `@vitejs/devtools` 0.4.8 host uses a six-digit devframe authorization code. The Manual Auth Token examples below describe older hosts and must not be applied blindly to 0.4.8. Use the current browser regression helper for the installed host. Keep the API bearer token separate from dock authorization. The current workflow is verified in `tests/e2e/panel-helpers.mjs` and used by both browser tests and `scripts/verify-time-travel.mjs`.

For the supported host, use this sequence:

1. Read the six-digit `devframe auth code` from the server log. Remove ANSI color codes before matching it.
2. Click the dock's `Unauthorized` button.
3. Find the authorization frame with the textbox named `Digit 1 of 6`.
4. Fill the six textboxes named `Digit 1 of 6` through `Digit 6 of 6`. The last digit submits the form automatically.
5. Wait until `Unauthorized` disappears.
6. Find `.vite-devtools-dock-entry` elements. Trigger `pointerenter`, check the `.z-floating-tooltip` text for `Svelte`, and click that entry's button. Version 0.4.8 does not put the entry name in the button's `title` attribute.
7. Find the frame whose URL contains `__svelte-devtools`.

For a runnable example from the repository root:

```js
import { openDevToolsPanel } from './tests/e2e/panel-helpers.mjs';
const frame = await openDevToolsPanel(page, 'http://localhost:5174/', readLatestCode);
```

`readLatestCode` must return the latest six-digit code from the server log. See `scripts/verify-pokedex.mjs` for a log-file implementation. Do not wait for a new code on each browser connection: current hosts can print the code before the browser connects.

#### Legacy host reference


Vite DevTools requires authorization on each new browser session. The terminal running the Vite dev server displays a **Manual Auth Token**.

**⚠️ Important timing caveat:** The Manual Auth Token is **single-use** and is **invalidated** whenever a new WebSocket connection is established from the same origin. The `auth-verify` HTTP endpoint returns `403` with plain text `"Invalid or expired auth token"` on failure (not JSON), making `res.json()` fragile. **For these legacy hosts, use the manual dialog method below.**

**Reliable method (Playwright — manual dialog):**

```typescript
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto('http://localhost:5174/');
await page.waitForTimeout(2000);

// 1. Click the "Unauthorized" button to open the auth dialog
await page.evaluate(() => {
  const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  const btn = Array.from(dock?.querySelectorAll('button') || [])
    .find(b => b.textContent?.includes('Unauthorized'));
  btn?.click();
});
await page.waitForTimeout(300);

// 2. Read the Manual Auth Token from the server terminal
const token = execSync('tmux capture-pane -t SESSION_NAME -p -S -10')
  .toString().match(/Manual Auth Token : (\S+)/)?.[1];

// 3. Type the token into the auth dialog input and click Authorize
await page.locator('vite-devtools-dock-embedded').first()
  .locator('input').first().fill(token);
await page.waitForTimeout(200);
await page.evaluate(() => {
  const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  const btn = Array.from(dock?.querySelectorAll('button') || [])
    .find(b => b.textContent?.includes('Authorize'));
  btn?.click();
});
await page.waitForTimeout(2000);

// 4. Verify — dock buttons should not include "Unauthorized"
const dockState = await page.evaluate(() => {
  const d = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  if (!d) return [];
  return Array.from(d.querySelectorAll('button')).map(b => b.textContent?.trim());
});
console.log('Dock buttons:', dockState);
// Expect: ["Rolldown", "Svelte", "Settings", "1"] (no "Unauthorized")
```

**Why the `auth-verify` + localStorage approach is unreliable:**

1. The Manual Auth Token appears in the terminal when the browser's WebSocket connects.
2. But the browser issues multiple requests on page load, each potentially triggering a new WebSocket handshake.
3. Each new handshake **invalidates the previous Manual Auth Token**.
4. By the time you read the token from tmux and call `fetch('/.devtools/auth-verify?id=...')`, the token is likely already expired.
5. The endpoint returns `403` with plain text `"Invalid or expired auth token"` — not JSON — so `res.json()` throws a `SyntaxError`.
6. **Do not use `auth-verify` for automated scripts.** Use the dialog method above instead.

### Notes on DevTools UI Testing

- The DevTools dock entry is `type: 'iframe'`; the Vite DevTools Kit renders it as a **DocumentPictureInPicture popup window** in supported Chromium, or as an **embedded iframe** in headless mode. Access via `page.frames()` in either case.
- The Vite DevTools icon at the bottom-right opens a command palette — the panel opens when a dock entry is triggered.
- **Authorization** is required per browser session. The `Manual Auth Token` changes on each server restart.
- In headless browsers, `DocumentPictureInPicture` may not be available. For automated CI, verify via the HTTP API instead.

### HTTP API Verification (token-authenticated)

Every endpoint requires the per-run token. Set `SVELTE_DEVTOOLS_TOKEN` before starting the dev server, or read it from the server terminal. Send it as an `Authorization: Bearer <token>` header. Use the `?token=<token>` query form only for beacon-only requests that cannot set headers.

```bash
# Check plugin is loaded and running
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/

# Check components are registered
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/components | jq '.count, .components[].name'

# Check timeline events are flowing
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/timeline | jq '.count'

# Check server traces (after navigating the test app)
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'

# Check migration scores
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/migration
```

CORS is allow-listed, not wildcard: origins are reflected only for `http://localhost:*`, `http://127.0.0.1:*`, and configured origins. Requests without an `Origin` header get no CORS header.

This two-step verification (API + UI) is REQUIRED for every change. The API proves data correctness; the UI proves rendering correctness.

### Real-World Usage

When modifying the transform, runtime, or client: start or refresh the test app page in the browser, then immediately query the API to verify:
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

- `cachedAt: 0` means no client has synced yet (open the page in a browser)
- `count` is always present for list endpoints
- Components and timeline are cached via periodic sync from the browser

## Browser Testing Workflow (Playwright)

Use this workflow for end-to-end testing of time travel, branch visualization, and state changes.

### Setup

```bash
# 1. Build all packages from the repository root
npm run build

# 2. Start the test server in a tmux session
kill $(lsof -ti:5173) 2>/dev/null; sleep 0.5
tmux kill-session -t svelte-plain 2>/dev/null; sleep 0.5
tmux new-session -d -s svelte-plain \
  -c tests/apps/svelte \
  "npx vite --port 5173 --clearScreen false"
sleep 4

# 3. Verify the server is up
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
# Should print: 200
```

### Authorization

```mjs
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// 1. Read the Manual Auth Token from tmux
const token = execSync("bash -c 'sleep 0.2; tmux capture-pane -t svelte-plain -p -S -10'")
  .toString().match(/Manual Auth Token : (\S+)/)?.[1];

// 2. Click "Unauthorized" button to open auth dialog
await page.evaluate(() => {
  const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  const btn = Array.from(dock?.querySelectorAll('button') || [])
    .find(b => b.textContent?.includes('Unauthorized'));
  btn?.click();
});
await page.waitForTimeout(300);

// 3. Fill in the token
await page.locator('vite-devtools-dock-embedded').first()
  .locator('input').first().fill(token);
await page.waitForTimeout(200);

// 4. Click Authorize
await page.evaluate(() => {
  const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  const btn = Array.from(dock?.querySelectorAll('button') || [])
    .find(b => b.textContent?.includes('Authorize'));
  btn?.click();
});
await page.waitForTimeout(2000);
```

### Opening the DevTools

```mjs
// Click the Svelte dock entry (button index 1 in the dock)
await page.evaluate(() => {
  document.querySelector('vite-devtools-dock-embedded')?.shadowRoot
    ?.querySelectorAll('button')?.[1]?.click();
});
await page.waitForTimeout(3000);

// Find the DevTools iframe
const iframe = page.frames().find(f => f.url().includes('svelte-devtools'));

// Click the Timeline tab
await iframe.locator('button', { hasText: 'Timeline' }).click();
await page.waitForTimeout(1000);
```

### Interacting with the App

Use `page.evaluate()` to click buttons (the Vite DevTools dock can intercept Playwright's `locator.click()`):

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

### Complete Test Script Template

See the `svelte-dev-extension/tests/e2e/` directory for end-to-end test examples.

### Common Pitfalls

- **Dock overlay blocks clicks**: Use `page.evaluate()` instead of `locator.click()` for buttons near the bottom-right of the page (the Vite DevTools dock overlays this area).
- **Auth token expires**: The Manual Auth Token is single-use. Each browser connection generates a new one. Read it from tmux IMMEDIATELY after `page.goto()`.
- **Runtime script may not be loaded yet** (vanilla Svelte): Component initialization can race ahead of the runtime script loading. The `__SVELTE_DEVTOOLS_QUEUE__` mechanism handles this, but first-time setup may appear broken if you check `window.__SVELTE_DEVTOOLS_RUNTIME__` too early.
- **Iframe vs popup**: In headless browsers, `DocumentPictureInPicture` may not be available — the panel falls back to an iframe. Verify via `page.frames()` or the HTTP API instead.

## Mandatory: Time Travel Verification Procedure

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

1. **This file** (AGENTS.md) — get oriented
2. [Developer Docs Index](docs/INDEX.md) — build order, tests, package architecture
3. [Overview & Quick Start](docs/00_index.md) — what this is and why
4. [Architecture](docs/01_architecture.md) — system design and data flow
5. [Vite Plugin](docs/02_vite-plugin.md) — transforms, middleware, HTTP API
6. [Runtime](docs/03_runtime.md) — state handling and `postMessage` protocol
7. [Client UI](docs/04_client.md) — DevTools panel implementation
8. [Server Integration](docs/05_server.md) — SvelteKit request tracing
9. [API Reference](docs/06_api.md) — public APIs and type definitions
10. [Vite 8 Guide](docs/VITE.md) — Vite 8 / Rolldown internals and compatibility audit

## Existing Extension Docs

The extension itself has its own documentation under `svelte-dev-extension/docs/`:

- `00_index.md` — Overview, quick start, features
- `01_architecture.md` — System design, data flow, sequence diagrams
- `02_vite-plugin.md` — Build-time transforms and configuration
- `03_runtime.md` — Runtime state handling and `postMessage` events
- `04_client.md` — DevTools UI (iframe) implementation
- `05_server.md` — SvelteKit request tracing (experimental)
- `06_api.md` — Type definitions, public APIs
- `VITE.md` — Vite 8 guide and compatibility audit

These describe *how the extension works*. The docs in `docs/` describe *how to work on the project*.

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
