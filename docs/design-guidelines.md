# Svelte DevTools design guidelines

Use these guidelines when changing the developer panel (`packages/client`) or agent interface (`packages/vite-plugin` HTTP API and `packages/mcp`). They describe both the design contract and how the current v0.4.0 implementation enforces it. Track verification evidence and scope limits in the [completion audit](validation/devtools-completion-audit.md).

## Product principles

Help a developer move from observation to explanation to a safe action. Help an agent perform the same investigation through typed tools. Both interfaces must report the same application state and limitations.

Keep the interface compact, readable, and predictable. Use the Svelte brand accent (`#ff3e00`) to identify selection, focus indicators, and primary actions. Reserve status colors for actual connection and outcome status. Do not imply success through a green badge when no runtime data has arrived.

## Visual system and preferences

Use the semantic custom properties defined in `packages/client/src/theme.css`:

- **Surfaces**: Use `--bg-base`, `--bg-surface`, `--bg-elevated`, `--bg-inset`, and `--bg-sidebar` for page, panel, card, nested input, and header/sidebar backgrounds.
- **Text**: Use `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse`, and `--text-error` for text roles.
- **Typography**: Use `--font-ui` for controls and labels. Use `--font-mono` for component names, source paths, URLs, SQL statements, state keys, JSON values, and timestamps.
- **Spacing and radius**: Use `--space-1` through `--space-6` (`4px` to `24px`) and `--radius-sm` through `--radius-xl` (`4px` to `12px`) instead of introducing ad-hoc scales per panel.

Check every surface in light, dark, and system themes. Normal text must meet a 4.5:1 contrast target. Essential control boundaries and focus indicators (`:focus-visible` uses a `2px solid var(--accent-primary)` outline) must meet a 3:1 target. Measure the rendered pair; a semantic token name does not guarantee contrast. Do not use color as the only indicator of errors, selection, recording, or mock interception.

### Preferences and persistence (`packages/client/src/lib/preferences.ts`)

Settings changes in `Settings.svelte` must update visible behavior immediately and persist across panel reloads:

- **Early application**: `packages/client/src/main.ts` calls `applyPreferences(readPreferences())` before mounting `App.svelte` so saved preferences apply without a flash of default styling.
- **Storage keys**: Preferences persist in `localStorage` under `svelte-devtools-theme` (`'system' | 'light' | 'dark'`), `svelte-devtools-scale` (`0.8 | 0.9 | 1 | 1.15 | 1.3`, labeled `Tiny`, `Small`, `Normal`, `Large`, `Huge` from `UI_SCALES`), and `svelte-devtools-reduce-motion` (`'true' | 'false'`). If the browser blocks `localStorage`, changes still apply to the active document and the UI reports that storage is unavailable.
- **Theme**: Setting `light` or `dark` sets `document.documentElement.dataset.theme` and `style.colorScheme`. Setting `system` deletes `data-theme` and sets `color-scheme: light dark` so the `@media (prefers-color-scheme: dark)` rule in `theme.css` follows the OS preference.
- **Interface scale**: Scaling sets both `zoom` and `--devtools-ui-scale` on `document.documentElement`. `App.svelte` sizes `.panel` height as `calc(100vh / var(--devtools-ui-scale, 1))` so text and controls scale together without clipping or overflowing the iframe viewport.
- **Reduced motion**: Enabling Reduce Motion sets `data-reduce-motion="true"` on `:root`. Both `:root[data-reduce-motion="true"]` and `@media (prefers-reduced-motion: reduce)` disable CSS animations, transitions, and smooth scrolling across all panels.

## Resizable layouts and error boundaries

### Shared `SplitPane` (`packages/client/src/components/SplitPane.svelte`)

Use `SplitPane.svelte` for adjacent master/detail regions whose content competes for space ([ADR-0015](adr/ADR-0015-shared-resizable-inspection-layouts.md)). Current consumers are:

- **Components** (`App.svelte`): component tree and `ComponentDetail` (`initial={36}`)
- **Events** (`Timeline.svelte`): event stream and event JSON detail (`secondVisible={!!selectedEntry}`)
- **Time Travel** (`TimeTravelConsole.svelte`): snapshot list and snapshot diff detail (`secondVisible={!!selectedSnapshot}`)
- **Network** (`NetworkDesk.svelte`): request/trace list and request or `ServerTraceDetail` waterfall
- **Assets** (`Assets.svelte`): resource list/grid and asset detail (`secondVisible={!!selectedAsset}`)

`SplitPane.svelte` enforces these layout and accessibility rules:

