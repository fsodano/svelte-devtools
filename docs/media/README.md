# Product recordings

These images and silent videos show the included plain Svelte fixture with the real DevTools panel. The recorder makes actual MCP calls and browser fetches. It asserts application state and responses before writing the clips. No product UI is generated or composited.

## Agent state edit

[Watch the 12-second MP4](./agent-state-edit.mp4) or view the [animated preview](./agent-state-edit.gif).

1. Select the first of two `StateEditInstance` components. Its count is 1.
2. The MCP client discovers the active panel session and mounted instance. It calls `svelte_set_state` to set count to 7.
3. The first instance changes to 7. The second remains at 1.
4. Time Travel shows the baseline and changed state: 2/2 snapshots.
5. Undo restores count 1 and selects snapshot 1/2. Redo restores count 7 and selects 2/2.
6. Return to the component's current state.

The API token and dock authorization screens are excluded from the published clip. The exact session and instance IDs are discovered during recording.

## Request-to-mock workflow

[Watch the 11-second MP4](./network-mocking.mp4).

1. Fetch the fixture resource and inspect its real HTTP 200 response.
2. Choose **Mock this request**. The draft contains its URL and method.
3. Change the status to 201 and body to `{"mocked":true}`. Enable the rule.
4. Repeat the actual fetch and inspect the mocked response.
5. Disable the rule. The next request returns the original HTTP 200 response again.

The recorder waits for the rule message to reach the application before asserting its effect.

## Reproduce

From the repository root, build the workspaces and install the fixture. Install Chromium and make `ffmpeg` available on your path.

```bash
npm ci
npm run build
npm ci --prefix tests/apps/svelte
npx playwright install chromium
node scripts/record-readme-demo.mjs
```

The script uses port 5182, a temporary random API token, and a temporary raw video directory. It stops its own server when finished. It writes the published clips, screenshots, and [capture metadata](./capture.json) here. Videos are cropped to the actual panel bounds and compressed as H.264 MP4; the GIF is a lower-frame-rate preview of the same recording.

## SQLite trace inspection

[SQL trace screenshot](./sql-traces.png) shows actual SQLite calls from the Todo fixture after native and enhanced CRUD operations. The selected statement belongs to the displayed request trace. Durations measure synchronous query execution; bindings and result rows are omitted.

Run `node scripts/verify-ssr-sql.mjs` after building the packages and installing the Kit/Todo fixtures. The verifier writes fresh wide and narrow screenshots to its reported temporary artifact directory. The committed screenshot was selected from that verified run.

## Save a Todo and inspect each span

[Watch the recording](./todo-save-trace.mp4), [view the GIF](./todo-save-trace.gif), or [inspect the screenshot](./todo-save-trace.png). The recording starts after authorization. It shows typing and saving a real Todo, opening the SSR POST request, and selecting its executed INSERT in the waterfall. Both spans show measured durations. No product layout or response is fabricated.

Run `node scripts/record-sql-demo.mjs` after a root build and installation of Todo dependencies. Chromium and ffmpeg are required. The script owns port 5192 and a new temporary SQLite database. It verifies persistence, SQL/request parentage, SELECT visibility, and per-span timings before writing artifacts. [Capture metadata](./todo-save-capture.json) records the observed spans without tokens or bound values.
