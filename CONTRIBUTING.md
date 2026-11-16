# Contributing to Svelte DevTools

Start with [AGENTS.md](AGENTS.md), the [developer documentation](docs/INDEX.md), and the [completion audit](docs/validation/devtools-completion-audit.md). Preserve durable verification evidence in `docs/validation/` and record lasting design decisions in [ADRs](docs/adr/README.md).

Svelte DevTools is an independent project. The [Svelte contribution guide](https://github.com/sveltejs/svelte/blob/main/CONTRIBUTING.md) informs our emphasis on reproducible reports, focused changes, test commands and results, and UI evidence. The commands below are specific to this repository.

## Set up the repository

Use Node.js 20.19 or newer and npm. CI uses Node.js 22 and Node.js 24. This repository has five npm workspaces: types, runtime, client, Vite plugin, and MCP. Test applications have their own lockfiles and are not root workspaces.

Run from the repository root:

```sh
npm ci
npm run build
npm ci --prefix tests/apps/svelte
npm ci --prefix tests/apps/svelte-kit
npx playwright install chromium
```

On Linux, use `npx playwright install --with-deps chromium` if browser system dependencies are missing. The build compiles the packages in dependency order. The client is served from `packages/client/dist/`; editing its source does not update the running panel until it is rebuilt and the fixture server is restarted.

### Regenerate a lockfile with npm 12

The lockfiles are generated with **npm 12**. npm 11 leaves out the optional wasm dependencies that the `@rolldown/binding-wasm32-wasi` entry needs, so `npm ci` then fails with:

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

npm 12 does not run dependency install scripts unless they are approved. The Todo SQLite fixture approves `better-sqlite3`, which builds the native driver. Review the pending list with `npm install-scripts ls`.

## Choose the right test application

| Application | Install | Use it to verify |
|---|---|---|
| Plain Svelte | `npm ci --prefix tests/apps/svelte` | Runtime startup, dock authorization, component inspection, browser requests |
| SvelteKit | `npm ci --prefix tests/apps/svelte-kit` | SSR traces, routes, navigation, and the Spring counter |
| Pokédex | `npm ci --prefix tests/apps/pokedex` | Repeated component instances and request workflows |
| Todo SQLite | `npm ci --prefix tests/apps/todo-sqlite` | Data mutations and server integration |

Consult each fixture's configuration before selecting a port or external service. The default browser suite runs the plain and SvelteKit applications. It does not establish coverage of every fixture.

To run a fixture manually:

```sh
SVELTE_DEVTOOLS_TOKEN=local-devtools-check npm run dev --prefix tests/apps/svelte -- --port 5173 --strictPort
```

Open the app in a browser. Use the current Manual Auth Token printed by the Vite server to authorize the dock, then open the Svelte panel. The dock token and `SVELTE_DEVTOOLS_TOKEN` are different credentials. The dock token is single-use; follow the manual-dialog procedure in `AGENTS.md`.

With the Svelte panel open, query the API from another terminal:

```sh
curl -H 'Authorization: Bearer local-devtools-check' \
  http://localhost:5173/__svelte-devtools/api/components
```

Runtime API data comes from panel sync. Check freshness and compare it with the actual app. See [MCP setup and limits](docs/07_mcp.md) for agent inspection.

## Validate a change

Run the repository gates:

```sh
npm run build
npm run check
npx vitest run
npm run test:e2e
npm run release:check
```

`npm test` is an alternative to the build plus Vitest commands; it builds first. Run focused tests during development, such as `npx vitest run tests/runtime/`, then run the complete gates before proposing the change.

Stop your own fixture processes on ports 5173 and 5174 before E2E tests. Do not terminate another developer's processes. Global setup starts plain Svelte on 5173 and captures the dock token. Playwright starts SvelteKit on 5174. Both reject busy ports. The suite runs serially in Chromium and retains failure traces in `test-results/`.

Set `SVELTE_E2E_PORT` and `SVELTE_E2E_KIT_PORT` to move the two servers when the defaults are busy. Both ports must be free.

Build, API, and real UI checks are required for runtime, transform, and panel changes. Compare the application DOM, API response, and panel result. For a regression, test production code or a compiled fixture. A copied implementation in a test does not protect the production behavior.

For identity, capture, or restore changes, follow the exact time-travel procedure in `AGENTS.md`. The separate `scripts/verify-time-travel.mjs` currently expects a running SvelteKit app on port 5174 in the `svelte-kit` tmux session. It is not part of `npm run test:e2e`. A green default browser suite does not prove this regression passed.

For UI changes, use the [design guidelines](docs/design-guidelines.md). Check narrow and wide layouts, both themes, keyboard access, larger fonts, and resizable panes. Include screenshots or a short recording of the actual application and panel. Do not use a mockup as evidence that the implemented UI works.

## Document and submit the result

Keep each change focused on a concrete problem. In the pull request, describe the trigger and resulting behavior. Include exact commands, pass/fail results, and unresolved failures. Identify which real applications you exercised. Link the relevant discrepancy IDs.

If an API changes, update the API reference and affected examples. If agent access changes, update `docs/07_mcp.md` and relevant agent guides. Record a significant architecture choice using the [ADR process](docs/adr/README.md). Use short sentences and consistent terminology. Do not claim support that has not been tested.

CI runs the build, type check, unit tests, Chromium regressions, real SSR/SQLite checks, production previews, and isolated tarball-consumer checks. It does not publish packages. The package gate checks matching release versions, registry-safe dependencies, public metadata, licenses, READMEs, and exported files. Consumer checks cover the documented fixture versions; they do not prove compatibility with every supported version. Publishing requires a separate maintainer action and review of the release scripts.

### Release packages

Set the release version with `npm run bump-version <version>`. It updates the manifests, the internal dependency ranges, the shared `DEVTOOLS_VERSION` constant, the lockfile, and the docs that name the release. Run `npm run bump-version -- --check` to confirm every reference names the current version. CI runs that check, so a reference left behind fails the build.

Install the independent Svelte, SvelteKit, and Todo fixture dependencies before running the release workflow. Install Playwright Chromium. Authenticate with `npm login` in your user configuration; do not commit npm authentication settings.

Run `bash scripts/publish.sh --dry-run` to run all release gates without publishing. After the release PR passes CI and merges, tag the release and run `bash scripts/publish.sh --publish`. The script validates first, packs all five packages, and publishes their tarballs in dependency order. It accepts `--otp` when npm requires two-factor authentication. A failed publish stops the sequence; run the same command again to publish the packages that are still missing, since the script skips what the registry already has.

`--skip-validation` skips the test, browser, stress, SSR, production, and consumer checks. It still builds the packages and runs the package gate, because the tarballs must carry the current build and the gate checks the metadata. Use it only when the full `--dry-run` already passed for the same commit.

If the publish stops with `EOTP`, npm needs a two-factor code. Run the command from an interactive terminal so npm can complete the passkey challenge in a browser, or pass a recovery code with `--otp <code>`. npm asks once per package, so a passkey needs five approvals and a recovery code may only cover the first one.

Work plans stay local in the ignored `docs/plans/` folder. Record lasting decisions as ADRs and retain release evidence in `docs/validation/`.
