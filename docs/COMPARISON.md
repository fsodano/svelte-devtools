# Svelte DevTools panel vs React/Vite-like DevTools comparison

Scope: `packages/client` UI behavior in this workspace, with practical parity checks against the React DevTools experience.

## What is included

- This repository’s panel runs in the Vite DevTools iframe under `/__svelte-devtools/`.
- The comparison is based on source evidence in this repo and explicit user-facing docs in `docs/04_client.md`.
- The focus is UI inspection parity, not host runtime transport parity.

## Comparison matrix

| Area | React/Vite-like expectation | Svelte DevTools behavior in this repo | Status | Evidence |
|---|---|---|---|---|
| Component tree | Show mounted instances, hierarchy, per-instance selection | Tree lists component instances with parent/child relationship, render duration, and detail selection. | ✅ Implemented | `packages/client/src/components/ComponentTree.svelte` |
| Search across components | Fast text search by component name/type/fields | Built-in search field in Components tab filters by name, filename, state key, and state value (up to 2 levels deep; props are not searched). Press Escape to clear the query. | ⚠️ Partial | `packages/client/src/components/ComponentTree.svelte`, `packages/client/src/lib/component-search.ts`, `tests/e2e/panel-workflows.spec.ts` |
| Per-instance inspection and state | Click/select one instance and inspect live state/props | `ComponentDetail` renders props/state/DOM/source for the selected component ID. | ✅ Implemented | `packages/client/src/components/ComponentDetail.svelte`, `packages/client/src/lib/stores/devtools-store.svelte.ts` |
| Source navigation | Open source location from component tree | Source action opens a configured local editor and reports launch errors. | ✅ Implemented | `packages/client/src/lib/open-in-editor.ts` |
| Timeline/insight events | Show commits and render/state events | Event stream supports filtered categories and detail JSON panels. | ✅ Implemented | `packages/client/src/components/Timeline.svelte` |
| Profiler-like metrics | Render performance profile by commit | Timeline has timing and duration per event but no React-style profiler tab. | ⚠️ Partial | `packages/client/src/lib/stores/devtools-store.svelte.ts`, `docs/04_client.md` |
| Time travel | Snapshot/state undo-redo from timeline history | Record/pause, undo/redo, restore, and snapshot diff panel are present. | ✅ Implemented | `packages/client/src/components/TimeTravelConsole.svelte`, `packages/client/src/lib/stores/time-travel-store.svelte.ts` |
| Network tracing | Request list with request/response details | Request list includes client fetches and explicit server/DB traces; includes mock rule editor. | ✅ Implemented | `packages/client/src/components/NetworkDesk.svelte` |
| Mock responses | Create and replay request variants from captured calls | Mock rules can be created from request rows and enabled/disabled in-browser. | ✅ Implemented | `packages/client/src/components/NetworkDesk.svelte` |
| Graph views | Show component relation graph | Graph tab renders force-directed component graph. | ✅ Implemented | `packages/client/src/components/ComponentGraph.svelte` |
| Graph-to-detail navigation | Jump from graph node to instance detail | Double-clicking a graph node switches to the Components tab and selects that instance. The header states the shortcut. | ✅ Implemented | `packages/client/src/App.svelte`, `packages/client/src/components/ComponentGraph.svelte`, `tests/e2e/panel-workflows.spec.ts` |
| Router and assets panels | Extra project tooling views | Dedicated Router and Assets panels exist (route inventory, resource timings). | ✅ Implemented | `packages/client/src/components/RouterHub.svelte`, `packages/client/src/components/Assets.svelte` |
| Inspector mode integration | Select on-page element and jump to component | Toolbar “inspect” button toggles parent inspection callback and selects component in panel. | ✅ Implemented | `packages/client/src/App.svelte`, `packages/client/src/lib/stores/devtools-store.svelte.ts` |
| Store inspector | Dedicated Redux/Pinia-like store browser | No dedicated store graph; Svelte stores are shown as component state only. | ⚠️ Missing | `docs/04_client.md`, `packages/client/src/components/ComponentDetail.svelte` |
| Global request replay/history | Browser-like network replay + commit compare | No React-like network replay timeline; request rows are inspect-and-mock oriented. | ⚠️ Missing | `docs/04_client.md`, `docs/validation/devtools-completion-audit.md` |

## Scope boundaries (important)

- Mocking is browser-`fetch` only; native `XMLHttpRequest` and server fetches are not mocked by panel rules.
- Time travel updates component state only; it intentionally does not undo database or side effects.
- SvelteKit route and server-event tools are extra context, but not equivalent to React app profiler coverage.
- Every panel view listed in this matrix is mounted by `App.svelte`. The panel has no unmounted view and no unreferenced component.

## Evidence-backed gap list from this checkpoint

### Implemented in this cycle
1. **Graph navigation to component detail**
   - `ComponentGraph` now sends the selected component ID back to `App`.
   - On double-click, the active tab switches to `Components`, and the selected node is opened in `ComponentDetail`.
   - The double-click handler reads the node from the double-click event itself, so a stale single-click selection cannot open the wrong instance.
   - The graph header states the shortcut.
   - Existing DOM highlight behavior is preserved as an in-panel optional affordance.

### Fixes left (explicitly deferred)
1. **Search field coverage**
   - The Components tab filters by component name, file name, state key, and state value. The filter lives in `ComponentTree.svelte` and uses `packages/client/src/lib/component-search.ts`.
   - Props are not searched, and state values are searched two levels deep.
2. **React-like profiler mode**
   - Not yet implemented because the request is scoped to practical parity only, not a full profiler feature rewrite.
3. **Store inspector panel**
   - Out of current scope; no dedicated Redux-style store tree is present.

## Why this file exists

This matrix helps avoid hidden drift between feature intent and active UI behavior.
The intent is to keep edits minimal and evidence-based, and to avoid claiming parity where none exists.
