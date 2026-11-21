# Contributing to Svelte DevTools

Start with [AGENTS.md](AGENTS.md), the [developer documentation index](docs/INDEX.md), and the [completion audit](docs/validation/devtools-completion-audit.md). Preserve durable verification evidence in `docs/validation/` and record lasting design decisions in [ADRs](docs/adr/README.md).

Svelte DevTools is an independent project. The [Svelte contribution guide](https://github.com/sveltejs/svelte/blob/main/CONTRIBUTING.md) informs our emphasis on reproducible reports, focused changes, test commands and results, and UI evidence. The commands below apply specifically to this repository.

## Set up the repository

Use Node.js 22.12 or newer (or `^20.19.0` per the package `engines` floor) and npm. The documented workflow and browser suite use Node.js 24, and CI runs the build, type check, unit test, and package gate jobs on Node.js 22 and Node.js 24.

This repository has five npm workspaces under `packages/`:
- `packages/types` (`@fsodano/svelte-devtools-types`)
- `packages/runtime` (`@fsodano/svelte-devtools-runtime`)
- `packages/vite-plugin` (`@fsodano/vite-plugin-svelte-devtools`)
- `packages/client` (`@fsodano/svelte-devtools-client`)
- `packages/mcp` (`@fsodano/svelte-devtools-mcp`)

The four sample applications under `tests/apps/` have their own `package-lock.json` files and are not root workspaces.

Run from the repository root:

```sh
npm ci
npm run build
npm ci --prefix tests/apps/svelte
npm ci --prefix tests/apps/svelte-kit
npm ci --prefix tests/apps/todo-sqlite
npx playwright install chromium
```

On Linux, use `npx playwright install --with-deps chromium` if browser system dependencies are missing. `npm ci --prefix tests/apps/todo-sqlite` is required before running `npx vitest run` because `tests/vite-plugin/sqlite.test.ts` exercises the native SQLite driver from that fixture.

`npm run build` compiles the five packages in dependency order (`build:types` -> `build:runtime` -> `build:vite-plugin` -> `build:client` -> `build:mcp`). The DevTools panel is served from `packages/client/dist/`; if you edit `packages/client/src/`, rebuild the client (`npm run build:client`) and restart the fixture server before checking the browser.

### Regenerate a lockfile with npm 12

The lockfiles are generated with **npm 12**. npm 11 omits the optional WebAssembly dependencies that `@rolldown/binding-wasm32-wasi` requires, which causes `npm ci` on Linux to fail with:

```
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: @emnapi/core@2.0.0-beta.2 from lock file
```

Install npm 12 and regenerate the lockfile for the root and for each fixture:

```sh
npm install -g npm@12
npm install
npm install --prefix tests/apps/svelte
npm install --prefix tests/apps/svelte-kit
npm install --prefix tests/apps/todo-sqlite
npm install --prefix tests/apps/pokedex
```

npm 12 does not run dependency install scripts unless they are approved. The Todo SQLite fixture approves `better-sqlite3`, which compiles the native SQLite driver. Review pending install scripts with `npm install-scripts ls`.

## Choose the right test application

| Application | Port (`--strictPort`) | Install | Use it to verify |
|---|---|---|---|
| Plain Svelte (`tests/apps/svelte`) | `5173` | `npm ci --prefix tests/apps/svelte` | Runtime startup, dock authorization, component inspection, state edits, browser fetch mocks, 1,000-component stress page |
| SvelteKit (`tests/apps/svelte-kit`) | `5174` | `npm ci --prefix tests/apps/svelte-kit` | SSR traces, route inventory, `$app/navigation`, and the Spring counter time-travel flow |
| Todo SQLite (`tests/apps/todo-sqlite`) | `5175` | `npm ci --prefix tests/apps/todo-sqlite` | Persistent CRUD actions, SSR request correlation, and synchronous SQLite query spans |
| Pokédex (`tests/apps/pokedex`) | `5176` | `npm ci --prefix tests/apps/pokedex` | Repeated component instances (20 `PokemonCard` cards), layout-to-page ancestry, and request workflows |

Consult each fixture's `README.md` before selecting a port or external service. The default Playwright suite (`npm run test:e2e`) runs the plain Svelte and SvelteKit fixtures; it does not cover every fixture on its own.

To run a fixture manually:

```sh
SVELTE_DEVTOOLS_TOKEN=local-devtools-check npm run dev --prefix tests/apps/svelte -- --port 5173 --strictPort
```

Open the application in Chromium. Authorize the Vite DevTools dock with the **six-digit `devframe auth code`** printed in the server terminal (click **Unauthorized** in the dock and enter the six digits), then open the **Svelte** dock entry. The six-digit dock code and the `SVELTE_DEVTOOLS_TOKEN` bearer token are separate credentials. Follow the host `0.4.8` authorization procedure in [AGENTS.md](AGENTS.md#dock-rendering-and-authorization-vite-devtools).

With the Svelte panel open, query the HTTP API from another terminal:

```sh
curl -H 'Authorization: Bearer local-devtools-check' \
  http://localhost:5173/__svelte-devtools/api/components
```

Runtime API data comes from periodic panel sync. Check `cachedAt` freshness and compare the response with the application DOM. See [MCP setup and limits](docs/07_mcp.md) for agent inspection.

## Validate a change

Run the repository verification gates from the root:

```sh
npm run build
npm run check
node scripts/bump-version.mjs --check
npx vitest run --maxWorkers=2
npm run test:e2e
npm run release:check
```

`npm test` runs `npm run build && vitest run`. During development, run focused unit tests such as `npx vitest run tests/runtime/`, then run the complete verification gates before opening a pull request.

Before running `npm run test:e2e`, stop your own fixture processes on ports `5173` and `5174`. Do not terminate another developer's processes. Playwright global setup starts plain Svelte on `5173` (`SVELTE_E2E_PORT`) and captures the dock auth code; Playwright `webServer` starts SvelteKit on `5174` (`SVELTE_E2E_KIT_PORT`). Both use `--strictPort` and fail if the port is busy. Set `SVELTE_E2E_PORT` and `SVELTE_E2E_KIT_PORT` when you need alternate free ports. The suite runs serially in Chromium and saves failure traces in `test-results/`.

Additional standalone verification scripts (run by CI and `bash scripts/publish.sh --dry-run`):
- `node scripts/verify-stress.mjs` — 1,000-component mount, prop update, keyboard selection, and unmount check on port `5180`.
- `node scripts/verify-ssr-sql.mjs` — real SvelteKit (`5183`) and Todo SQLite (`5184`) SSR, hydration, streaming, HTTP API, MCP stdio, and SQL trace waterfall check using a temporary SQLite database.
- `node scripts/verify-production.mjs` — verifies built SvelteKit and Todo SQLite production previews contain no DevTools runtime, dock, globals, or API routes.
- `node scripts/verify-package-consumer.mjs` — packs all five workspaces into tarballs and tests clean consumer installs outside the workspace.
- `node scripts/verify-editor.mjs` — verifies project-root-confined source lookup and editor launch.
- `node scripts/verify-pokedex.mjs` — verifies 20 distinct `PokemonCard` instances and ancestry against a running Pokédex server on port `5176`.

Build, API, and live UI checks are required for runtime, transform, and panel changes. Compare the application DOM, API response, and panel UI. In unit and regression tests, import the production modules or compile a real fixture; never copy production logic into a test file.

For component identity, snapshot capture, or restore changes, run the mandatory Spring counter time-travel verification in [AGENTS.md](AGENTS.md#mandatory-time-travel-verification-procedure). The standalone script `node scripts/verify-time-travel.mjs` runs this check against a SvelteKit app running on port `5174` (`SVELTE_E2E_KIT_PORT`) in a `svelte-kit` tmux session. It is not part of `npm run test:e2e`.

For UI changes, follow the [design guidelines](docs/design-guidelines.md). Check narrow and wide viewports, light and dark themes, keyboard navigation, font scales, and resizable split panes. Attach screenshots or a short recording of the live application and panel. Do not use a static mockup as evidence that the implemented UI works.

## Document and submit the result

Keep each pull request focused on a concrete problem. In the pull request description, state the trigger and the resulting behavior. List the exact commands run, their pass/fail results, and any checks not run. Identify which sample applications you exercised and link any relevant issue or completion-audit discrepancy IDs (`D01`–`D46`, `S1`–`S16`).

If an API changes, update [docs/06_api.md](docs/06_api.md) and affected examples. If agent access changes, update [docs/07_mcp.md](docs/07_mcp.md) and the skill files in `skills/`. Record significant architectural decisions using the [ADR process](docs/adr/README.md). Write short sentences in active voice with consistent terms. Do not claim browser or version support that you have not tested.

CI (`.github/workflows/ci.yml`) runs two jobs:
1. **Verify** (Node 22 + npm 11, Node 24 + npm 11, Node 24 + npm 12): `npm ci`, `npm run build`, `npm run check`, `node scripts/bump-version.mjs --check`, Todo SQLite native fixture install, `npx vitest run --maxWorkers=2`, and `npm run release:check`.
2. **Browser** (Node 24): `npm run test:e2e`, `verify-stress.mjs`, `verify-ssr-sql.mjs`, SvelteKit and Todo SQLite production builds plus `verify-production.mjs`, and `verify-package-consumer.mjs`.

CI never publishes packages. `npm run release:check` verifies that all five publishable workspaces share the root release version and `DEVTOOLS_VERSION`, use plain semver internal ranges (no `file:` or `workspace:` specifiers), include required metadata, `README.md`, and matching `LICENSE` files, and pack cleanly with `npm pack --dry-run --json` under both npm 11 and npm 12.

### Release packages

Set the release version with `npm run bump-version <version>`. It updates the root and workspace `package.json` manifests, the internal workspace dependency ranges, `DEVTOOLS_VERSION` in `packages/types/src/constants.ts`, the root `package-lock.json`, and the documentation and skill files that name the current release. Run `npm run bump-version -- --check` (or `node scripts/bump-version.mjs --check`) to confirm every scanned file names the current version.

Before running the release script, install the root dependencies and the `svelte`, `svelte-kit`, and `todo-sqlite` fixture dependencies, and ensure Playwright Chromium is installed. Authenticate with `npm login` in your user configuration; never commit npm authentication tokens.

Run `bash scripts/publish.sh --dry-run` to execute the full release validation gate without publishing. After the release PR passes CI and merges, tag the release and run `bash scripts/publish.sh --publish`. The script validates the workspace, packs all five packages, and publishes their tarballs to `https://registry.npmjs.org/` in topological dependency order (`node scripts/release-check.mjs --list`). If a publish fails partway through, re-run the same command; the script checks `npm view` and skips packages already published at the current version.

`--skip-validation` skips the unit test, browser, stress, SSR/SQLite, production preview, and consumer checks, but still runs `npm run build` and `npm run release:check` so the tarballs carry a current build and verified metadata. Use `--skip-validation` only when `bash scripts/publish.sh --dry-run` has already passed on the exact same commit.

If publishing stops with `EOTP`, npm requires two-factor authentication. Run the command in an interactive terminal to complete the browser passkey challenge, or pass a recovery code with `--otp <code>`. npm prompts once per package across the five workspaces.

Keep local work plans in the git-ignored `docs/plans/` directory. Record lasting architectural decisions in `docs/adr/` and point-in-time verification evidence in `docs/validation/`.
