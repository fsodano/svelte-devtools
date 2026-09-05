# ADR-0014: Publish-Safe Workspace Dependencies

## Status

Accepted (2026-08-12).

> **Implementation note (2026-08-12):** This record landed with the manifests rewritten to **plain semver ranges directly**, not the `workspace:` protocol. npm does not understand `workspace:` specifiers in `package.json` manifests — that protocol is pnpm/yarn syntax, and npm fails to install a manifest that uses it. Plain semver is also exactly what must appear in the published manifest, so keeping it verbatim in the source manifest removes the rewrite step entirely. During development npm resolves a range like `^0.0.1` against the local workspace copy when the workspace version satisfies it, so sibling packages are still linked locally and builds keep using freshly compiled siblings.
>
> The bridge package is gone: ADR-0011 deleted `packages/bridge`, and its stale `packages/bridge` entry in `package-lock.json` (plus the equally stale `packages/extension` and `packages/server` entries) was pruned. The root workspace is now `"private": true`. Each publishable package carries `"prepublishOnly": "npm run build"`, and the release gate is `npm run release:check`, which runs `scripts/release-check.mjs` — a non-interactive check that fails on any `file:` or `workspace:` specifier in a publishable manifest and dry-runs `npm pack` for each publishable workspace.

## Context

The repository advertises installable npm packages and carries public publish configuration, but every publishable package that depends on a sibling workspace referenced it with a `file:` path. Those paths are a release risk. npm packs them verbatim into the published manifest, and a consumer resolving `file:../client` relative to the installed package looks for `node_modules/@fsodano/client`, which does not exist. The install fails, or worse, links to an unrelated directory.

Concrete facts:

- `packages/vite-plugin/package.json` is the package README tells consumers to install. Its `dependencies` block declared three internal runtime dependencies as filesystem paths: `@fsodano/svelte-devtools-client: "file:../client"`, `@fsodano/svelte-devtools-runtime: "file:../runtime"`, `@fsodano/svelte-devtools-types: "file:../types"`. It sets `publishConfig.access: public` and ships only `dist` via `files`.
- `packages/client/package.json` is publishable and referenced `@fsodano/svelte-devtools-types: "file:../types"` in `devDependencies`. Its `dist/` is what the plugin serves at `/__svelte-devtools/`, so the published client must contain a built panel.
- `packages/bridge/package.json` was `private: true` but carried `@fsodano/svelte-devtools-types: "file:../types"` in `peerDependencies`. ADR-0011 proposed deleting the package; the deletion landed, leaving a stale `packages/bridge` entry in `package-lock.json` (marked `extraneous`) that `npm install` did not prune automatically.
- The root `package.json` was not marked `private`, so `npm publish` at the root would attempt to publish `svelte-devtools` itself. Its `prepublishOnly` hook (`npm run build && npm test`) fires only when publishing the root package; publishing `packages/vite-plugin/` directly ran no build and no test.
- No release tooling existed (no changesets, release-it, lerna, or np in any manifest). The only publish machinery was the `publishConfig` blocks and the root `prepublishOnly` hook.
- npm does not support the `workspace:` dependency protocol used by pnpm and yarn. A manifest that uses `workspace:^0.0.1` fails under npm, so `workspace:` was never an option for a repository whose documented install path is npm (README installation section).

## Decision

Adopt a publish-safe dependency strategy: publishable packages declare sibling dependencies as **plain semver ranges**, the root workspace is `private: true`, per-package `prepublishOnly` hooks build before publish, and a `release:check` script gates every release by failing on any `file:` or `workspace:` specifier.

1. **Plain semver in manifests.** In `packages/vite-plugin/package.json`, the three internal `dependencies` are `"@fsodano/svelte-devtools-client": "^0.0.1"`, `"@fsodano/svelte-devtools-runtime": "^0.0.1"`, `"@fsodano/svelte-devtools-types": "^0.0.1"`. In `packages/client/package.json`, the types `devDependency` is `"@fsodano/svelte-devtools-types": "^0.0.1"`. npm resolves these ranges to the local workspace copies during development because the workspace versions (0.0.1) satisfy the ranges, and the published manifest carries the same registry-safe ranges with no rewrite step.

