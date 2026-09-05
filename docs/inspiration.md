# Vue DevTools Feature Analysis — Adaptation for Svelte DevTools

> This comparison contains design context as well as implemented features. For source release 0.2.0, use the [client guide](04_client.md), [server tracing](05_server.md), and [MCP contract](07_mcp.md). Opt-in synchronous SQLite tracing is available; the server guide defines its scope.

> Analysis date: 2026-07-23
> Source: https://github.com/vuejs/devtools
> Status update: 2026-08-04 — adaptation status refreshed against the current `packages/client` source.

> Current status: use the [completion audit](validation/devtools-completion-audit.md). The feature statuses below are a historical comparison and are not current validation results.

## 1. Architecture Overview

Vue DevTools is structured across these packages:

| Package | Purpose | Our Equivalent |
|---------|---------|----------------|
| `packages/app` | Main app shell (sidebar, layout) | `packages/client/` |
| `packages/client` | Tab pages (components, router, timeline, etc.) | `packages/client/src/components/` |
| `packages/core` | Core logic (RPC, state management, Vue plugin) | `packages/runtime/` |
| `packages/ui` | Reusable UI components (Button, Badge, DarkToggle, etc.) | Inline in `packages/client/` |
| `packages/vite` | Vite plugin | `packages/vite-plugin/` |
| `packages/shared` | Constants, env detection, utilities | `packages/types/` |
| `packages/devtools-kit` | Public API types and helpers | `packages/types/` |
| `packages/overlay` | In-app overlay | Not implemented yet |

## 2. Tab/Page Features (Full Inventory)

### 2a. Dashboard / Overview (`pages/overview.vue`)
- Shows DevTools version (from core/package.json)
- Shows Vue version (from connected app)
- Component count (recursive tree walk)
- Page count (from router info)
- Uses RPC: `rpc.value.getRouterInfo()`, `rpc.value.getInspectorTree()`
- Event-driven updates via `ROUTER_INFO_UPDATED`, `INSPECTOR_TREE_UPDATED`

**Svelte adaptation**: ✅ `Dashboard.svelte` (Info tab) — connection status, versions, stat cards. Route count integration not yet done.

### 2b. Components Inspector (`pages/components.vue`)
- Sidebar with component tree (searchable, expandable)
- Detail panel showing props, state, computed, events, slots
- **Element highlighting**: Hover component in tree → overlay on page (`onInspectComponentStart`/`End`)
- **State editing**: Click value → inline input → RPC to update
- **Tags**: Badges for `Pinia`, `Router`, `Slot`, `Emit` etc.
- **Source link**: Click to open in editor (via `openInEditor` composable)
- **Custom inspector tabs**: Plugins can register custom tabs

**Svelte adaptation**: ✅ `ComponentTree.svelte` (search, render-duration badges, go-to-source) + `ComponentDetail.svelte` (Props/State/DOM/Source sub-tabs). ✅ Element highlighting via the runtime's inspect overlay (`enableInspector`/`disableInspector`, hover overlay + click-to-select). ✅ Version 0.1.0 adds an inline JSON state editor and acknowledged session-targeted HTTP/MCP edits. Derived and non-JSON values remain read-only. Slot detection and more tag types not implemented.

### 2c. Router Inspector (`pages/router.vue`)
- `Router` panel component from `@vue/devtools-applet`
- Lists all routes with their paths
- **Click route to navigate**: Uses router's native navigate function
- Shows current active route highlighted
- Route metadata (name, path, component, props, etc.)

**Svelte adaptation**: ✅ `RouterHub.svelte` — route listing from `/api/routes` (filesystem scan of the configured SvelteKit routes directory), badges for page/layout/api/error, **click-to-navigate** via `svelte-devtools-navigate` postMessage to the parent. Active-route highlighting not implemented.

### 2d. Timeline (`pages/timeline.vue`)
- Category filters: Mouse, Keyboard, Component events, Performance
- Layer-based event visualization
- App record switching (multi-app support)
- Splitpanes for responsive layout
- `SelectiveList` + `Timeline` components from `@vue/devtools-applet`

**Svelte adaptation**: ✅ `Timeline.svelte` (Events tab) — **filter chips** (All/Components/State/Effects/Server/Client Requests), resizable detail panel with `JsonTree`. Layer-based visualization and multi-app switching not implemented.

### 2e. Component Graph (`pages/graph.vue`)
- Uses **vis-network** library (D3-based force-directed graph)
- Nodes = components, Edges = relationships
- **Select node** → opens GraphDrawer with details (refs, deps)
- **Filter by node ID** → centers graph on that node
- **Stabilizing animation** with modal
- Watch for `graphModuleUpdated` event via RPC

**Svelte adaptation**: ✅ `ComponentGraph.svelte` (Graph tab) — now uses **vis-network** force-directed graph of parent→child relationships. Node selection/detail drawer not implemented.

### 2f. Assets (`pages/assets.vue`)
- File explorer with grid/list view toggle
- Search via Fuse.js fuzzy matching
- Filter by file extension
- Folder tree organization
- Shows relative paths, file sizes
- Serves from Vite plugin via RPC

