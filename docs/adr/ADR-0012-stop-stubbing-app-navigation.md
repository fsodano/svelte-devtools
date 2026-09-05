# ADR-0012: Stop Stubbing SvelteKit App Navigation

## Status

Accepted (2026-08-12)

> **Implementation note (2026-08-12):** Phase 2 shipped. `resolveId`/`load` in
> `packages/vite-plugin/src/index.ts` no longer intercept `$app/navigation`;
> app code resolves SvelteKit's real module. The `__SVELTE_DEVTOOLS_REAL_GOTO__`
> bridge now lives in a dedicated virtual module
> (`\0virtual:svelte-devtools-navigation-bridge`) that imports the real
> `$app/navigation` (unprefixed, so SvelteKit's alias resolves it — not
> `\0$app/navigation` as sketched below, which would skip alias resolution once
> the interception is gone). The bridge is injected as `<script type="module"
> src="/@svelte-devtools-navigation-bridge">` only when SvelteKit is present:
> via `transformIndexHtml` (guarded by the `hasSvelteKit` flag) and via
> `svelteDevToolsHandle()`'s `transformPageChunk` in
> `packages/vite-plugin/src/sveltekit.ts`. Vite's transform middleware serves
> the URL through the plugin pipeline; it is not served by static middleware.
> Plain Vite apps get no bridge. The client restore path in
> `packages/client/src/lib/stores/time-travel-store.svelte.ts` is untouched.
> Verified by the `navigation-test` fixture
> (`tests/apps/svelte-kit/src/routes/navigation-test/`) and
> `tests/e2e/navigation.spec.ts` (`afterNavigate` fires, `invalidateAll`
> re-runs `load`, armed `beforeNavigate` guards cancel link navigation), and by
> the mandatory time-travel procedure against the SvelteKit test app, including
> the assertion that redo keeps snapshots at `2 / 2`.

## Context

During development the plugin intercepts every import of `$app/navigation` and replaces the module with a virtual one. `resolveId` at `packages/vite-plugin/src/index.ts:57-70` routes the import to `\0virtual:svelte-devtools-navigation`, and the virtual module's `load` body at lines 63-78 re-exports the real `goto` but stubs the other four exports as no-ops:

```ts
// packages/vite-plugin/src/index.ts:74-77
export const invalidate = () => {};
export const invalidateAll = () => {};
export const beforeNavigate = () => {};
export const afterNavigate = () => {};
```

The consequence in any SvelteKit app running the plugin: app code that calls `invalidate(url)` to re-run a `load` function silently does nothing. Data refresh breaks with no error. `beforeNavigate` callbacks never fire, so navigation guards, dirty-form prompts, and analytics hooks are dropped. `afterNavigate` never fires either. A dev tool should observe the app, not change what its navigation code does, yet this is exactly the change it makes, and it makes it silently. The breakage is easy to misattribute, which is the worst kind for a debugging tool: developers spend hours hunting a bug that the debugger itself introduced.

The interception exists for one reason: cross-route time travel needs a real, unblocked `goto`. That bridge is already split out from the stubs. The virtual module assigns the real SvelteKit `goto` to `window.__SVELTE_DEVTOOLS_REAL_GOTO__` at `packages/vite-plugin/src/index.ts:69-71`. The runtime declares the global's type at `packages/runtime/src/index.ts:21`:

```ts
__SVELTE_DEVTOOLS_REAL_GOTO__?: (path: string, opts?: Record<string, unknown>) => Promise<void>;
```

and the client's time travel store consumes it when a restored snapshot's URL differs from the current one (`packages/client/src/lib/stores/time-travel-store.svelte.ts:301-303`):

```ts
const realGoto = (parentWin as unknown as { __SVELTE_DEVTOOLS_REAL_GOTO__?: (path: string, opts: Record<string, unknown>) => Promise<void> }).__SVELTE_DEVTOOLS_REAL_GOTO__;
if (typeof realGoto === 'function') {
    await realGoto(targetPath, { replaceState: true, keepFocus: true, noScroll: true });
}
```

The bridge and the stubs are separable. The stubs buy nothing for the bridge; they only break the app.

## Decision

Stop stubbing SvelteKit navigation. App code must resolve `$app/navigation` to SvelteKit's real module so `goto`, `invalidate`, `invalidateAll`, `beforeNavigate`, and `afterNavigate` behave exactly as SvelteKit defines them in dev.

The four no-op exports at `packages/vite-plugin/src/index.ts:74-77` are removed. Two phases land this:

