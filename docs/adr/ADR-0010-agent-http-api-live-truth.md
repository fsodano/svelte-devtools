# ADR-0010: Agent HTTP API Must Report Live Truth

## Status

Accepted (2026-08-12)

> **Implementation note (2026-08-12):** Shipped. `/api/migration` now reads the
> real component registry via `packages/vite-plugin/src/registry.ts` instead of
> the never-populated `globalThis.__SVELTE_DEVTOOLS_REGISTRY__`, and returns an
> honest empty-registry contract (`totalFiles: 0`, no `overall: 100`). The
> masking test was replaced in `tests/vite-plugin/server-api.test.ts`, and the
> `svelte-devtools:migration-score` RPC aligns with the same data source.
> `POST /api/set-state` implements Option B: `packages/vite-plugin/src/server-api.ts`
> returns `501` with an explanatory error and no longer mutates `cachedState`.
> The live runtime channel (Option A) is not shipped; the endpoint preserves its
> shape for future implementation.

## Context

The agent HTTP API at `/__svelte-devtools/api/` is documented in the README, `docs/06_api.md`, `docs/02_vite-plugin.md`, and the agent skills (`skills/SKILLS.md`, `skills/debug-with-devtools.md`) as a live, CI-safe way to read migration scores and edit component state. Two endpoints do not deliver what the docs promise.

**1. `/api/migration` reads the wrong registry and reports a false perfect score.**

The handler at `packages/vite-plugin/src/server-api.ts:160` reads a global named `__SVELTE_DEVTOOLS_REGISTRY__`:

```ts
const WORKSPACE_REGISTRY = (globalThis as Record<string, unknown>)['__SVELTE_DEVTOOLS_REGISTRY__'];
```

No server-side code ever populates that global. The real registry is module-scoped in `packages/vite-plugin/src/index.ts:24`:

```ts
const COMPONENT_REGISTRY = new Map<string, ComponentMeta>();
```

and it is populated during `transform` at `packages/vite-plugin/src/index.ts:517-518`, where `analyzeMigration(code, id, runeCounts)` results are stored per component.

The only other thing named `__SVELTE_DEVTOOLS_REGISTRY__` is a browser-side map injected into transformed modules (`packages/vite-plugin/src/index.ts:565`), and that injected map carries `{id, name, filename, propKeys}` with no `migrationResult` field. So even if the handler could reach it, the `if (entry.migrationResult)` filter would drop every entry.

In real usage the endpoint always returns `{overall: 100, totalFiles: 0, perFile: []}`. A clean "100% migrated" verdict for a codebase that has never been scored is misleading to agents and to the MigrationScore panel tab (`docs/04_client.md:79`).

The defect is masked, not merely absent: the test at `tests/vite-plugin/server-api.test.ts:221-234` asserts `overall: 100, totalFiles: 0` for an empty registry, codifying the false report as expected behavior.

Notably, a working implementation already exists in the codebase: the legacy endpoint `/__svelte-devtools/migration-score` at `packages/vite-plugin/src/index.ts:314-329` reads `COMPONENT_REGISTRY` directly and computes honest scores.

**2. `/api/set-state` mutates only a cache and never touches live app state.**

The handler at `packages/vite-plugin/src/server-api.ts:201-205` does:

```ts
cachedState.components = (cachedState.components as Record<string, unknown>[]).map(c =>
    c.id === componentId
        ? { ...c, state: { ...(c.state as Record<string, unknown> || {}), [key]: value } }
        : c
);
```

`cachedState` is a server-side mirror synced from the panel every 2 seconds. Nothing in this code path calls the runtime's registered `_registerState` setters, which are the only mechanism that can write into a live Svelte 5 `$state` proxy (see ADR-0008). The mutation is invisible to the app, and the next panel sync can overwrite it. Responding `{ok: true}` for a cache-only write presents the endpoint as a live state editor when it is nothing of the sort.

The runtime already exposes the setters the live path needs. The client time-travel store applies state through `parentApi.setComponentState(id, key, value)` (ADR-0008 implementation note), so a live channel is feasible by reusing the panel bridge in reverse.

## Decision

Adopt honesty over appearance for the agent HTTP API. Agents that act on this data must be able to trust it.

### Migration: read the real registry, never synthesize 100%

1. `/api/migration` must read the same `COMPONENT_REGISTRY` that the transform populates (`packages/vite-plugin/src/index.ts:517-518`), matching the behavior of the working legacy endpoint (`packages/vite-plugin/src/index.ts:320-328`).
2. When no scored components exist, the endpoint must not report `overall: 100`. It should return `totalFiles: 0` with no `overall` field, or `overall: null`, so consumers can distinguish "nothing scored yet" from "fully migrated". `100` is reserved for a registry that was actually scored and averaged to 100.
3. The masking test at `tests/vite-plugin/server-api.test.ts:221-234` must be replaced with tests that assert the honest empty-registry contract and that real `COMPONENT_REGISTRY` entries are reflected.
4. Audit the RPC method `svelte-devtools:migration-score` (`packages/vite-plugin/src/plugins/devtools-setup.ts:50`) for the same wrong-registry defect and align it with the same data source.

