# Runtime

The runtime package (`packages/runtime`) receives state changes from injected `$inspect` hooks and emits events for the DevTools UI via `postMessage`.

## Loading

The runtime script is loaded by the Vite plugin via `transformIndexHtml`:

```html
<script type="module" src="/__svelte-devtools/svelte-runtime.js"></script>
```

For SvelteKit SSR apps, inject via `hooks.server.ts`:

```typescript
export const handle = async ({ event, resolve }) => {
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      return html.replace('</head>',
        `<script type="module" src="/__svelte-devtools/svelte-runtime.js"></script></head>`);
    }
  });
};
```

## Global APIs

The runtime exposes the following global API:

### `window.__SVELTE_DEVTOOLS_RUNTIME__`

The main runtime instance with the following API:

```typescript
interface SvelteDevToolsRuntime {
  version: string;

  // Initialize the runtime (called automatically on load)
  init(): void;

  // Handle state change from $inspect (called by injected code)
  handleState(componentId: string, key: string, type: string, value: unknown): void;

  // Register a component (called by injected code)
  registerComponent(id: string, name: string, filename: string): void;

  // Emit an event (used internally)
  emit(event: RuntimeEvent): void;

  // Get internal state
  getState(): DevToolsState;

  // Get all tracked components
  getAllComponents(): ComponentState[];
}
```

### `window.__SVELTE_DEVTOOLS_REGISTRY__`

A fallback `Map<string, ComponentMeta>` populated by injected component code:

```typescript
interface ComponentMeta {
  id: string;
  name: string;
  filename: string;
}

// Example
window.__SVELTE_DEVTOOLS_REGISTRY__.get('svt-abc123');
// { id: 'svt-abc123', name: 'Counter', filename: '/src/lib/Counter.svelte' }
```

## Event System

The runtime emits events via `postMessage`:

```typescript
window.postMessage({
  source: 'svelte-devtools',
  type: 'component-register', // or 'state', 'runtime-ready'
  payload: {
    id: 'svt-abc123',
    name: 'Counter',
    filename: '/src/lib/Counter.svelte',
    timestamp: performance.now()
  }
}, '*');

// Listen in the DevTools iframe
window.addEventListener('message', (event) => {
  if (event.data.source !== 'svelte-devtools') return;
  // Handle event.data.type and event.data.payload
});
```

### Event Types

| Type | Description |
|------|-------------|
| `runtime-ready` | Runtime initialized |
| `component-register` | Component registered |
| `state` | State variable changed |

### Event Payload Structure

```typescript
interface RuntimeEvent {
  type: string;
  componentId: string;
  componentName?: string;
  filename?: string;
  key?: string;
  value?: unknown;
  timestamp: number;
}
```

## How $inspect Injection Works

The Vite plugin transforms Svelte files to inject `$inspect` hooks:

### Original Code

```svelte
<script>
  let count = $state(0);
</script>
```

### Transformed Code

```svelte
<script>
  let count = $state(0);
  $inspect(count).with((type, value) => {
    if (typeof window !== 'undefined' && window.__SVELTE_DEVTOOLS_RUNTIME__) {
      window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('svt-abc123', 'count', type, value);
    }
  });
</script>
```

### State Handler

The runtime's `handleState` function:

```typescript
handleState(componentId: string, key: string, type: string, value: unknown): void {
  let component = this.components.get(componentId);

  if (!component) {
    // Create placeholder if component not yet registered
    component = {
      id: componentId,
      name: 'Unknown',
      filename: undefined,
      state: new Map()
    };
    this.components.set(componentId, component);
  }

  component.state.set(key, value);

  this.emit({
    type: 'state',
    componentId,
    componentName: component.name,
    key,
    value,
    timestamp: performance.now()
  });
}
```

## Component Registration

Components are registered via injected code:

```javascript
// Injected by Vite plugin into each .svelte file
if (typeof window !== 'undefined') {
  window.__SVELTE_DEVTOOLS_REGISTRY__ ||= new Map();
  window.__SVELTE_DEVTOOLS_REGISTRY__.set('svt-abc123', {
    id: 'svt-abc123',
    name: 'Counter',
    filename: '/src/lib/Counter.svelte'
  });
}

// Also call runtime if available
if (typeof window !== 'undefined' && window.__SVELTE_DEVTOOLS_RUNTIME__) {
  window.__SVELTE_DEVTOOLS_RUNTIME__.registerComponent(
    'svt-abc123',
    'Counter',
    '/src/lib/Counter.svelte'
  );
}
```

This triggers a `component-register` event via postMessage that the DevTools UI receives.

## Registry Polling

The runtime polls the registry every 200ms to discover components that were registered before the runtime initialized:

```typescript
setInterval(() => {
  const registry = window.__SVELTE_DEVTOOLS_REGISTRY__;
  if (!registry) return;

  for (const [id, meta] of registry.entries()) {
    if (!this.components.has(id)) {
      this.registerComponent(id, meta.name, meta.filename);
    }
  }
}, 200);
```

## Architecture Summary

| Feature | Implementation |
|---------|----------------|
| Event Mechanism | `postMessage` |
| State Detection | `$inspect` injection |
| DOM Scanning | None |
| Polling | 200ms (registry discovery only) |

## Performance Considerations

- **$inspect Overhead**: Minimal - Svelte's official API
- **Event Emission**: `postMessage` is fast for cross-iframe communication
- **Memory**: Component state stored in Maps
- **GC**: No special cleanup needed - dev-only

## Debugging Tips

1. **Check runtime loaded**: `console.log(window.__SVELTE_DEVTOOLS_RUNTIME__)`
2. **Listen to postMessage**: `window.addEventListener('message', console.log)`
3. **Inspect state**: `window.__SVELTE_DEVTOOLS_RUNTIME__.getState()`
4. **List components**: `window.__SVELTE_DEVTOOLS_RUNTIME__.getAllComponents()`
