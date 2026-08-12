import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const APP_URL = 'http://localhost:5174';
const TMUX_SESSION = 'svelte-kit';

/**
 * Authorize the Vite DevTools dock using the manual-token dialog (the only
 * reliable method — see AGENTS.md). The Manual Auth Token is single-use and
 * changes with each WebSocket handshake, so it is read from the tmux pane
 * immediately before use. When no "Unauthorized" button is present the dock
 * is already authorized and the helper is a no-op.
 */
async function authorizeDock(page: Page): Promise<void> {
	// The dock may be hidden or absent in some environments; the app behaviors
	// under test never depend on panel authorization, so this is best-effort.
	try {
		await page.waitForSelector('vite-devtools-dock-embedded', { state: 'attached', timeout: 5_000 });
	} catch {
		return;
	}

	const isUnauthorized = await page.evaluate(() => {
		const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
		return Array.from(dock?.querySelectorAll('button') || []).some((b) =>
			b.textContent?.includes('Unauthorized')
		);
	});
	if (!isUnauthorized) return;

	const token = execSync(`tmux capture-pane -t ${TMUX_SESSION} -p -S -200`)
		.toString()
		.match(/Manual Auth Token : (\S+)/)?.[1];
	if (!token) return;

	// Open the auth dialog via the "Unauthorized" dock button
	await page.evaluate(() => {
		const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
		const btn = Array.from(dock?.querySelectorAll('button') || []).find((b) =>
			b.textContent?.includes('Unauthorized')
		);
		(btn as HTMLButtonElement | undefined)?.click();
	});
	await page.waitForTimeout(300);

	await page
		.locator('vite-devtools-dock-embedded')
		.first()
		.locator('input')
		.first()
		.fill(token as string);
	await page.waitForTimeout(200);

	// Confirm the token in the dialog
	await page.evaluate(() => {
		const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
		const btn = Array.from(dock?.querySelectorAll('button') || []).find((b) =>
			b.textContent?.includes('Authorize')
		);
		(btn as HTMLButtonElement | undefined)?.click();
	});
	await page.waitForTimeout(1500);
}

test.beforeEach(async ({ page }) => {
	await page.goto(`${APP_URL}/navigation-test`, { waitUntil: 'domcontentloaded' });
	// Let the Svelte runtime, SSR hydration, and the Vite DevTools dock settle.
	await page.waitForTimeout(2500);
	await authorizeDock(page);
});

test('afterNavigate fires on the initial navigation', async ({ page }) => {
	await expect(page.getByTestId('navigations')).toHaveText(/navigations: [1-9]/);
});

test('invalidateAll re-runs the load function', async ({ page }) => {
	const loadCount = page.getByTestId('load-count');
	await expect(loadCount).toHaveText(/load count: \d+/);

	const before = (await loadCount.textContent()) ?? '';
	await page.getByTestId('refresh').click();

	// The load counter is monotonic, so the displayed value must change.
	await expect.poll(async () => (await loadCount.textContent()) ?? '').not.toBe(before);
});

test('armed beforeNavigate guard cancels link navigation', async ({ page }) => {
	await page.getByTestId('arm-guard').click();
	await expect(page.getByTestId('cancellations')).toHaveText('cancellations: 0');

	const navigationsBefore = (await page.getByTestId('navigations').textContent()) ?? '';
	await page.getByTestId('nav-link').click();
	await page.waitForTimeout(800);

	// The navigation was cancelled: the URL is unchanged...
	expect(page.url()).toContain('/navigation-test');
	await expect(page.getByTestId('cancellations')).toHaveText('cancellations: 1');
	// ...and afterNavigate did not fire for the cancelled navigation.
	await expect(page.getByTestId('navigations')).toHaveText(navigationsBefore);
});
