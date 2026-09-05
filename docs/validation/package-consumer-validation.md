# Package consumer validation — 0.2.1

The release gate installs actual tarballs in a temporary directory outside the repository. No workspace dependency links or source aliases are used.

## Failure reproduced and corrected

The 0.2.0 runtime asset lookup depended on monorepo directory names. In a clean installation, `/__svelte-devtools/svelte-runtime.js` returned HTML instead of JavaScript. Resolve the runtime's public ESM entry and the client package directory, then verify the built files exist. Missing files now produce an actionable error instead of a misleading fallback response.

## Verified behavior

- All five installed package directories come from tarballs and are not symlinks.
- Plain Vite and SvelteKit serve the runtime and panel bundle as JavaScript, and the authenticated API returns the release version.
- SvelteKit initial HTML contains rendered component state.
- NodeNext TypeScript imports resolve the plugin, SvelteKit hook, SQLite adapter, MCP server, and shared types.
- The installed MCP executable exposes nine tools and reports the package release version.
- The disabled SQLite wrapper preserves its callback result.
- Both clean consumer projects build for production. Their production HTML does not inject DevTools.
- The package gate checks README and license inclusion, license identity, public metadata, release-version consistency, and exported files.

Run `node scripts/verify-package-consumer.mjs` after building the workspaces. The script prints its temporary artifact directory and retains diagnostic logs there. CI runs this check alongside the full browser, SSR/SQLite, production-preview, and lifecycle checks.

The final local unit run passed 562 tests in 39 files. The root type check reported zero errors and warnings. The Todo save recording additionally verifies a real form submission, persisted state, the POST-to-INSERT parent relationship, and visible per-span timings. Its [capture metadata](../media/todo-save-capture.json) records the observed trace.

These checks cover the documented fixture versions. They do not establish compatibility with every package version or browser. Registry availability is a separate post-publication check.