2. **Root private.** The root `package.json` sets `"private": true`, so `npm publish` at the root is refused and the root `prepublishOnly` hook becomes inert.

3. **Per-package build before publish.** Each publishable package (`types`, `runtime`, `client`, `vite-plugin`) has `"prepublishOnly": "npm run build"`. Publishing a workspace runs that package's own `prepublishOnly`, not the root's, so the hook guarantees the tarball contains a freshly built `dist/`.

4. **Release gate.** `npm run release:check` runs `scripts/release-check.mjs`. For each publishable workspace it scans `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies` and fails (exit code 1) on any `file:` or `workspace:` specifier, then runs `npm pack --dry-run --workspace <name> --json` to prove the package packs. The check is non-interactive, writes no tarball, and deletes no user files.

## Alternatives

- **`workspace:` protocol.** pnpm and yarn rewrite `workspace:` ranges at publish time, but npm does not understand the protocol at all and refuses manifests that use it. The documented contributor and consumer path for this repo is npm. Rejected.
- **Keep `file:` paths and publish anyway.** npm leaves them verbatim, so consumers get broken installs. Rejected.
- **Bundle the client and runtime into the plugin package.** One tarball, no internal dependency chain. It conflates the panel UI with the plugin, breaks the documented `@fsodano/svelte-devtools-types` import surface, and re-architects the builds for no functional gain today. Deferred.
- **Adopt a monorepo release tool (changesets, release-it).** None is present in the repo, and adding one is its own decision with its own adoption cost. Plain semver needs no tool. Not part of this ADR.
- **Use `npm link` or `npm:` aliases.** `npm link` is dev-only, and `npm:` aliases are not rewritten at publish time. Neither produces a registry-safe manifest. Rejected.

## Consequences

- Gain: published tarballs carry real semver ranges, so `npm install @fsodano/vite-plugin-svelte-devtools` resolves the sibling packages from the registry like any normal dependency.
- Gain: development still uses local workspace builds through npm's workspace resolution, avoiding registry fetches and accidental version drift between siblings.
- Gain: the release gate is free, standard, and catches any future `file:` or `workspace:` specifier before it ships.
- Gain: a forgotten internal reference now fails the release instead of shipping a tarball that installs nowhere.
- Cost: releases require coordinated version parity across types, runtime, client, and the plugin, published in dependency order (types → runtime → client → vite-plugin).
- Cost: the root `prepublishOnly` hook no longer covers the real publish path. Per-package build hooks own that responsibility now.
- Cost: `npm install` did not prune the stale `packages/bridge`, `packages/extension`, and `packages/server` entries left in `package-lock.json` by earlier package deletions; they were removed by hand as part of this change. Future package removals may need the same manual pruning.

## Verification

```bash
# 1. Lockfile is registry-safe: no file:/workspace: specifiers, no stale workspace entries
npm install
grep -n 'file:\.\.\|workspace:' package-lock.json   # must find nothing
grep -n 'packages/bridge' package-lock.json         # must find nothing

# 2. Release gate passes for every publishable package
npm run release:check
#   Expect: ✓ ... manifest dependencies are registry-safe (plain semver)
#           ✓ ... npm pack --dry-run passed  (four packages)

# 3. Dry-run pack of the plugin shows plain semver in its manifest
npm pack --dry-run --workspace @fsodano/vite-plugin-svelte-devtools

# 4. The repo still builds
npm run build
```

The acceptance criteria for this implementation: the release gate passes for all four publishable packages, `npm pack --dry-run` for the plugin shows `^0.0.1` (never `file:../` or `workspace:`), the lockfile contains no `file:`/`workspace:` specifier and no `packages/bridge` entry, and the repo still builds clean.
