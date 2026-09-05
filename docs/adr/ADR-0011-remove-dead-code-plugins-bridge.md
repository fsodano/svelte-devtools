# ADR-0011: Remove Dead Code, Plugin Decomposition and Bridge Package

## Status

Accepted (2026-08-12)

> **Implementation note (2026-08-12):** Shipped. `packages/bridge/` was deleted
> and the workspace shrank to four packages (`types`, `runtime`, `client`,
> `vite-plugin`). The six files under `packages/vite-plugin/src/plugins/`
> (`configure.ts`, `transform.ts`, `devtools-setup.ts`, `static-serve.ts`,
> `virtual-runtime.ts`, `optimizer.ts`) were removed, so `dist/plugins/` is no
> longer emitted and `tsc` no longer compiles them. The root `package.json`
> `watch` script no longer builds the bridge, and the stale `packages/bridge`
> entry was pruned from `package-lock.json`. The public API is unchanged: the
> monolithic `svelteDevTools()` export in `packages/vite-plugin/src/index.ts`
> still carries all behavior. Verified by a clean `npm run build` and a passing
> `npm test` with no bridge build step, plus the zero-importer greps under
> Verification.

## Context

Two pieces of the monorepo are dead weight: the six-file plugin decomposition and the bridge package. Both were designed in earlier ADRs, both were never wired into the live entry point, and neither has a single importer.

### The six unused plugin files

ADR-0005 (Plugin Composition Pattern) describes splitting the Vite plugin into six sub-plugins, each in its own file under `packages/vite-plugin/src/plugins/`:

- `configure.ts`: resolves user options and sets up the shared `api` object
- `transform.ts`: handles the `transform` hook injecting `$inspect` runes into `.svelte` files
- `devtools-setup.ts`: injects the DevTools setup script into the HTML page via `transformIndexHtml`
- `static-serve.ts`: serves the DevTools client bundle and static assets during dev
- `virtual-runtime.ts`: provides the runtime module as a virtual file (`virtual:svelte-devtools-runtime`)
- `optimizer.ts`: excludes the runtime from Vite's dependency optimization

ADR-0005's status note is blunt. The files "live in `src/plugins/*.ts` but are never imported, dead code (added in a single commit, 2026-07-24, and never wired into the entry point)." A repo-wide search for `./plugins` imports inside `packages/vite-plugin/src/` returns nothing.

### The unused bridge package

ADR-0003 (Birpc-Based RPC Communication Layer) proposes `packages/bridge/`, an abstract RPC transport built on `birpc`, with `PostMessageAdapter`, `WebSocketAdapter`, and shared RPC procedures. The package exists and builds, but ADR-0003's status note states: "**nothing imports it**."

`docs/INDEX.md:30` confirms the state of the package:

> `packages/bridge` (birpc RPC layer) is experimental and not yet wired into any package; there is no `build:bridge` script, but the `watch` script builds it for development.

A search for `svelte-devtools-bridge` across the repo finds references only in `package.json` (the root `watch` script), `package-lock.json`, and the package's own files. No source file in any package imports it.

### The live entry point is monolithic

`packages/vite-plugin/src/index.ts` exports `svelteDevTools()` as a single `Plugin` (line 41, default export at line 866). It imports `./migration-analyzer.js` and nothing else from the plugin's own source tree. The documented public API, the README, and the SvelteKit handle all target this monolithic export. No code imports the plugin sub-files, and no code imports the bridge.

## Decision

**Default: delete.** Remove the six files under `packages/vite-plugin/src/plugins/` and the entire `packages/bridge/` package, along with every reference to the bridge package in workspace configuration and documentation.

Rationale:

- Zero importers for both artifacts, verified by search.
- The live export is the monolithic `svelteDevTools()`, which already contains the behavior the sub-plugins would have factored out.
- ADR-0005 is marked "superseded in practice" and ADR-0003 is marked "not yet wired in"; neither represents a committed direction.
- `tsc` compiles everything under `src/`, so the six unused files are still type-checked and emitted into `dist/plugins/` on every build. Deleting them shrinks the plugin's dist output and removes build-time noise for no runtime cost.
- The bridge adds a workspace, a `birpc` dependency, and watch-mode build overhead for a feature with no consumer.

**Alternative: finish the wiring.** Keep the sub-plugins and bridge, complete the composition per ADR-0005's blueprint, and route the client through the bridge per ADR-0003. This is real work: it means rearchitecting the tested, working monolithic plugin, building a new RPC client in the panel, and accepting the risk that two experimental designs interact badly. Nothing currently depends on either artifact, so there is no user-facing pressure to do this now. If the direction is ever wanted, git history preserves both (the sub-plugins were added in a single commit on 2026-07-24).

## Consequences

If the deletion is implemented:

- **Package configuration**: Root `package.json` `watch` script (line 18) currently runs `npm run dev -w @fsodano/svelte-devtools-bridge`; that segment must be removed. `package-lock.json` must be regenerated with `npm install`. The workspace shrinks from five packages to four, which `docs/INDEX.md:4` ("npm-workspaces monorepo with 5 packages") must reflect.
- **Bridge package**: `packages/bridge/` (package.json, tsconfig.json, `src/adapter.ts`, `src/index.ts`, `src/post-message-adapter.ts`, `src/router.ts`, `src/websocket-adapter.ts`) is removed, dropping the `birpc` dependency and the unused `build`/`dev` scripts.
- **Plugin source**: The six files in `packages/vite-plugin/src/plugins/` are removed. `dist/plugins/` stops being emitted. No public API changes, because none of these files are exported from the package entry point.
- **Documentation**: `docs/INDEX.md:30` (the bridge note) and the bridge line in the package dependency diagram (line 73) are deleted. ADR-0003 and ADR-0005 status notes are updated to say the artifacts were removed rather than merely unwired. The README "Package Structure" section (which lists `bridge/`) and the "5 packages" claim in the acknowledgements are updated. `docs/04_client.md` references to the bridge are cleaned up.
- **Watch script**: Root `watch` no longer builds the bridge, removing one process from the dev loop.

## Verification

These commands verify the pre-implementation claim of zero importers (run before deleting anything, from the repo root):

```bash
# No source file may import the bridge package
grep -rn "svelte-devtools-bridge" packages/ --include="*.ts" --include="*.tsx" --include="*.svelte" --include="*.js" | grep -v "packages/bridge"

# No source file may import the plugin sub-files
grep -rn "from './plugins\|from \"\./plugins" packages/vite-plugin/src/ || true
```

Both must return nothing (the bridge grep will also hit its own package files unless filtered, hence the `grep -v "packages/bridge"`).

After the future implementation change lands, the acceptance gate is a clean build and a passing suite:

```bash
npm run clean
npm run build
npm test
```

`npm run build` must succeed without a bridge build step, and `npm test` (which runs the full build first) must pass. The public plugin API is unchanged, so the SvelteKit and plain-Vite test apps must still boot and register components against the DevTools HTTP API.
