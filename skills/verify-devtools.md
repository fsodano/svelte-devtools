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

## Full Playwright Verification Script

```typescript
import { chromium } from 'playwright';

async function verifyDevTools() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');

  // Wait for Vite DevTools dock
  await page.waitForSelector('vite-devtools-dock-embedded', { state: 'attached', timeout: 10000 });

  // Authorize (only needed once per browser)
  await page.evaluate(() => {
    const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
    dock?.querySelector('button')?.click();
  });
  await page.waitForTimeout(1000);

  // The auth token must be obtained from the terminal output.
  // See Step 3 above. Navigate to the auth URL:
  await page.goto('http://localhost:5173/.devtools/auth?id=<TOKEN>');

  // Return to the app
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000);

  // Open Svelte panel
  await page.evaluate(() => {
    const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
    dock?.querySelector('button[title="Svelte"]')?.click();
  });
  await page.waitForTimeout(2000);

  // Verify via HTTP API
  const res = await page.request.get('http://localhost:5173/__svelte-devtools/api/components');
  const data = await res.json();
  console.log(`Components: ${data.count}`);
  console.log('Names:', data.components.map((c: any) => c.name));

  await browser.close();
}
```

**Note:** `DocumentPictureInPicture` popups cannot be opened in headless Playwright. For CI, verify via the HTTP API alone.

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
