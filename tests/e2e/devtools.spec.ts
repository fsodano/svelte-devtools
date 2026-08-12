import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import { BASE_URL, TOKEN_FILE } from './constants';

/**
 * Browser smoke test for the Svelte DevTools panel (ADR-0013).
 *
 * Flow (documented in AGENTS.md as the "manual dialog" method — the only
 * reliably working auth flow for the Vite DevTools kit):
 *   1. Load the test app — the devtools client requests authorization and the
 *      global setup captures the printed Manual Auth Token to TOKEN_FILE.
 *   2. Click the dock's "Unauthorized" button (inside the shadow root).
 *   3. Type the token into the auth dialog and click "Authorize".
 *   4. Open the "Svelte" dock entry and wait for the DevTools iframe.
 *   5. Assert a real component from the test app appears in the component tree.
 *
 * Headless Chromium renders the dock embedded in the page (DocumentPictureInPicture
 * is unavailable), so the panel is a plain iframe reachable via page.frames().
 */

const DOCK_SELECTOR = 'vite-devtools-dock-embedded';

function readCapturedToken(): string | null {
	try {
		const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
		return token || null;
	} catch {
		return null;
	}
}

async function waitForAuthToken(timeoutMs = 20_000): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const token = readCapturedToken();
		if (token) return token;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(
		`Manual Auth Token was not captured within ${timeoutMs}ms. ` +
			`Expected the global setup to write ${TOKEN_FILE} once the browser ` +
			`requested authorization. Check the server log and that the test app ` +
			`is wired with DevTools() in vite.config.ts.`,
	);
}

/**
 * Click a dock button whose text or `title` matches `label`, inside the dock
 * shadow root. Entry buttons render their icons as SVGs (no text), so the
 * title attribute is the reliable handle (e.g. title="Svelte").
 */
async function clickDockButton(page: Page, label: string): Promise<boolean> {
	return page.evaluate((text) => {
		const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
		const button = Array.from(dock?.querySelectorAll('button') ?? []).find(
			(b) =>
				(b.textContent ?? '').includes(text) ||
				b.getAttribute('title') === text,
		);
		if (!button) return false;
		button.click();
		return true;
	}, label);
}

test('authenticates the dock and renders the Svelte panel with real components', async ({
	page,
}) => {
	test.setTimeout(180_000);

	// 1. Load the app. This triggers the devtools client's auth request, which
	//    makes the global setup capture the Manual Auth Token.
	await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
	// The dock host element is always layout-hidden (its shadow content is
	// position:fixed), so wait for attachment, not visibility.
	await page.waitForSelector(DOCK_SELECTOR, { state: 'attached', timeout: 20_000 });
	// The dock shows "Unauthorized" only after the auth request has been made —
	// wait for that state before reading the token so we do not race the print.
	await page.waitForFunction(() => {
		const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
		return Array.from(dock?.querySelectorAll('button') ?? []).some((b) =>
			(b.textContent ?? '').includes('Unauthorized'),
		);
	}, { timeout: 20_000 });

	const token = await waitForAuthToken();

	// 2. Open the auth dialog from the dock.
	const openedDialog = await clickDockButton(page, 'Unauthorized');
	expect(openedDialog, 'dock "Unauthorized" button should be clickable').toBe(true);

	// 3. Type the token and submit it. The auth panel lives inside the dock's
	//    shadow root, which Playwright reports as hidden — force the fill and
	//    click through the DOM directly.
	const tokenInput = page.locator(
		`${DOCK_SELECTOR} input[placeholder="Enter auth token"]`,
	);
	await tokenInput.waitFor({ state: 'attached', timeout: 10_000 });
	await tokenInput.fill(token, { force: true });

	const authorized = await clickDockButton(page, 'Authorize');
	expect(authorized, 'dock "Authorize" button should be clickable').toBe(true);

	// 4. Wait for trust: the "Unauthorized" button must disappear.
	await page.waitForFunction(
		() => {
			const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
			return !Array.from(dock?.querySelectorAll('button') ?? []).some((b) =>
				(b.textContent ?? '').includes('Unauthorized'),
			);
		},
		{ timeout: 20_000 },
	);

	// 5. Open the Svelte DevTools panel via the dock entry. The entries load
	//    over RPC after trust, so wait for the button to exist before clicking.
	await page.waitForFunction(
		() => {
			const dock = document.querySelector('vite-devtools-dock-embedded')?.shadowRoot;
			return Array.from(dock?.querySelectorAll('button') ?? []).some(
				(b) => b.getAttribute('title') === 'Svelte',
			);
		},
		{ timeout: 20_000 },
	);
	const openedPanel = await clickDockButton(page, 'Svelte');
	expect(openedPanel, 'dock "Svelte" entry should be clickable').toBe(true);

	// 6. Wait for the DevTools iframe (rendered inside the dock shadow root).
	await page.waitForFunction(
		() => {
			const dock = document.querySelector('vite-devtools-dock-embedded');
			const iframe = dock?.shadowRoot?.querySelector('iframe');
			return (
				iframe !== null &&
				iframe !== undefined &&
				(iframe.src || '').includes('__svelte-devtools')
			);
		},
		{ timeout: 30_000 },
	);

	const devtoolsFrame = page.frames().find((f) => f.url().includes('__svelte-devtools'));
	expect(devtoolsFrame, 'DevTools panel frame should exist').toBeTruthy();
	const frame = devtoolsFrame!;

	// 7. The panel defaults to the Dashboard tab — open the component tree.
	const componentsTab = frame.locator('.sidebar button[title="Components"]');
	await componentsTab.waitFor({ state: 'visible', timeout: 15_000 });
	await componentsTab.click();

	// 8. Assert a real component from the test app appears in the tree.
	const componentRow = frame.locator(
		'.component-row[aria-label="Select TestAllCases component"]',
	);
	await componentRow.waitFor({ state: 'visible', timeout: 30_000 });
	await expect(componentRow).toBeVisible();

	// The tree is populated from the live runtime, not a stub — double-check the
	// child component is also present so the assertion covers real registration.
	await expect(
		frame.locator('.component-row[aria-label="Select ChildComponent component"]'),
	).toBeVisible({ timeout: 15_000 });
});
