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

## Key Architecture (5‑second summary)

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
| **Run the test app(s)** | See [docs/03_development_workflow.md](docs/03_development_workflow.md) |
| **Verify via HTTP API** | `curl localhost:5173/__svelte-devtools/api/` — all REST endpoints |

## Verifying Work via HTTP API

The DevTools exposes a REST API at `/__svelte-devtools/api/` that agents can use to verify their changes without opening a browser.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/` | Plugin status, available endpoints |
| `GET` | `/api/components` | All registered components with state |
| `GET` | `/api/timeline` | Timeline events (mounts, state changes, effects) |
| `GET` | `/api/server-events` | Server request traces with response bodies |
| `GET` | `/api/migration` | Svelte 4→5 migration scores |
| `GET` | `/api/snapshots` | Snapshot branch tree (parentId, branchId, timestamps) |
| `POST` | `/api/set-state` | Edit component state (`{componentId, key, value}`) |
| `GET` | `/api/source?file=<path>` | Source code file lookup |
| `POST` | `/api/sync` | (internal) Client syncs runtime state here |

### Verification Workflow

```bash
# 1. Check plugin is loaded and running
curl http://localhost:5173/__svelte-devtools/api/

# 2. Check components are registered
curl http://localhost:5173/__svelte-devtools/api/components | jq '.count, .components[].name'

# 3. Check timeline events are flowing
curl http://localhost:5173/__svelte-devtools/api/timeline | jq '.count'

# 4. Check server traces (after navigating the test app)
curl http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'

# 5. Check migration scores
curl http://localhost:5173/__svelte-devtools/api/migration
```

### Verification Workflow (MANDATORY)

1. **Build** → `npm run build`
2. **API Check** → `curl localhost:5173/__svelte-devtools/api/<endpoint>` to verify JSON data
3. **UI Check** → Refresh browser at `localhost:5173` to verify visual result

The DevTools panel opens as a **popup window** (via `DocumentPictureInPicture`), not an iframe. The Vite DevTools icon at the bottom-right opens a command palette — the panel opens when a dock entry is triggered.

### Authorization (Vite DevTools)

Vite DevTools requires authorization on each new browser session. The terminal running the Vite dev server displays a **Manual Auth Token**.

**⚠️ Important timing caveat:** The Manual Auth Token is **single-use** and is **invalidated** whenever a new WebSocket connection is established from the same origin. The `auth-verify` HTTP endpoint returns `403` with plain text `"Invalid or expired auth token"` on failure (not JSON), making `res.json()` fragile. **Use the manual dialog method below — it is the only reliably working approach.**

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

- The DevTools panel opens as a **popup window** (via `DocumentPictureInPicture`), not an iframe.
- The Vite DevTools icon at the bottom-right opens a command palette — the panel opens when a dock entry is triggered.
- **Authorization** is required per browser session. The `Manual Auth Token` changes on each server restart.
- In headless browsers, `DocumentPictureInPicture` may not be available. For automated CI, verify via the HTTP API instead.

### HTTP API Verification (CI-safe)

```bash
# Check plugin is loaded and running
curl http://localhost:5173/__svelte-devtools/api/

# Check components are registered
curl http://localhost:5173/__svelte-devtools/api/components | jq '.count, .components[].name'

# Check timeline events are flowing
curl http://localhost:5173/__svelte-devtools/api/timeline | jq '.count'

# Check server traces (after navigating the test app)
curl http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'

# Check migration scores
curl http://localhost:5173/__svelte-devtools/api/migration
```

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
# 1. Build all packages
cd /Users/fsodano/fibradev/svelte-extension/svelte-dev-extension
npm run build

# 2. Start the test server in a tmux session
kill $(lsof -ti:5173) 2>/dev/null; sleep 0.5
tmux kill-session -t svelte-plain 2>/dev/null; sleep 0.5
tmux new-session -d -s svelte-plain \
  -c /Users/fsodano/fibradev/svelte-extension/svelte-dev-extension/tests/apps/svelte \
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

```mjs
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

## Reading Order

1. **This file** (AGENTS.md) — get oriented
2. [Project Overview](docs/00_project_overview.md) — what this is and why
3. [Directory Structure](docs/01_directory_structure.md) — where everything lives
4. [Package Architecture](docs/02_package_architecture.md) — how the packages fit together
5. [Development Workflow](docs/03_development_workflow.md) — build, test, run
6. [Test Projects](docs/04_test_projects.md) — test apps and how to use them
7. [Coding Conventions](docs/05_coding_conventions.md) — patterns to follow

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

## Project Rules

- All packages use **ESM** (`"type": "module"`)
- Svelte 5 runes mode (`compilerOptions: { runes: true }`)
- TypeScript strict mode
- No production code shipped — everything is `apply: 'serve'`
- `svelte-code-writer` skill available for Svelte 5 component work
- **NO timeline/restore/store capture code changes without explicit user approval**
- no time-bound cooldowns, no capture gating based on timestamps, no restore-related changes
- **NO commits unless the user explicitly says "commit", "push", or "PR"** — ask first, always
