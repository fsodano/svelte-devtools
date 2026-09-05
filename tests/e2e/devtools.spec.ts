import { openDevToolsPanel } from './panel-helpers.mjs';
import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { BASE_URL, TOKEN_FILE, API_TOKEN } from './constants';

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

test('authenticates the dock and renders the Svelte panel with real components', async ({
	page,
}, testInfo) => {
	test.setTimeout(180_000);

	const frame = await openDevToolsPanel(page, BASE_URL, () => {
    try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
  });

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

  // Verify the same live registration through HTTP and a real MCP stdio process.
  const api = () => JSON.parse(execFileSync('curl', ['--silent', '--show-error', '--fail',
    '-H', `Authorization: Bearer ${API_TOKEN}`, `${BASE_URL}/__svelte-devtools/api/components`], { encoding: 'utf8' }));
  await expect.poll(() => api().count).toBeGreaterThan(0);
  expect(api().components.some((c: { name: string }) => c.name === 'ChildComponent')).toBe(true);
  const client = new Client({ name: 'devtools-e2e', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [resolve('packages/mcp/dist/cli.js')],
    env: { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')),
      SVELTE_DEVTOOLS_URL: BASE_URL, SVELTE_DEVTOOLS_TOKEN: API_TOKEN },
  });
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['svelte_status', 'svelte_components', 'svelte_set_state', 'svelte_snapshots', 'svelte_source']));
    const inspected = await client.callTool({ name: 'svelte_components', arguments: { name: 'ChildComponent' } });
    expect(inspected.isError).not.toBe(true);
    expect(inspected.structuredContent).toMatchObject({ total: 1 });
  } finally { await client.close(); }

  await frame.locator('.sidebar button[title="Info"]').click();
  await page.screenshot({ path: testInfo.outputPath('dashboard.png') });
  await frame.locator('.sidebar button[title="Graph"]').click();
  await expect(frame.locator('canvas')).toBeVisible();
  await frame.locator('.sidebar button[title="Info"]').click();
  await frame.locator('.sidebar button[title="Graph"]').click();
  await expect(frame.locator('canvas')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('graph.png') });

});
