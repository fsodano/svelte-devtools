# API Reference

Public APIs and type definitions for Svelte DevTools.

## Global APIs

### `window.__SVELTE_DEVTOOLS_RUNTIME__`

The main API exposed by the runtime package:

```typescript
interface SvelteDevToolsRuntime {
  version: string;

  /** Initialize the runtime (called automatically on DOMContentLoaded) */
  init(): void;

  /**
   * Handle state change from $inspect (called by injected code)
   * @param componentId Component ID
   * @param key State variable name
   * @param type Change type ('init' | 'update')
   * @param value New value
   */
  handleState(componentId: string, key: string, type: string, value: unknown): void;

  /**
   * Register a component (called by injected code)
   * @param id Component ID
   * @param name Component name
   * @param filename Source filename
   */
  registerComponent(id: string, name: string, filename: string): void;

  /** Emit a devtools event via postMessage */
  emit(event: RuntimeEvent): void;

  /** Get current internal state */
  getState(): DevToolsState;

  /** Get all tracked components */
  getAllComponents(): ComponentState[];
}

// Events are emitted via postMessage:
// window.postMessage({ source: 'svelte-devtools', type: '...', payload: {...} }, '*')
// window.addEventListener('message', (e) => { if (e.data.source === 'svelte-devtools') ... })
```

### `window.__SVELTE_DEVTOOLS_REGISTRY__`

Build-time registry of component metadata (fallback for runtime):

```typescript
const registry: Map<string, ComponentMeta> = window.__SVELTE_DEVTOOLS_REGISTRY__;

// Example usage
const meta = registry.get('svt-abc123');
// { id: 'svt-abc123', name: 'Counter', filename: '/src/lib/Counter.svelte' }
```

## Type Definitions

### Component Types

```typescript
/**
 * Metadata about a component stored in the build-time registry.
 * Injected into each .svelte file by the Vite plugin.
 */
interface ComponentMeta {
  id: string;
  name: string;
  filename: string;
}

/**
 * Component state tracked at runtime.
 */
interface ComponentState {
  id: string;
  name: string;
  filename?: string;
  state: Map<string, unknown>;
}

/**
 * Component data sent to the UI client.
 * Serializable version for iframe communication.
 */
interface ComponentNode {
  id: string;
  name: string;
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  children: string[];
  parentId?: string;
  filename?: string;
  renderDuration?: number;
  sourceLocation?: SourceLocation;
}

/**
 * Source code location for "open in editor" functionality.
 */
interface SourceLocation {
  filename: string;
  line: number;
  column: number;
}
```

### Event Types

```typescript
/**
 * Runtime event emitted via postMessage.
 */
interface RuntimeEvent {
  type: 'runtime-ready' | 'component-register' | 'state';
  componentId: string;
  componentName?: string;
  filename?: string;
  key?: string;
  value?: unknown;
  timestamp: number;
}

/**
 * Timeline entry in the UI.
 */
interface TimelineEntry {
  id: string;
  type: string;
  timestamp: number;
  data: unknown;
  duration?: number;
}
```

### Bridge Types

```typescript
/**
 * Bridge event handler function.
 */
type BridgeHandler<T = unknown> = (payload: T) => void;
```

### Plugin Options

```typescript
/**
 * Options for the Vite plugin.
 */
interface SvelteDevToolsPluginOptions {
  /** Enable state inspection via $inspect injection (default: true) */
  enableStateInspection?: boolean;

  /** File patterns to include (default: [/\.svelte$/]) */
  include?: RegExp[];

  /** File patterns to exclude (default: [/node_modules/]) */
  exclude?: RegExp[];
}
```

### Server Types