**Svelte adaptation**: ⚠️ `Assets.svelte` (Assets tab) — shows a `PerformanceResourceTiming` resource list instead of a file explorer. File-system explorer not implemented.

### 2g. Settings (`pages/settings.vue`)
- **DarkToggle** — theme toggle (light/dark/system)
- **Scale** — font size (Tiny/Normal/Large/Huge)
- **Minimize panel** — auto-hide after inactivity
- **Tab customization** — hide/show tabs, pin tabs, reorder
- **Reduce motion** — disable animations
- **Close on outside click**
- **Reset settings** — clear all preferences

**Svelte adaptation**: ✅ `Settings.svelte` (Settings tab) — font scale, reduce motion, theme (localStorage-backed). Tab customization and minimize-panel not implemented.

### 2h. Pinia (State Management) (`pages/pinia.vue`)
- Dedicated state management inspector
- Lists stores, shows state/actions/getters
- Time-travel debugging per store
- Integrated with Vue DevTools' custom inspector API

**Svelte adaptation**: ✅ Time Travel tab exists (`TimeTravelConsole.svelte`) with snapshot capture/restore, undo/redo, and a diff view. A dedicated store inspector is not implemented. Component rune inspection does not imply full coverage of stores or standalone `.svelte.ts` modules.

## 3. UI Component Library (`packages/ui/src/components/`)

| Component | Purpose | Status |
|-----------|---------|--------|
| `DarkToggle.vue` | Light/dark/system theme toggle | ✅ Done (App.svelte) |
| `Badge.vue` | Colored status badge | Partial (inline) |
| `Button.vue` | Styled button | Not needed |
| `Card.vue` | Card container | Not needed |
| `Checkbox.vue` | Checkbox input | Not needed |
| `CodeBlock.vue` | Code display with syntax highlighting | Not needed |
| `Confirm.vue` | Confirmation dialog | Not needed |
| `Dialog.vue` | Modal dialog | Done (detail overlays) |
| `Drawer.vue` | Slide-in panel | ✅ Done (Network detail split) |
| `Dropdown.vue` | Dropdown menu | Not needed |
| `DropdownButton.vue` | Button with dropdown | Not needed |
| `FormField.vue` | Form field wrapper | Not needed |
| `Icon.vue` / `IcIcon.vue` | Icon component | Done (inline SVGs) |
| `Input.vue` | Text input | Not needed |
| `LoadingIndicator.vue` | Loading spinner | Not needed |
| `Notification.vue` | Toast notification | Not needed |
| `Overlay.vue` | Overlay | Done (detail overlays) |
| `Select.vue` | Select dropdown | Not needed |
| `Switch.vue` | Toggle switch | Not needed |
| `Tooltip.vue` | Tooltip | Not needed |

## 4. RPC Architecture

Vue DevTools uses a sophisticated RPC layer:

```typescript
import { rpc } from '@vue/devtools-core'
// Get data
rpc.value.getRouterInfo().then(data => ...)
rpc.value.getInspectorTree({ inspectorId: 'components', filter: '' })

// Subscribe to events
rpc.functions.on(DevToolsMessagingEvents.ROUTER_INFO_UPDATED, handler)
rpc.functions.on(DevToolsMessagingEvents.INSPECTOR_TREE_UPDATED, handler)

// Emit events
rpc.value.emit('toggle-panel', false)

// Vite-specific RPC
import { onViteRpcConnected, viteRpc } from '@vue/devtools-core'
onViteRpcConnected(() => { ... })
viteRpc.value.getRoot()
```

**Svelte adaptation**: We use `@vitejs/devtools-kit` RPC + postMessage bridge. Consider unifying under a single RPC pattern.

## 5. Custom Inspector API (Plugin System)

Vue DevTools allows plugins to register custom inspector tabs:

```typescript
const { registeredInspector } = useCustomInspector()
// Returns all registered custom inspectors from plugins
const vueRouterInspector = registeredInspector.value?.find(
  item => item.packageName === 'vue-router'
)
```

**Svelte adaptation**: Not needed yet. Future consideration for Svelte library authors.

## 6. Open in Editor

Vue DevTools has an `openInEditor` composable that:
- Detects Vite + `@vue/devtools` for native editor opening
- Falls back to copying the file path
- Uses `vueInspectorDetected` flag

**Svelte adaptation**: Already implemented via `open-in-editor.js` composable.

## 7. Priority Implementation Queue

> **Update (2026-08-04):** The P0/P1 items below are now **implemented** (Router click-to-navigate ✅, component detail panel redesign ✅, Settings page ✅, Timeline category filters ✅). Remaining backlog:

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| Complete in 0.1.0 | Inline JSON state editing in the component detail panel | — | — |
| **P2** | Assets file explorer (filesystem via plugin) | Large | Medium |
| **P2** | Graph node selection + detail drawer | Medium | Medium |
| **P2** | Active-route highlighting in RouterHub | Small | Medium |
| **P3** | Custom inspector/tab API | Large | Low |
| **P3** | Layer-based timeline visualization | Medium | Medium |
