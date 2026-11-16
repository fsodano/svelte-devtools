import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Shared constants for the Playwright E2E suite (ADR-0013).
 *
 * These paths must resolve identically in the global-setup process (which
 * spawns the dev server and watches its stdout) and in the test-worker
 * processes (which read the captured token). A deterministic path in the OS
 * temp dir keeps the suite out of the repository.
 */
/**
 * Ports for the two dev servers the browser suite starts.
 *
 * The defaults match the ports the documentation uses. Set
 * `SVELTE_E2E_PORT` and `SVELTE_E2E_KIT_PORT` to move them when the
 * defaults are busy. Both must stay free, because the servers use strict
 * ports and fail loudly instead of drifting to another port.
 */
export const PORT = Number(process.env.SVELTE_E2E_PORT ?? 5173);
export const KIT_PORT = Number(process.env.SVELTE_E2E_KIT_PORT ?? 5174);
export const BASE_URL = `http://localhost:${PORT}`;
export const KIT_BASE_URL = `http://localhost:${KIT_PORT}`;
export const BASE_DIR = path.dirname(
	new URL(import.meta.url).pathname,
);
/** Plain Svelte test app the global setup starts. */
export const TEST_APP_DIR = path.resolve(BASE_DIR, '..', 'apps', 'svelte');

/** Where the global setup writes the Manual Auth Token as it appears on the server stdout. */
export const TOKEN_FILE = path.join(
	os.tmpdir(),
	'svelte-devtools-e2e-auth-token',
);
/** Full server output, kept for diagnosing startup/auth failures. */
export const LOG_FILE = path.join(os.tmpdir(), 'svelte-devtools-e2e-server.log');

/** Line the Vite DevTools server prints when a browser requests authorization. */
export const MANUAL_AUTH_TOKEN_RE = /(?:Manual Auth Token\s*:|devframe auth code)\s*([A-Za-z0-9-]+)/;

/** Local test-only token shared by the spawned server and API checks. */
export const API_TOKEN = 'svelte-devtools-local-e2e-token';