### Set-state: a live channel, or an honest 501

Two acceptable implementations, in order of preference:

- **Option A (recommended): a live runtime state channel.** Route `POST /api/set-state` through the same mechanism the client uses: reach the runtime's `_registerState` setters via the panel bridge, wait for confirmation that the write landed, and only then respond `{ok: true}` with the confirmed value. The response must prove the write reached the app.
- **Option B (minimum acceptable): honest `501 Not Implemented`.** Until a live channel exists, `POST /api/set-state` must return `501` with a JSON error explaining that live state editing is not implemented, and must never mutate `cachedState` as if it were the live state.

Cache-only mutation must never be reported as a successful live edit under either option.

### Scope gate

Time travel, store capture, and restore behavior are out of scope for this ADR. Per the project rule, no timeline, restore, or store capture code changes happen without explicit user approval. Implementing Option A touches the setter/restore path, so it requires that separate approval before implementation begins. This ADR decides the contract and the direction only.

## Alternatives

- **Keep `/api/migration` as-is and document the limitation.** Rejected: returning `100` for unscored codebases is actively misleading, not merely incomplete. Documentation cannot fix a wrong number.
- **Populate `globalThis.__SVELTE_DEVTOOLS_REGISTRY__` on the server.** Rejected: it duplicates the existing registry, risks divergence between the two sources, and the browser-side global with the same name (`index.ts:565`) creates naming confusion. Reading `COMPONENT_REGISTRY` reuses the single source of truth and matches the already-working legacy endpoint.
- **Make `/api/set-state` return 200 with the mutated cache and note the caveat in docs.** Rejected: a cache-only write acknowledged as `{ok: true}` is a silent lie to any agent that acts on it. The docs already overstate the endpoint; adding more caveats does not fix the contract.
- **Removing `/api/set-state` entirely.** Kept as a fallback if Option A proves infeasible; Option B (501) is preferred because it preserves the endpoint shape for future implementation.

## Consequences

- Agents receive migration scores that reflect the actual analyzed codebase, including an honest "nothing scored yet" signal instead of a fake 100.
- `/api/set-state` either provably edits live state or refuses loudly; no caller can mistake a cache write for a real edit.
- The false claim in the docs that migration is always available server-side is corrected.
- The masking test that normalized the bug is removed, and the API contract is locked by tests written before the fix.
- Option A cannot ship without separate user approval for the store/restore-adjacent code it touches. Option B can ship immediately and is the default until that approval exists.
- No behavior in this ADR is implemented yet. This record describes the required change; the endpoints remain broken and misleading until the acceptance criteria are met.

## Verification

The unit suite runs from the repo root without a dev server:

```bash
npx vitest run tests/vite-plugin/server-api.test.ts
```

Live checks run against the plain Vite test app on port 5173. The steps below are the TDD sequence and acceptance criteria: write each test first, confirm it fails against the current code, implement the change, then confirm it passes.

1. **Honest empty registry.** Test: with `COMPONENT_REGISTRY` empty, `GET /api/migration` returns `ok: true, totalFiles: 0` and no `overall` of `100` (either absent or `null`). Fails today (`server-api.test.ts:221-234` asserts `overall: 100`).
2. **Real registry is reflected.** Test: after `COMPONENT_REGISTRY` holds two entries with migration results of 80 and 60, `GET /api/migration` returns `overall: 70, totalFiles: 2` with both `perFile` entries. Fails today because the handler never reads `COMPONENT_REGISTRY`.
3. **Parity with the legacy endpoint.** Test: `/api/migration` and `/__svelte-devtools/migration-score` return identical bodies for the same registry state.
4. **RPC audit.** Test: `svelte-devtools:migration-score` returns the same scores as `/api/migration` for the same registry state.
5. **Set-state live channel (Option A)** or **honest 501 (Option B)**.
   - Option A test: a POST that reaches the runtime setter returns `{ok: true}` with the confirmed value, and the app's state reflects the change (verified via the runtime, not the cache).
   - Option B test: `POST /api/set-state` returns `501` with an explanatory error and leaves `cachedState` untouched. Fails today because the handler returns `200 {ok: true}` after mutating the cache.
6. **No false advertising.** Test and doc grep: no README, `docs/`, or `skills/` file describes `/api/set-state` as a live editor or `/api/migration` as always-available server-side data until the implementation matches the claim.

## Affected Documentation

- `README.md` — Agent API table: migration row and set-state row.
- `docs/06_api.md` — lines 317, 319, 329-334, including the claim at line 334 that migration scores are "computed server-side and always available".
- `docs/02_vite-plugin.md` — lines 313, 315.
- `docs/04_client.md` — line 79, MigrationScore tab data source.
- `docs/03_runtime.md` — line 51, comment naming `/api/set-state` as a state writer.
- `skills/SKILLS.md` — lines 28-29, 45.
- `skills/debug-with-devtools.md` — lines 405, 410, 428-435.
- `tests/vite-plugin/server-api.test.ts` — lines 221-234 masking test, plus the set-state tests in the `set-state endpoint` describe block.