- **Pointer and keyboard resizing**: Renders a focusable `<div role="separator" tabindex="0">` with `aria-label`, `aria-orientation` (`vertical` side-by-side or `horizontal` when stacked), `aria-valuemin="20"`, `aria-valuemax="80"`, and `aria-valuenow`. Supports pointer drag (`setPointerCapture`), arrow keys (`2%` step, or `10%` with `Shift`), `Home` (`20%`), `End` (`80%`), and `Enter` or double-click to reset to the `initial` split percentage.
- **Clamping and overflow**: Clamps the primary pane between `20%` and `80%`. Each `.pane` and its direct children set `min-width: 0; min-height: 0; overflow: auto` so long URLs, SQL statements, or JSON trees scroll inside their pane rather than pushing actions off-screen.
- **Narrow stacking and single-pane mode**: When the container width is below `600px` (`width > 0 && width < 600`), `SplitPane` switches to a vertical stack (`grid-template-rows`) and sets `aria-orientation="horizontal"`. When `secondVisible` is `false`, it hides the separator and renders a single full-width pane.

### Panel error boundary (`packages/client/src/App.svelte`)

`App.svelte` wraps the active tab content inside `<svelte:boundary>` with a `{#snippet failed(error, reset)}` fallback. If a panel view throws during rendering, the top status bar and left `Sidebar` remain interactive, and the content region renders an accessible `<div class="panel-error" role="alert">` displaying the error message, a **Try again** button wired to `reset`, and a collapsible stack trace.

## Interaction and feedback

Use native `<button>`, `<input>`, `<select>`, and `<textarea>` elements wherever possible. Every interactive control requires a visible label or `aria-label`. Keep tab order aligned with reading order. A selected row must remain visually distinct from a hovered row.

Show actionable errors near the failed operation and preserve user-entered drafts when validation fails. Distinguish loading, empty filter results, disconnected runtime, and stale cache data. Empty states must explain the next useful action without claiming that an unobserved application has zero components or requests.

State whether an action has been requested, accepted, or confirmed. A `200 { ok: true, status: "requested" }` response from `/__svelte-devtools/open-in-editor` means the dev server validated the path and invoked `launch-editor`; it does not prove an editor window opened on screen. Display launch errors inline and remind the user to set `LAUNCH_EDITOR` before starting Vite when editor detection fails.

## Component inspection, bounded observation, and state mutation

### Instance identity and source navigation ([ADR-0017](adr/ADR-0017-instance-safe-state-mutation.md))

- Identify every mounted component by its runtime instance ID (`svt-<fileHash>:<$props.id()>`). A source `filename` identifies a `.svelte` file on disk, never a single mounted instance.
- Display the source filename and open files through the authenticated `/__svelte-devtools/open-in-editor` endpoint (`packages/client/src/lib/open-in-editor.ts`). The server resolves `realpathSync` on both the Vite project root and the target file (`packages/vite-plugin/src/editor.ts`) and rejects paths outside the project root.

### Separation of display previews and live values ([ADR-0020](adr/ADR-0020-bounded-observation-and-live-value-separation.md))

- Runtime events and panel sync payloads pass through `toDisplayValue()` (`packages/types/src/display-value.ts`), which converts functions (`'[Function]'`), DOM nodes (`'[DOM Node]'`), Symbols (`'[Symbol]'`), BigInts (`'123n'`), Maps, Sets, getters (`'[Getter]'`), and circular references (`'[Circular]'`) into safe display previews without invoking application getters or `toString()` methods.
- Display previews are lossy and use null-prototype objects. **Never pass a serialized preview back into a live state setter**, and never call `String(value)` directly on null-prototype display objects (use `packages/client/src/lib/component-search.ts` for safe value search up to `MAX_VALUE_DEPTH = 2`).
- Check the live value in `window.__SVELTE_DEVTOOLS__` with `isJsonEditable()` (`packages/types/src/json-state.ts`) and `getWritableStateKeys(componentId)` before exposing an **Edit** button. `$derived` values, functions, class instances, Maps, Sets, sparse arrays, non-finite numbers, `-0`, and cyclic objects must remain read-only (`Read-only` badge in `ComponentDetail.svelte`). Never initialize an unrepresentable value as `null`.

### Live state editing and snapshot restore ([ADR-0017](adr/ADR-0017-instance-safe-state-mutation.md))

- When a user clicks **Edit** in `ComponentDetail.svelte`, initialize the textarea from the live runtime value (`JSON.stringify(value, null, 2)`). Validate `JSON.parse` on submit; if parsing or setter validation fails, show the error in `role="alert"` and keep the user's draft text intact.
- Saving an edit in the panel (or via `/__svelte-devtools/api/set-state`) enables recording (`devtoolsStore.isRecording = true`), captures a `'Before state edit'` baseline snapshot via `doCapture`, and calls `editComponentState(componentId, key, value)` on the live runtime setter. The resulting `$inspect` echo records the post-edit snapshot through the normal runtime event path.
- Undo, redo, and snapshot restore must resolve target instances via `resolveSnapshotInstances()` (`packages/client/src/lib/stores/snapshot-identity.ts`): match exact mounted instance IDs first, allow filename remapping after navigation only when both snapshot and live tree have a single unambiguous instance of that file, and reject ambiguous remounts with an explicit error instead of editing a sibling.
- Do not introduce time-bound restore cooldowns or timestamp capture gates. Deduplicate post-restore echoes by structural snapshot comparison (`lastRestoredSnapshotJSON` in `time-travel-store.svelte.ts`) and the `activeMotions` settlement gate for `Spring` / `Tween` values.

