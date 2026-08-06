---
name: verify-svelte-devtools
description: Use when verifying the Svelte DevTools plugin works end-to-end after changes. Covers building, serving, Vite DevTools authorization, opening the panel via DocumentPictureInPicture, verifying with Playwright, and checking the HTTP API. Also use when debugging agent accessibility issues or auth flow problems.
---

# Verifying Svelte DevTools End-to-End

After making changes to the Svelte DevTools plugin, runtime, or client UI, follow this verification workflow to confirm everything works.

## Quick Reference

```
Build → Start test app → Authorize Vite DevTools → Open Svelte panel → Check HTTP API
```

## Step 1: Build

```bash
npm run build
```

This builds all packages in order: types → runtime → vite-plugin → client.

If only the client UI changed:
```bash
npm run build:client -w @fsodano/svelte-devtools-client
```

## Step 2: Start a Test App

### Plain Vite + Svelte (recommended for quick iteration)

```bash
cd tests/apps/svelte
npx vite --port 5173
```

### SvelteKit (needed for SSR/hooks testing)

```bash
cd tests/apps/svelte-kit
npx vite dev --port 5174
```

## Step 3: Authorize Vite DevTools

The Vite DevTools requires authorization on first use. This is a one-time setup per browser session.

> **⚠️ Token caveat**: The Manual Auth Token printed in the terminal is **single-use** and is invalidated whenever a new WebSocket connection is established from the same origin. The HTTP `auth-verify` endpoint returns `403` with plain text `"Invalid or expired auth token"` on failure (not JSON). **Use the manual dialog method below — it is the only reliably working approach.**

### Authorize with Playwright (manual dialog — reliable):

```typescript
// 1. Click the "Unauthorized" button inside the web component shadow DOM
await page.evaluate(() => {
  const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  const btn = Array.from(dock?.querySelectorAll('button') || [])
    .find(b => b.textContent?.includes('Unauthorized'));
  btn?.click();
});
await page.waitForTimeout(300);

// 2. Read the Manual Auth Token from the server terminal (requires tmux)
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

// 4. Verify — dock buttons should NOT include "Unauthorized"
const dockState = await page.evaluate(() => {
  const d = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  if (!d) return [];
  return Array.from(d.querySelectorAll('button')).map(b => b.textContent?.trim());
});
console.log('Dock buttons:', dockState);
// Expect: ["Rolldown", "Svelte", "Settings", ...] (no "Unauthorized")
```

After authorization, the dock shows buttons for available DevTools plugins (e.g., "Rolldown", "Svelte", "Settings", notification badge).

## Step 4: Open the Svelte DevTools Panel

The plugin registers its dock entry as `type: 'iframe'` with `url: '/__svelte-devtools/'` (`DOCK_CONFIG` in `@fsodano/svelte-devtools-types`). How Vite DevTools Kit renders that iframe — embedded in the dock or in a **DocumentPictureInPicture popup window** — depends on the Kit version and browser. In Chromium with popup support it typically opens as a popup; in headless mode it falls back to an embedded iframe.

### Click the Svelte dock button:

```javascript
const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
const btn = dock?.querySelector('button[title="Svelte"]');
btn?.click();
```

After clicking, the DevTools client loads (`/__svelte-devtools/`) and begins:
- Polling `/__svelte-devtools/server-events?last=50` for server traces
- POSTing state to `/__svelte-devtools/api/sync` every 2 seconds
- Displaying the component tree, timeline, and snapshots

### Verify it loaded:

```bash
# Check the client UI is serving
curl -s http://localhost:5173/__svelte-devtools/ | grep -c "svelte"

# Check components are being tracked (sync happens every 2s)
curl -s http://localhost:5173/__svelte-devtools/api/components | jq '.count'
# Expect > 0 after the browser has been open for a few seconds
```

## Step 5: Verify via HTTP API (CI-safe)

All endpoints at `/__svelte-devtools/api/` return JSON with CORS headers.

### Status check

```bash
curl http://localhost:5173/__svelte-devtools/api/
```

Returns the plugin name, version, and available endpoints.

### Components

```bash
curl http://localhost:5173/__svelte-devtools/api/components | jq '.count, .components[].name'
```

