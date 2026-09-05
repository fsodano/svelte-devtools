# Fresh npm installation

Release: 0.2.2. Verification date: September 5, 2026.

## Baseline

Created an independent application with `sv` 0.17.0 at `~/fibradev/svelte-tests/full-sample`. Installed published version 0.2.1 and DevTools host 0.4.8 from npm. No workspace links were used.

The documented manual installation worked. Type checks and production builds passed. The authorized Chromium panel showed the layout and page. The authenticated API returned both components.

The test exposed two setup issues:

- Current Svelte CLI projects put adapter and compiler options inside `sveltekit(...)` in `vite.config.ts`. Instructions must preserve these options and must not require `svelte.config.js`.
- The panel still said agent state editing was unavailable. This did not match the nine implemented MCP tools.

## Changes

The npm package now ships `svelte-devtools init`. It adds the host and plugin calls and creates a development-only SvelteKit hook. It preserves generated options. It supports standard JavaScript and TypeScript Vite config objects, including `defineConfig({...})`. It does not execute application configuration.

Use `--dry-run` to inspect the edits. Repeating setup does not add duplicate imports or calls. Existing custom hooks, dynamic configs, and custom SvelteKit file paths require manual setup. The command checks for these cases before writing files.

The package README and installation guide now start with the setup command. They retain manual instructions for existing applications. The panel now describes agent state edits.

## Release validation

- Workspace build and type check passed with no type errors or warnings.
- All 572 unit tests passed, including 10 setup regressions.
- All 12 Chromium end-to-end tests passed.
- Stress, SSR/SQLite, and production-isolation checks passed.
- All five npm package artifacts passed the release gate.
- The packed consumer test installed real tarballs outside the workspace. It ran the shipped setup executable twice for plain Svelte and SvelteKit. It verified assets, imports, types, MCP, SQLite exports, and production builds.
- A second `sv create` application used those tarballs. Setup preserved its generated inline options. Type checking and production build passed.

## Reproduce the browser and API check

Create an application and install the release:

```bash
npx sv create my-app --template minimal --types ts --no-add-ons --install npm
cd my-app
npm install -D @fsodano/vite-plugin-svelte-devtools@0.2.2 @vitejs/devtools@0.4.8
npx svelte-devtools init
```

For the counter check, use this `src/routes/+page.svelte`:

```svelte
<script lang="ts">
  let count = $state(0);
  const doubled = $derived(count * 2);
</script>

<p>Count: <strong data-testid="count">{count}</strong></p>
<p>Doubled: {doubled}</p>
<button onclick={() => count++}>Increment</button>
```

Start the app with a local API token and capture its terminal log. Keep the token out of version control. From the DevTools repository, run:

```bash
SVELTE_DEVTOOLS_TOKEN=your-local-token node scripts/verify-fresh-install.mjs \
  http://localhost:5187 /path/to/server.log 0.2.2 /tmp/fresh-install-evidence
```

The script authorizes the dock using the latest terminal code. It checks the dashboard, component tree, counter hydration, live state, derived value, events, routes, and server traces. It writes JSON results and screenshots. The app must remain running while the check executes.