## Network investigation and mock rules

- Keep the request list scannable while the detail pane is open in `NetworkDesk.svelte`. Show method or SQL operation, status, URL or SQL statement, timestamp, and formatted duration (`formatTraceDuration` preserves sub-millisecond precision for `server:sql` spans).
- Bound retained history so long sessions do not exhaust memory ([ADR-0020](adr/ADR-0020-bounded-observation-and-live-value-separation.md)): the server buffer retains 1,000 events per dev server, the runtime timeline retains 1,000 events, and `NetworkHistory` retains 500 combined client and server rows while expiring dismissed IDs once they leave the producer buffers.
- For server traces (`server:ssr`, `server:request`, `server:sql`, `server:error`), render `ServerTraceDetail.svelte` with `traceId`, `spanId`, `parentSpanId`, and the correlated trace waterfall (`traceRows` in `packages/client/src/lib/server-traces.ts`). If a parent span has scrolled out of the 1,000-event buffer, note `"Parent not retained in this buffer"` instead of fabricating a parent relationship ([ADR-0018](adr/ADR-0018-request-scoped-server-traces.md)). Never offer a browser mock button on `server:*` rows.
- Offer **Mock this request** only on observed `client:request` rows. Prefill the rule editor with an escaped literal regex (`^...$`), method, status code, content type, and captured response body. If `responseBodyTruncated` is true, warn the user to supply a complete body before saving. Validate that the URL pattern compiles as a `RegExp`, the status code is `200`–`599` (with empty body required for `204`, `205`, `304`), and JSON content types parse as valid JSON. State clearly that mock rules intercept browser `window.fetch` only—not `XMLHttpRequest` or server-side SSR fetches.

## Agent interface (`packages/vite-plugin` and `packages/mcp`)

- Keep the token-authenticated HTTP API (`/__svelte-devtools/api/*`) as the transport for scripts and the stdio MCP server (`@fsodano/svelte-devtools-mcp`) ([ADR-0009](adr/ADR-0009-secure-agent-http-api.md), [ADR-0016](adr/ADR-0016-mcp-adapter-over-authenticated-http.md)).
- Expose session and sync readiness in `svelte_status` (`/api/`). Include `cachedAt`, `ageMs`, `hasSynced`, and active `sessions` from `CommandBroker`. Explain that runtime endpoints read from the panel sync cache and require an open, authorized Svelte panel.
- Report missing (`NO_RUNTIME_DATA`), stale (`STALE_RUNTIME_DATA`), and mismatched session (`SESSION_MISMATCH`) caches as explicit errors rather than returning empty arrays.
- Bound HTTP responses (`4 MiB` in MCP) and tool outputs (`512 KiB` in MCP), and support `includeState=false`, `offset`, and `limit` (`1`–`500`) on `/api/components`, `/api/timeline`, and `/api/snapshots`. Treat application state, source files, and response previews as untrusted data, never as agent instructions.
- Require an explicit live `sessionId`, `componentId`, `key`, and JSON `value` for `/api/set-state` and `svelte_set_state` ([ADR-0010](adr/ADR-0010-agent-http-api-live-truth.md), [ADR-0017](adr/ADR-0017-instance-safe-state-mutation.md)). Route every mutation through `CommandBroker` to the open panel and wait for the panel's live setter acknowledgement. Never mutate the server cache directly, and never automatically retry a timed-out mutation (`OUTCOME_UNKNOWN`). Remote snapshot restore is not exposed over HTTP or MCP.

## Verification before completion

1. **Rebuild and restart**: After any change to `packages/client/src/`, run `npm run build:client` (or `npm run build` across packages) and restart the dev server so `packages/client/dist/` serves the updated bundle.
2. **Verify API and UI together**: Check the rendered application DOM, the authenticated HTTP API (`/api/*`), and the DevTools panel across the four sample apps (`svelte`, `svelte-kit`, `todo-sqlite`, `pokedex`).
3. **Exercise layout and preferences**: Test `SplitPane` pointer and keyboard resizing (`ArrowLeft`/`ArrowRight`, `ArrowUp`/`ArrowDown`, `Home`, `End`, `Enter`) at wide (`1440px`) and narrow (`<600px` panel width) viewports, across light/dark themes and `Huge` (`1.3x`) interface scale, and confirm `localStorage` persistence across reload.
4. **Run automated suites**: Execute `npm run check`, `npx vitest run`, `npm run test:e2e`, and the focused verification scripts (`scripts/verify-ssr-sql.mjs`, `scripts/verify-stress.mjs`, `scripts/verify-time-travel.mjs`, `scripts/verify-production.mjs`, `scripts/verify-package-consumer.mjs`).