Expect:
- `count > 0` after client sync
- Each component has `id` (svt-*), `name`, `state`, `props`, `filename`
- Child components have `parentId` linking to their parent

### Timeline

```bash
curl http://localhost:5173/__svelte-devtools/api/timeline | jq '.count'
```

Expect entries with types: `component:mount`, `state:change`, `effect:run`, `trace:trigger`, `server:request`.

### Server Events

```bash
curl http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'
```

Server request traces captured by the Vite plugin. Each event includes URL, method, status code, request/response bodies, and timing info.

### Snapshots (time-travel)

```bash
curl http://localhost:5173/__svelte-devtools/api/snapshots
```

Returns the branch/snapshot tree with parentId, branchId, and timestamps.

### Migration Score

```bash
curl http://localhost:5173/__svelte-devtools/api/migration
```

Svelte 4→5 migration progress per file (percentage and pattern breakdown).

### Routes (SvelteKit)

```bash
curl http://localhost:5173/__svelte-devtools/api/routes
```

SvelteKit route map scanned from `src/routes` (route groups, params, page/layout/api files).

### State Editing (set-state)

```bash
curl -X POST http://localhost:5173/__svelte-devtools/api/set-state \
  -H 'Content-Type: application/json' \
  -d '{"componentId": "svt-xxx", "key": "count", "value": 42}'
```

Updates cached component state on the server. The next client sync picks it up.

### Source File Lookup

```bash
curl "http://localhost:5173/__svelte-devtools/api/source?file=src/App.svelte"
```

Returns the source code of the specified file.

## Playwright: Interacting with the DevTools Panel

The DevTools panel loads as an **iframe** at `/__svelte-devtools/` (dock type `'iframe'`). In supported Chromium versions the Vite DevTools Kit may render it inside a `DocumentPictureInPicture` popup instead; when that happens, access the panel via `page.frames().find(f => f.url().includes('svelte-devtools'))`. The same-origin iframe (served from the same dev server) is accessible directly via `contentDocument` — no cross-origin issues.

### Accessing the DevTools iframe

```javascript
const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
const iframe = dock?.querySelector('iframe');
const doc = iframe.contentDocument || iframe.contentWindow?.document;
```

If the panel opened as a popup instead, use Playwright's frame locator:

```javascript
const popupFrame = page.frames().find(f => f.url().includes('svelte-devtools'));
await popupFrame.locator('button', { hasText: 'Time Travel' }).click();
```

### Full Playwright Verification Script

```typescript
import { chromium } from 'playwright';

async function verifyDevTools() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');

  // Wait for Vite DevTools dock
  await page.waitForSelector('vite-devtools-dock-embedded', { state: 'attached', timeout: 10000 });

  // Authorize if needed (token from terminal output, see Step 3)
  // Then open Svelte panel by clicking the dock button
  await page.evaluate(() => {
    const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
    dock?.querySelector('button[title="Svelte"]')?.click();
  });
  await page.waitForTimeout(3000);

  // Helper: evaluate JS inside the DevTools iframe
  async function devtoolsEval<T>(fn: (doc: Document) => T): Promise<T | null> {
    return page.evaluate((fnStr) => {
      const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
      const iframe = dock?.querySelector('iframe');
      if (!iframe) return null;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return null;
      return (new Function('doc', fnStr))(doc);
    }, fn.toString());
  }

  // Navigate to a tab in the sidebar
  async function clickTab(tabName: string) {
    await devtoolsEval((doc: Document) => {
      const buttons = doc.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim() === tabName) { btn.click(); break; }
      }
    });
    await page.waitForTimeout(1000);
  }

  // Click a button on the main page
  async function clickMainButton(text: string) {
    await page.evaluate((btnText) => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim() === btnText) { btn.click(); return; }
      }
    }, text);
    await page.waitForTimeout(1000);
  }

  // Verify via HTTP API (works even without panel open)
  const res = await page.request.get('http://localhost:5173/__svelte-devtools/api/components');
  const data = await res.json();
  console.log(`Components: ${data.count}`);

  await browser.close();
}
```

### Testing Time Travel Snapshots

