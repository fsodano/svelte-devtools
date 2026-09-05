import { expect, test } from '@playwright/test';

const APP_URL = 'http://localhost:5174';

// These tests exercise app navigation. Dock authorization is covered by devtools.spec.ts.
test.beforeEach(async ({ page }) => {
	await page.goto(`${APP_URL}/navigation-test`, { waitUntil: 'domcontentloaded' });
	// Let the Svelte runtime, SSR hydration, and the Vite DevTools dock settle.
	await page.waitForTimeout(2500);
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
