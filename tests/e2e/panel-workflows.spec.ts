import { expect, test, type Frame, type Page } from '@playwright/test';
import { openDevToolsPanel } from './panel-helpers.mjs';
import { readFileSync } from 'node:fs';
import { API_TOKEN, BASE_URL, TOKEN_FILE } from './constants';

test.use({ actionTimeout: 10_000 });

function capturedToken(): string {
  try { return readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
}

async function openPanel(page: Page, path = '/'): Promise<Frame> {
  return openDevToolsPanel(page, `${BASE_URL}${path}`, capturedToken);
}

async function fetchResource(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/test-mock-resource.json?x=1', { cache: 'no-store' });
    return { status: response.status, body: await response.text() };
  });
}

test('creates a mock from a captured request, intercepts it, and disables it', async ({ page }) => {
  const frame = await openPanel(page);
  await frame.locator('.sidebar button[title="Network"]').click();
  const baseline = await fetchResource(page);
  expect(baseline).toEqual({ status: 200, body: '{"mocked":false}' });
  const row = frame.locator('.entry-row').filter({ hasText: 'test-mock-resource.json' }).first();
  await expect(row).toBeVisible();
  await row.click();
  await frame.getByRole('button', { name: 'Mock this request', exact: true }).click();
  await expect(frame.getByLabel('URL pattern (regular expression)')).toHaveValue(/test-mock-resource/);
  await expect(frame.getByLabel('Request method')).toHaveValue('GET');
  await frame.getByLabel('Response status').fill('201');
  await frame.getByLabel('Content type', { exact: true }).fill('application/json');
  await frame.getByLabel('Response body', { exact: true }).fill('{"mocked":true}');
  await frame.getByRole('button', { name: 'Enable mock rule', exact: true }).click();
  await expect(frame.locator('.rule-card')).toHaveCount(1);
  await expect.poll(() => fetchResource(page)).toEqual({ status: 201, body: '{"mocked":true}' });
  await frame.getByRole('button', { name: 'Requests', exact: true }).click();
  await expect(frame.locator('.entry-row').filter({ hasText: 'test-mock-resource.json' }).filter({ has: frame.locator('.mock-badge') }).first()).toBeVisible();
  await frame.getByRole('button', { name: /Mock Rules/ }).click();
  await frame.locator('.rule-card button[title="Disable"]').click();
  await expect.poll(() => fetchResource(page)).toEqual(baseline);
});

