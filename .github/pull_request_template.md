## Change

Describe the concrete problem, the trigger, and the resulting behavior. Link the relevant issue or completion-audit discrepancy IDs (`D01`–`D46`, `S1`–`S16`).

## Validation

List the exact commands run and their results. State any failures or checks not run.

- Build and type check (`npm run build && npm run check`):
- Version reference check (`node scripts/bump-version.mjs --check`):
- Unit tests (`npx vitest run --maxWorkers=2`):
- Browser E2E tests and real sample application used (`npm run test:e2e`; specify `svelte`, `svelte-kit`, `todo-sqlite`, or `pokedex`):
- Authenticated HTTP API / MCP observation (`/api/*` with `Authorization: Bearer <token>` and live panel sync):
- Package gate (`npm run release:check`):

For UI or panel changes, rebuild `packages/client` (`npm run build:client`), restart the dev server, and attach screenshots or a short recording of the live application and panel. Include narrow-layout, theme, and keyboard-resize checks where relevant. For component identity, state capture, or restore changes, report the mandatory Spring counter undo/redo regression result (`2 / 2` -> `1 / 2` at `0` -> `2 / 2` at `1`).

## Documentation and limits

Identify updated documentation (`README.md`, `docs/06_api.md`, `docs/07_mcp.md`, `skills/*.md`, or ADRs in `docs/adr/`). State remaining limitations or boundaries that affect this change. Remove sections that do not apply and explain any omitted validation.
