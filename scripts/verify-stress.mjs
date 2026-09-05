import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { openDevToolsPanel } from '../tests/e2e/panel-helpers.mjs';

// A local observation, not a production performance guarantee. Build packages before running.
const appDir = resolve('tests/apps/svelte');
const base = 'http://localhost:5180';
const token = 'svelte-devtools-local-stress-token';
const server = spawn(resolve(appDir, 'node_modules/.bin/vite'), ['--port', '5180', '--strictPort', '--clearScreen', 'false'], {
  cwd: appDir, env: { ...process.env, SVELTE_DEVTOOLS_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', chunk => { log += chunk.toString(); });
server.stderr.on('data', chunk => { log += chunk.toString(); });
const readCode = () => [...log.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/devframe auth code\s*(\d{6})/g)].at(-1)?.[1] ?? '';
let browser;
try {
  await expect.poll(async () => {
    if (server.exitCode !== null) throw new Error(`Stress server exited: ${log}`);
    try { return (await fetch(base)).status; } catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => console.error('Browser error:', error.message));
  const started = performance.now();
  const frame = await openDevToolsPanel(page, `${base}/stress.html`, readCode);
  const headers = { Authorization: `Bearer ${token}` };
  const api = async (query = '') => {
    const response = await fetch(`${base}/__svelte-devtools/api/components${query}`, { headers });
    expect(response.ok).toBe(true);
    return response.json();
  };
  await expect.poll(async () => (await api('?name=StressItem&includeState=false')).count, { timeout: 30000 }).toBe(1000);
  const mountedMs = Math.round(performance.now() - started);
  const metadataResponse = await fetch(`${base}/__svelte-devtools/api/components?name=StressItem&includeState=false`, { headers });
  const metadataText = await metadataResponse.text();
  const metadata = JSON.parse(metadataText);
  expect(new Set(metadata.components.map(component => component.id)).size).toBe(1000);
  const originalIds = new Set(metadata.components.map(component => component.id));
  const runtimeItems = () => page.evaluate(() => {
    const collect = nodes => nodes.flatMap(node => [node, ...collect(node.children ?? [])]);
    return collect(window.__SVELTE_DEVTOOLS__.getComponentTree()).filter(component => component.name === 'StressItem').map(component => component.id);
  });
  expect((await runtimeItems()).length).toBe(1000);
  await frame.locator('.sidebar button[title="Components"]').click();
  const search = frame.getByPlaceholder('Search components...');
  await search.fill('StressItem');
  await expect(frame.locator('.match-count')).toHaveText('1000 matches');
  const updateStarted = performance.now();
  await page.getByRole('button', { name: 'Update all', exact: true }).evaluate(button => button.click());
  await expect(page.getByTestId('stress-item-999')).toHaveText('999: 1 / 0');
  await expect.poll(async () => {
    const data = await api('?name=StressItem');
    return data.components.filter(component => component.props.generation === 1).length;
  }, { timeout: 30000 }).toBe(1000);
  const updateAndSyncMs = Math.round(performance.now() - updateStarted);
  const keyboardStarted = performance.now();
  const row = frame.getByRole('button', { name: 'Select StressItem component', exact: true }).first();
  await row.focus();
  await row.press('Enter');
  await expect(row).toHaveClass(/selected/);
  await frame.getByRole('button', { name: 'State', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Edit count', exact: true })).toBeVisible();
  const keyboardSelectionMs = Math.round(performance.now() - keyboardStarted);
  const unmountStarted = performance.now();
  await page.getByRole('button', { name: 'Unmount all', exact: true }).evaluate(button => button.click());
  await expect(page.getByTestId('stress-item-999')).toHaveCount(0);
  await expect.poll(async () => (await runtimeItems()).length).toBe(0);
  await expect.poll(async () => (await api('?name=StressItem')).count, { timeout: 30000 }).toBe(0);
  await expect(frame.locator('.match-count')).toHaveText('0 matches');
  await expect(frame.getByRole('button', { name: 'Select StressItem component', exact: true })).toHaveCount(0);
  expect((await api()).components.some(component => originalIds.has(component.id))).toBe(false);
  console.log(JSON.stringify({
    fixture: '1000 instrumented StressItem instances', host: '@vitejs/devtools 0.4.8',
    mountedUnique: 1000, metadataBytes: Buffer.byteLength(metadataText),
    mountAuthorizePanelAndSyncMs: mountedMs, updateAndSyncMs, keyboardSelectionMs,
    unmountAndSyncMs: Math.round(performance.now() - unmountStarted),
    remainingRuntimeItems: 0, remainingApiItems: 0, remainingPanelItems: 0,
    note: 'Local headless Chromium observation. Timing includes browser automation and panel sync; no performance threshold is asserted.',
  }, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => {
      const timeout = setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 2000);
      server.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
}