test('applies appearance settings and preserves them across panel reload', async ({ page }) => {
  const frame = await openPanel(page);
  await frame.locator('.sidebar button[title="Settings"]').click();
  await frame.getByLabel('Theme', { exact: true }).selectOption('dark');
  await frame.getByRole('button', { name: 'Huge', exact: true }).click();
  await frame.getByRole('switch', { name: 'Reduce motion' }).click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(frame.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await expect.poll(() => frame.locator('html').evaluate((root) => getComputedStyle(root).zoom)).toBe('1.3');
  const geometry = await frame.locator('.panel').evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    return { height: bounds.height, width: bounds.width, viewportHeight: innerHeight, viewportWidth: innerWidth };
  });
  expect(Math.abs(geometry.height - geometry.viewportHeight)).toBeLessThan(2);
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  await expect.poll(() => frame.getByRole('switch', { name: 'Reduce motion' }).evaluate((toggle) => getComputedStyle(toggle).transitionDuration)).toBe('0s');
  await frame.locator('.sidebar button[title="Network"]').click();
  await frame.locator('.sidebar button[title="Settings"]').click();
  await expect(frame.getByRole('button', { name: 'Huge', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await frame.evaluate(() => location.reload());
  await frame.locator('.sidebar button[title="Settings"]').click();
  await expect(frame.getByLabel('Theme', { exact: true })).toHaveValue('dark');
  await expect(frame.getByRole('button', { name: 'Huge', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(frame.getByRole('switch', { name: 'Reduce motion' })).toHaveAttribute('aria-checked', 'true');
  await frame.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(frame.getByLabel('Theme', { exact: true })).toHaveValue('system');
  await expect.poll(() => frame.locator('html').evaluate((root) => getComputedStyle(root).zoom)).toBe('1');
  await expect(frame.getByRole('switch', { name: 'Reduce motion' })).toHaveAttribute('aria-checked', 'false');
});

test('resizes network and component panes with keyboard and resets their size', async ({ page }) => {
  const frame = await openPanel(page);
  for (const [tab, label] of [['Network', 'Resize network request panels'], ['Components', 'Resize component tree and details']]) {
    await frame.locator(`.sidebar button[title="${tab}"]`).click();
    const separator = frame.getByRole('separator', { name: label });
    await expect(separator).toBeVisible();
    const initial = await separator.getAttribute('aria-valuenow');
    const pane = separator.locator('..').locator(':scope > .pane').first();
    const before = await pane.boundingBox();
    await separator.focus();
    await separator.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', '20');
    const after = await pane.boundingBox();
    expect(after).not.toEqual(before);
    await separator.press('End');
    await expect(separator).toHaveAttribute('aria-valuenow', '80');
    await separator.press('Enter');
    await expect(separator).toHaveAttribute('aria-valuenow', initial!);
    const horizontal = await separator.getAttribute('aria-orientation') === 'horizontal';
    await separator.press(horizontal ? 'ArrowDown' : 'ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', String(Number(initial) + 2));
  }
});


test('edits repeated component state with validation, sibling isolation, and undo/redo', async ({ page }) => {
  const frame = await openPanel(page, '/state-edit.html');
  const componentsTab = frame.locator('.sidebar button[title="Components"]');
  await componentsTab.click();
  const instances = frame.getByRole('button', { name: 'Select StateEditInstance component', exact: true });
  await expect(instances).toHaveCount(2);
  await instances.first().click();
  await frame.getByRole('button', { name: 'State', exact: true }).click();
  const readOnly = frame.locator('.state-row').filter({ has: frame.locator('.prop-key', { hasText: /^doubled$/ }) });
  await expect(readOnly).toContainText('Read-only');
  await expect(readOnly.getByRole('button')).toHaveCount(0);
  const callback = frame.locator('.state-row').filter({ has: frame.locator('.prop-key', { hasText: /^onClick$/ }) });
  await expect(callback).toContainText('Read-only');
  await expect(callback.getByRole('button')).toHaveCount(0);

  await frame.getByRole('button', { name: 'Edit count', exact: true }).click();
  await frame.getByLabel('JSON value for count', { exact: true }).fill('{invalid');
  await frame.getByRole('button', { name: 'Save & record', exact: true }).click();
  await expect(frame.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('first-count')).toHaveText('1');
  await expect(page.getByTestId('second-count')).toHaveText('1');
  await frame.getByRole('button', { name: 'Cancel', exact: true }).click();

  for (const [key, replacement, original] of [
    ['count', '7', '1'],
    ['profile', '{"name":"Edited","nested":{"enabled":false}}', '{"name":"Original","nested":{"enabled":true}}'],
    ['items', '["replacement",3]', '["first","second"]'],
  ]) {
    await componentsTab.click();
    await instances.first().click();
    await frame.getByRole('button', { name: 'State', exact: true }).click();
    await frame.getByRole('button', { name: `Edit ${key}`, exact: true }).click();
    await frame.getByLabel(`JSON value for ${key}`, { exact: true }).fill(replacement);
    await frame.getByRole('button', { name: 'Save & record', exact: true }).click();
    await expect(page.getByTestId(`first-${key}`)).toHaveText(replacement);
    await expect(page.getByTestId(`second-${key}`)).toHaveText(original);
    await frame.locator('.sidebar button[title="Time Travel"]').click();
    await expect(frame.locator('.record-btn')).toContainText('Recording');
    const count = frame.locator('.count');
    const snapshotCount = await count.textContent();
    await frame.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByTestId(`first-${key}`)).toHaveText(original);
    await expect(page.getByTestId(`second-${key}`)).toHaveText(original);
    await frame.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.getByTestId(`first-${key}`)).toHaveText(replacement);
    await expect(page.getByTestId(`second-${key}`)).toHaveText(original);
    await expect(count).toHaveText(snapshotCount!);
  }
  await expect(page.getByTestId('first-doubled')).toHaveText('14');
  await expect(page.getByTestId('second-doubled')).toHaveText('2');
});

test('restores the SvelteKit Spring counter without adding phantom snapshots', async ({ page }) => {
  const frame = await openPanel(page, '/spring-counter.html');
  await frame.locator('.sidebar button[title="Time Travel"]').click();
  await frame.locator('.record-btn').click();
  await expect(frame.locator('.record-btn')).toContainText('Recording');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Increase the counter by one' }).evaluate((button: HTMLButtonElement) => button.click());
  // Observe the settled Spring, not just the first reactive update.
  await page.waitForTimeout(5000);
  await expect(frame.locator('.count')).toHaveText('2 / 2');
  await frame.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForTimeout(4000);
  await expect(frame.locator('.count')).toHaveText('1 / 2');
  await expect(page.locator('.counter-digits strong:not(.hidden)')).toHaveText('0');
  await frame.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.waitForTimeout(5000);
  await expect(frame.locator('.count')).toHaveText('2 / 2');
  await expect(page.locator('.counter-digits strong:not(.hidden)')).toHaveText('1');
});


test('applies acknowledged HTTP state commands to one live instance with undo support', async ({ page, request }) => {
  const openedAt = Date.now();
  const frame = await openPanel(page, '/state-edit.html');
  const headers = { Authorization: `Bearer ${API_TOKEN}` };
  const api = `${BASE_URL}/__svelte-devtools/api`;
  await expect.poll(async () => {
    const status = await (await request.get(`${api}/`, { headers })).json();
    return status.capabilities.sessions?.filter((session: { lastSeen: number; url: string }) => session.lastSeen >= openedAt && session.url.includes('state-edit.html')).length ?? 0;
  }).toBeGreaterThan(0);
  const status = await (await request.get(`${api}/`, { headers })).json();
  const sessionId = status.capabilities.sessions
    .filter((session: { url: string }) => session.url.includes('state-edit.html'))
    .sort((a: { lastSeen: number }, b: { lastSeen: number }) => b.lastSeen - a.lastSeen)[0].id;
  await expect.poll(async () => {
    const data = await (await request.get(`${api}/components`, { headers })).json();
    return data.components.filter((component: { name: string }) => component.name === 'StateEditInstance').length;
  }).toBe(2);
  const data = await (await request.get(`${api}/components`, { headers })).json();
  const componentId = data.components.find((component: { name: string }) => component.name === 'StateEditInstance').id;
  const submit = (key: string, value: unknown, target = componentId) => request.post(`${api}/set-state`, {
    headers, data: { sessionId, componentId: target, key, value },
  });
  const result = await submit('count', 9);
  expect(result.status()).toBe(200);
  expect(await result.json()).toMatchObject({ ok: true, recording: true });
  await expect(page.getByTestId('first-count')).toHaveText('9');
  await expect(page.getByTestId('second-count')).toHaveText('1');
  await frame.locator('.sidebar button[title="Time Travel"]').click();
  await expect(frame.locator('.count')).toHaveText('2 / 2');
  await frame.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('first-count')).toHaveText('1');
  await frame.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('first-count')).toHaveText('9');
  for (const [key, target] of [['doubled', componentId], ['missing', componentId], ['count', 'missing-instance']]) {
    const rejected = await submit(key, 55, target);
    expect(rejected.status()).toBe(409);
    expect(await rejected.json()).toMatchObject({ ok: false });
  }
  await expect(page.getByTestId('first-count')).toHaveText('9');
  await expect(page.getByTestId('first-doubled')).toHaveText('18');
  await expect(page.getByTestId('second-count')).toHaveText('1');
  await expect(frame.locator('.count')).toHaveText('2 / 2');
});

test('continues recording after a Spring component unmounts during motion', async ({ page }) => {
  const frame = await openPanel(page, '/motion-unmount.html');
  await frame.locator('.sidebar button[title="Time Travel"]').click();
  await frame.locator('.record-btn').click();
  const digits = page.locator('.counter-digits');
  const settledStyle = await digits.getAttribute('style');
  await page.getByRole('button', { name: 'Increase the counter by one' }).evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => digits.getAttribute('style')).not.toBe(settledStyle);
  await page.getByRole('button', { name: 'Unmount motion', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(digits).toHaveCount(0);
  // Let the normal state capture complete before making an independent edit.
  await page.waitForTimeout(250);
  const before = await frame.locator('.count').textContent();
  await page.getByRole('button', { name: 'Increment survivor', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByTestId('survivor-count')).toHaveText('1');
  await expect(frame.locator('.count')).not.toHaveText(before!);
  await frame.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('survivor-count')).toHaveText('0');
});

test('bounds real network history at 500 and keeps cleared requests dismissed across polls', async ({ page, request }) => {
  const frame = await openPanel(page);
  const nextServerPoll = () => page.waitForResponse(response => new URL(response.url()).pathname === '/__svelte-devtools/api/server-events');
  const initialPoll = nextServerPoll();
  await frame.locator('.sidebar button[title="Network"]').click();
  const initialResponse = await initialPoll;
  expect(initialResponse.ok()).toBe(true);
  const initialBuffer = await initialResponse.json();
  const rows = frame.locator('.entry-row');
  const clientRows = rows.filter({ has: frame.locator('.type-icon').filter({ hasText: '🌐' }) });
  const serverRows = rows.filter({ has: frame.locator('.type-icon').filter({ hasText: '🖥️' }) });
  const clear = frame.getByRole('button', { name: 'Clear', exact: true });
  // Wait for the initial server buffer to render before clearing visible history.
  // Clear does not discard requests that have not arrived yet.
  if (initialBuffer.events.length > 0) {
    await expect(frame.locator('.type-icon').filter({ hasText: /🖥️|❌|▤/ })).toHaveCount(Math.min(500, initialBuffer.events.length));
  }
  if (await clear.isEnabled()) await clear.click();
  await expect(rows).toHaveCount(0);

  // Stay below the producer's rolling 50-event buffer per batch, and observe every batch.
  for (let start = 0; start < 525; start += 25) {
    const responses = await page.evaluate(async (offset) => Promise.all(
      Array.from({ length: 25 }, async (_, index) => {
        const response = await fetch(`/test-mock-resource.json?history=${offset + index}`, { cache: 'no-store' });
        return { status: response.status, body: await response.text() };
      }),
    ), start);
    expect(responses.every(response => response.status === 200 && response.body === '{"mocked":false}')).toBe(true);
    await expect(clientRows.locator(`.request-url[title$="?history=${start + 24}"]`)).toHaveCount(1);
  }
  await expect(rows).toHaveCount(500);
  await expect(frame.locator('.request-url[title$="?history=0"]')).toHaveCount(0);
  await expect.poll(async () => {
    const response = await request.get(`${BASE_URL}/__svelte-devtools/api/timeline?type=client:request`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    expect(response.ok()).toBe(true);
    const data = await response.json();
    return data.entries.some((entry: { data?: { url?: string } }) => entry.data?.url?.endsWith('?history=524'));
  }).toBe(true);

  // Both browser and server capture these fetches. Wait for the server's
  // final request before clearing, so later arrivals are not mistaken for replay.
  await expect(serverRows.locator('.request-url[title$="?history=524"]')).toHaveCount(1);
  const capturedServer = await request.get(`${BASE_URL}/__svelte-devtools/api/server-events`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  expect(capturedServer.ok()).toBe(true);
  const serverBuffer = await capturedServer.json();
  expect(new Set(serverBuffer.events.map((event: { id: string }) => event.id)).size).toBe(serverBuffer.events.length);
  expect(serverBuffer.events.filter((event: { data?: { url?: string } }) => event.data?.url?.endsWith('?history=524'))).toHaveLength(1);

  await clear.click();
  await expect(rows).toHaveCount(0);
  await nextServerPoll();
  await nextServerPoll();
  await expect(rows).toHaveCount(0);
  await page.evaluate(async () => {
    const response = await fetch('/test-mock-resource.json?after-clear=true', { cache: 'no-store' });
    await response.text();
  });
  await expect(clientRows).toHaveCount(1);
  await expect(clientRows.locator('.request-url[title$="?after-clear=true"]')).toHaveCount(1);
  await nextServerPoll();
  await expect(serverRows.locator('.request-url[title$="?after-clear=true"]')).toHaveCount(1);
  await expect(rows).toHaveCount(2);
  await expect(frame.locator('.request-url[title*="?history="]')).toHaveCount(0);
});