The Time Travel tab (`TimeTravelConsole.svelte`) shows snapshots with undo/redo controls. Use the iframe access pattern to interact with them.

**Prerequisite — enable recording first:** The panel starts in "Paused" state. No snapshots are captured until you click the Record button (`.record-btn`). Without this, the panel shows "No snapshots — Click Record and interact with your app".

```typescript
// MUST DO FIRST: Click Record to enable snapshot capture
// Toggles the panel from "Paused" → "Recording"
await devtoolsEval((doc: Document) => {
  const btn = doc.querySelector('.record-btn');
  if (btn && !btn.classList.contains('recording')) btn.click();
});
await page.waitForTimeout(500);

// Read snapshot counter (e.g. "3 / 3")
const snapInfo = await devtoolsEval((doc: Document) => {
  const text = doc.body?.textContent || '';
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { current: +match[1], total: +match[2] } : null;
});

// Click Undo (first .tb-btn in TimeTravelConsole)
await devtoolsEval((doc: Document) => {
  const tbs = doc.querySelectorAll('.tb-btn');
  if (tbs.length > 0 && !(tbs[0] as HTMLButtonElement).disabled) tbs[0].click();
});

// Click Redo (second .tb-btn)
await devtoolsEval((doc: Document) => {
  const tbs = doc.querySelectorAll('.tb-btn');
  if (tbs.length > 1 && !(tbs[1] as HTMLButtonElement).disabled) tbs[1].click();
});

// Click a specific snapshot row (uses restore(idx, true) — truncates future)
await devtoolsEval((doc: Document) => {
  const rows = doc.querySelectorAll('[class*="row"]');
  if (rows.length > index) rows[index].querySelector('button')?.click();
});
```

**Verify no phantom snapshots:** After undo/redo operations, `snapInfo.total` must remain constant.

### Using `browser_run_code_unsafe` (Playwright MCP)

When using the Playwright MCP server, `browser_run_code_unsafe` gives you direct access to the `page` object for complex multi-step scripts:

```javascript
await browser_run_code_unsafe({
  code: `async (page) => {
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(2000);
    // ...full script with iframe access, button clicks, etc.
    return result;
  }`
});
```

### CI / headless mode

The DevTools iframe is accessible in headless mode since it's same-origin. All verification (components, timeline, snapshots) works without a visible browser window. The HTTP API is the CI-safe alternative.

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Auth dialog shows "Check your terminal" | Token not yet entered | Navigate to `.devtools/auth?id=<TOKEN>` using token from terminal |
| "Unauthorized access to method" | Old WebSocket client still connected | Refresh the page to get a fresh connection |
| `cachedAt: 0` in API response | No client has synced yet | Open the browser page and wait 2-3 seconds |
| Component count is 0 | DevTools panel hasn't been opened yet | Click "Svelte" dock button to trigger client init |
| Panel opens but is blank | Client bundle not built | Run `npm run build:client` |
| Dock shows "Unauthorized" after auth | Auth token expired or wrong | Re-authorize with fresh token from terminal |
| `isRecording is not defined` in console | Missing store prefix in Timeline.svelte | Check `devtoolsStore.isRecording` is used everywhere (not bare `isRecording`) |
| Server filter tab shows no entries | Event type mismatch between plugin and Timeline filter | The plugin emits `server:trace`/`server:error`, Timeline filter should use `e.type.startsWith('server:')` |
| Time Travel shows "No snapshots — Click Record and interact with your app" | Panel starts in "Paused" state; snapshot capture is not automatic | Click the Record button (`.record-btn` inside the DevTools iframe) to toggle "Paused" → "Recording" before interacting with the app |

## Verification Checklist

After any change to the devtools codebase, verify everything still works:

- [ ] Build passes (no TypeScript errors)
- [ ] Dev server starts without errors
- [ ] Vite DevTools dock appears and can be authorized
- [ ] Svelte panel opens (iframe dock; popup in supported Chromium)
- [ ] Components appear in tree with state
- [ ] Timeline populates with events
- [ ] HTTP API returns data for all endpoints
- [ ] Server events are captured (for SvelteKit or Vite proxy)
