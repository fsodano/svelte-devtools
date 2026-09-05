# Contributing to Svelte DevTools

Start with [AGENTS.md](AGENTS.md), the [developer documentation](docs/INDEX.md), and the [completion plan](docs/plans/pending/devtools-completion.md). The plan records observed gaps and their verification status. Add evidence there when working on an existing gap.

Svelte DevTools is an independent project. The [Svelte contribution guide](https://github.com/sveltejs/svelte/blob/main/CONTRIBUTING.md) informs our emphasis on reproducible reports, focused changes, test commands and results, and UI evidence. The commands below are specific to this repository.

## Set up the repository

Use Node.js 20.19 or newer and npm. CI uses Node.js 22. This repository has five npm workspaces: types, runtime, client, Vite plugin, and MCP. Test applications have their own lockfiles and are not root workspaces.

Run from the repository root:

```sh
npm ci
npm run build
npm ci --prefix tests/apps/svelte
npm ci --prefix tests/apps/svelte-kit
npx playwright install chromium
```

On Linux, use `npx playwright install --with-deps chromium` if browser system dependencies are missing. The build compiles the packages in dependency order. The client is served from `packages/client/dist/`; editing its source does not update the running panel until it is rebuilt and the fixture server is restarted.

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

Build, API, and real UI checks are required for runtime, transform, and panel changes. Compare the application DOM, API response, and panel result. For a regression, test production code or a compiled fixture. A copied implementation in a test does not protect the production behavior.

For identity, capture, or restore changes, follow the exact time-travel procedure in `AGENTS.md`. The separate `scripts/verify-time-travel.mjs` currently expects a running SvelteKit app on port 5174 in the `svelte-kit` tmux session. It is not part of `npm run test:e2e`. A green default browser suite does not prove this regression passed.

For UI changes, use the [design guidelines](docs/design-guidelines.md). Check narrow and wide layouts, both themes, keyboard access, larger fonts, and resizable panes. Include screenshots or a short recording of the actual application and panel. Do not use a mockup as evidence that the implemented UI works.

## Document and submit the result

Keep each change focused on a concrete problem. In the pull request, describe the trigger and resulting behavior. Include exact commands, pass/fail results, and unresolved failures. Identify which real applications you exercised. Link the relevant discrepancy IDs.

If an API changes, update the API reference and affected examples. If agent access changes, update `docs/07_mcp.md` and relevant agent guides. Record a significant architecture choice using the [ADR process](docs/adr/README.md). Use short sentences and consistent terminology. Do not claim support that has not been tested.

CI runs the build, type check, unit tests, package dry run, and Chromium suite. It does not publish packages. The package gate checks registry-safe dependencies and whether each workspace can be packed; it does not prove installation in a clean consumer or full version compatibility. Publishing requires a separate maintainer action and review of the release scripts.