```typescript
/**
 * Options for SvelteKit server integration (planned).
 */
interface SvelteKitDevtoolsOptions {
  /** Include trace headers in response (default: true) */
  includeTraceHeaders?: boolean;

  /** Trace load functions (default: true) */
  traceLoads?: boolean;

  /** Trace fetch calls (default: true) */
  traceFetches?: boolean;

  /** Custom sanitization function */
  sanitize?: (key: string, value: unknown) => unknown;
}

/**
 * Server-side event (planned).
 */
interface ServerEvent {
  type: 'server:load' | 'api:call' | 'db:query' | 'server:error';
  traceId: string;
  timestamp: number;
  duration?: number;
  data: unknown;
}
```

## Vite Plugin API

### `svelteDevTools()`

Creates the Vite plugin.

```typescript
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

const plugin = svelteDevTools(options?: SvelteDevToolsPluginOptions);
```

### Plugin Hooks

The plugin implements these Vite hooks:

#### `configResolved`

Captures the resolved Vite config and root directory.

#### `configureServer`

Sets up middleware to serve DevTools assets and the runtime script:

```typescript
configureServer(server) {
  // Serve /__svelte-devtools/* requests
  // - Runtime script from runtime/dist/
  // - Client UI from client/dist/ (SPA fallback)
}
```

#### `transformIndexHtml`

Injects the runtime script:

```typescript
transformIndexHtml(html) {
  return html.replace('</head>',
    `<script src="/__svelte-devtools/svelte-runtime.js"></script></head>`
  );
}
```

#### `transform`

Transforms `.svelte` files to inject:
1. Component registration calls
2. `$inspect` hooks for state tracking
3. `data-svelte-devtools-id` attributes

#### `devtools.setup`

Registers the DevTools dock with `@vitejs/devtools-kit`:

```typescript
devtools: {
  setup(ctx) {
    ctx.docks.register({
      id: 'svelte-devtools',
      title: 'Svelte',
      icon: 'simple-icons:svelte',
      type: 'iframe',
      url: '/__svelte-devtools/'
    });
  }
}
```

## Store API

The DevTools store provides reactive state for the UI.

```typescript
interface DevToolsStore {
  /** Array of all components */
  readonly components: ComponentNode[];

  /** ID of currently selected component */
  readonly selectedComponentId: string | null;

  /** Event timeline */
  readonly timeline: TimelineEntry[];

  /** Whether connected to runtime */
  readonly isConnected: boolean;

  /** Initialize the store and bridge */
  init(): void;

  /** Select a component by ID */
  selectComponent(id: string): void;
}
```

Usage:

```typescript
import { devtoolsStore } from '@svelte-devtools/client';

// Access reactive state
const components = $derived(devtoolsStore.components);

// Select a component
devtoolsStore.selectComponent('svt-abc123');
```

## Event Flow

Events flow through the system in this order:

1. **User code** modifies `$state`
2. **$inspect callback** fires and calls `handleState()`
3. **Runtime** emits `postMessage` event
4. **WindowBridge** receives and forwards to store
5. **Store** updates reactive state
6. **UI** re-renders with new data

Example event:

```typescript
// $inspect callback calls
window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('svt-abc123', 'count', 'update', 42);

// Runtime emits postMessage
window.postMessage({
  source: 'svelte-devtools',
  type: 'state',
  payload: {
    componentId: 'svt-abc123',
    key: 'count',
    value: 42,
    timestamp: 1234567890
  }
}, '*');

// Bridge receives
window.addEventListener('message', (event) => {
  if (event.data.source !== 'svelte-devtools') return;
  // event.data.type and event.data.payload
});

// Store updates
function handleStateChange(data: StateChangePayload) {
  components = components.map(c => {
    if (c.id === data.componentId) {
      return { ...c, state: { ...c.state, [data.key]: data.value } };
    }
    return c;
  });
}

// UI re-renders
<span>{component.state.count}</span>  // Now shows "42"
```

## Type Exports

All types are exported from `@svelte-devtools/types`:

```typescript
import type {
  ComponentMeta,
  ComponentState,
  ComponentNode,
  TimelineEntry,
  RuntimeEvent,
  BridgeHandler,
  SvelteDevToolsPluginOptions,
  // ... and more
} from '@svelte-devtools/types';
```
