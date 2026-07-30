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
npm run build:client -w @svelte-devtools/client
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

### Authorize from a browser:

1. Open `http://localhost:5173/` in the browser
2. Click the **"Unauthorized"** button at the bottom of the page (inside the `vite-devtools-dock-embedded` web component shadow DOM)
3. An authorization dialog appears with a message: *"Check your terminal for the authorization prompt and come back."*
4. The terminal running the Vite dev server shows a prompt with a **Manual Auth Token** (e.g., `clean-lands-mate`)
5. Navigate to `http://localhost:5173/.devtools/auth?id=<TOKEN>` using the auth token from the terminal
6. The page shows "✅ Authorized! You can close this window now."

### Authorize programmatically with Playwright:

```typescript
// 1. Click the "Unauthorized" button inside the web component shadow DOM
await page.evaluate(() => {
  const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
  dock?.querySelector('button')?.click();
});

// 2. Get the auth token from the terminal output (requires tmux or log parsing)
// 3. Navigate to the auth URL
await page.goto('http://localhost:5173/.devtools/auth?id=<TOKEN>');
```

After authorization, the dock shows buttons for available DevTools plugins (e.g., "Rolldown", "Svelte", "Settings", notification badge).

## Step 4: Open the Svelte DevTools Panel

The Svelte DevTools opens as a **DocumentPictureInPicture popup window** (not an iframe).

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

The Svelte DevTools panel loads as an **iframe** inside the `vite-devtools-dock-embedded` web component's shadow DOM (not DocumentPictureInPicture). The dock type is configured as `'iframe'` in `DOCK_CONFIG`.

### Accessing the DevTools iframe

```javascript
const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
const iframe = dock?.querySelector('iframe');
const doc = iframe.contentDocument || iframe.contentWindow?.document;
```

Since the iframe is same-origin (served from the same dev server), `contentDocument` is accessible directly — no cross-origin issues.

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

The Time Travel tab (`TimeTravelConsole.svelte`) shows snapshots with undo/redo controls. Use the iframe access pattern to interact with them:

```typescript
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

## Verification Checklist

After any change to the devtools codebase, verify everything still works:

- [ ] Build passes (no TypeScript errors)
- [ ] Dev server starts without errors
- [ ] Vite DevTools dock appears and can be authorized
- [ ] Svelte panel opens (DocumentPictureInPicture popup)
- [ ] Components appear in tree with state
- [ ] Timeline populates with events
- [ ] HTTP API returns data for all endpoints
- [ ] Server events are captured (for SvelteKit or Vite proxy)