1. **Phase 1 (shippable now, no approval needed): pass-through re-exports.** The virtual module keeps its position and the `__SVELTE_DEVTOOLS_REAL_GOTO__` bridge exactly where they are, but the stub lines become re-exports of the real module:

   ```ts
   export { goto, invalidate, invalidateAll, beforeNavigate, afterNavigate } from '\0$app/navigation';
   ```

   App navigation is correct the moment this lands. Nothing in the timeline, restore, or store capture path is touched, so it does not require the approval gate below.

2. **Phase 2 (approval-gated): drop the module hijack, keep a side-channel bridge.** Remove the `resolveId` interception at `packages/vite-plugin/src/index.ts:57-61` so `$app/navigation` resolves to SvelteKit's own module for everyone. Preserve the cross-route time travel route as a targeted side-channel: a separate virtual module, imported only by the runtime init path (or the SvelteKit handle injection), that imports the real `$app/navigation` via its resolved id (`\0$app/navigation`) and assigns `window.__SVELTE_DEVTOOLS_REAL_GOTO__` to the real `goto`. The client's restore path keeps reading that global unchanged.

This ADR decides the contract: app navigation is never stubbed. It does not fix, change, or claim to fix any restore behavior. Cross-route restore keeps working through `__SVELTE_DEVTOOLS_REAL_GOTO__`; how that bridge is populated is phase 2's business, not a promise this ADR makes.

### Scope gate

Time travel, restore, and store capture are out of scope for this ADR, per the project rule in AGENTS.md that no timeline, restore, or store capture code changes happen without explicit user approval. Phase 2 relocates the bridge that the restore path relies on, so it requires that separate approval before implementation. Phase 1 does not and is the default until approval exists.

## Alternatives

- **Keep the stubs and document the limitation.** Rejected: silent breakage of `invalidate` and the navigation lifecycle hooks is worse than a documented caveat. A debugging tool that changes app behavior defeats its own purpose.
- **Remove the interception entirely in one step, bridge and all.** Rejected for now: it is the cleanest end state but it unplugs cross-route time travel until the side-channel bridge ships, and the bridge work is approval-gated. Phasing keeps navigation correctness from being held hostage by the approval process.
- **Stub only in SvelteKit apps, not plain Vite.** Rejected: plain Vite apps never import `$app/navigation`, so the interception already only affects SvelteKit. The problem is the interception itself, not its target set.
- **Patch the runtime so the stubs forward to real implementations on the `window`.** Rejected: it moves the same shadowing problem into the runtime and adds indirection for no benefit over pass-through re-exports.

## Consequences

- App navigation behaves exactly as SvelteKit defines it in dev: `invalidate` re-runs `load`, `beforeNavigate` guards actually guard, `afterNavigate` fires. No silent no-ops.
- The DevTools stops shadowing a first-party SvelteKit module. The failure mode "my data won't refresh and the plugin is to blame" disappears.
- Cross-route time travel keeps working through the `__SVELTE_DEVTOOLS_REAL_GOTO__` global in both phases; the client restore path at `time-travel-store.svelte.ts:301-303` is not touched by this ADR.
- The plugin's resolve/load surface shrinks (fully in phase 2), simplifying `packages/vite-plugin/src/index.ts`.
- Cost: phase 2 cannot ship until the approval gate opens; until then one shadowing module remains, though it now passes real functions through.
- Cost: regression risk lands on dev-only behavior, caught by the SvelteKit test app rather than unit tests, so the verification below is mandatory before acceptance.

## Verification

- On the SvelteKit test app (`tests/apps/svelte-kit`), a component that calls `invalidate('data:refresh')` or `invalidateAll` must re-run its `load` function: return a timestamp or counter from `load` and confirm the DOM updates after invalidation. Today it does not update; that failing case is what this ADR removes.
- A component whose `beforeNavigate` calls `cancel()` must block navigation in dev. Today the guard never runs and navigation proceeds.
- Cross-route time travel still works end to end: record snapshots on one route, navigate away, restore a snapshot from the first route, and confirm both the URL and the state change. Run the mandatory time travel procedure in AGENTS.md against `tests/apps/svelte-kit` (ports 5174, session `svelte-kit`), including the assertion that redo keeps snapshots at `2 / 2`.
- `npm run build` passes, and `curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" localhost:5174/__svelte-devtools/api/` still returns plugin status.

## Docs Requiring Updates (once accepted)

- `docs/02_vite-plugin.md:293-295` — the `$app/navigation` interception section must describe the pass-through or side-channel bridge instead of the rewritten module.
- `docs/06_api.md:288` — the `resolveId`/`load` bullet names the `$app/navigation` virtual module; adjust for the reduced surface.
- `docs/04_client.md:130` — the `restore()` bullet's reference to `__SVELTE_DEVTOOLS_REAL_GOTO__` stays accurate, but re-check wording once phase 2 changes how the global is populated.
