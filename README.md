# Svelte DevTools

Real-time debugging for Svelte 5 apps via Vite DevTools Kit.

## Features

- **Component Tree**: Visualize component hierarchy
- **State Inspection**: Track `$state`, `$derived`, `$effect` in real-time
- **Timeline**: Event history (mounts, updates, effects) (planned)
- **Zero Prod Impact**: Dev-only, stripped from production builds

## Quick Start

```bash
npm install @svelte-devtools/vite-plugin
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

export default defineConfig({
  plugins: [
    sveltekit(),
    svelteDevTools()
  ]
});
```

Start your app — a floating Vite button appears. Click it and select the **Svelte** tab.

## How It Works

| Stage | What Happens |
|-------|--------------|
| **Build** | Vite plugin injects `$inspect` hooks into Svelte files |
| **Runtime** | State changes trigger callbacks → `postMessage` events |
| **UI** | DevTools iframe receives events and displays component tree |

```
.svelte file → [Vite Transform] → $inspect injection → Runtime handler → postMessage → DevTools UI
```

## Why $inspect?

Svelte 5 runes are **compile-time transforms** — they don't exist at runtime. The only way to track state is via `$inspect`, Svelte's official state observation API.

## Packages

```
packages/
├── vite-plugin/   # Build-time transforms
├── runtime/       # State handling, postMessage emission
├── client/       # DevTools iframe UI
└── types/        # Shared TypeScript types
```

## Docs

- [Docs](./docs) — System design and data flow

## License

MIT
