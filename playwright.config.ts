import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser E2E suite (ADR-0013).
 *
 * Wired independently from Vitest: `vitest.config.ts` only collects
 * `tests/**\/*.test.ts`, and this suite only matches `*.spec.ts` inside
 * `tests/e2e/`. It runs exclusively via `npm run test:e2e` / `npx playwright test`.
 *
 * The global setup starts the plain Svelte test app (`tests/apps/svelte`) on
 * port 5173, waits for HTTP 200, and captures the Vite DevTools Manual Auth
 * Token from the server output. The smoke test then authenticates the dock
 * through the documented manual-dialog flow and asserts the Svelte panel.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.spec.ts',
	// One shared dev server is started by the global setup — keep the suite serial.
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 120_000,
	expect: { timeout: 10_000 },
	globalSetup: './tests/e2e/global-setup.ts',
	reporter: [['list']],
	outputDir: 'test-results',
	use: {
		baseURL: 'http://localhost:5173',
		// Headless keeps the dock in embedded-iframe mode (no DocumentPictureInPicture),
		// so the DevTools panel frame is reachable via page.frames().
		headless: true,
		viewport: { width: 1280, height: 800 },
		trace: 'retain-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
