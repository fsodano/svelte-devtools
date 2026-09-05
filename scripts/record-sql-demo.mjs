import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openDevToolsPanel } from '../tests/e2e/panel-helpers.mjs';

// Build packages and install Todo dependencies first. Requires Chromium and ffmpeg.
const temporary = await mkdtemp(join(tmpdir(), 'svelte-sql-demo-'));
const output = resolve('docs/media');
const token = randomUUID();
const base = 'http://localhost:5192';
const cwd = resolve('tests/apps/todo-sqlite');
const server = spawn(resolve(cwd, 'node_modules/.bin/vite'), ['--port', '5192', '--strictPort', '--clearScreen', 'false'], {
  cwd, env: { ...process.env, SVELTE_DEVTOOLS_TOKEN: token, TODO_SQLITE_DB_PATH: join(temporary, 'todos.db') }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', browser;
server.stdout.on('data', value => log += value); server.stderr.on('data', value => log += value);
const code = () => [...log.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/devframe auth code\s*(\d{6})/g)].at(-1)?.[1] ?? '';
const events = async () => (await (await fetch(`${base}/__svelte-devtools/api/server-events`, { headers: { Authorization: `Bearer ${token}` } })).json()).events;
try {
  await expect.poll(async () => { if (server.exitCode !== null) throw new Error(log); try { return (await fetch(base)).status; } catch { return 0; } }, { timeout: 30000 }).toBe(200);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', recordVideo: { dir: temporary, size: { width: 1440, height: 1000 } } });
  const page = await context.newPage();
  const videoStart = Date.now();
  const frame = await openDevToolsPanel(page, base, code);
  await frame.locator('.sidebar button[title="Settings"]').click();
  await frame.getByLabel('Theme', { exact: true }).selectOption('dark');
  await frame.getByRole('button', { name: 'Large', exact: true }).click();
  await frame.locator('.sidebar button[title="Network"]').click();
  let entry;
  const dock = page.locator('vite-devtools-dock-embedded');
  for (const candidate of await dock.locator('.vite-devtools-dock-entry').all()) {
    await candidate.dispatchEvent('pointerenter');
    if (await dock.locator('.z-floating-tooltip').filter({ hasText: /^Svelte$/ }).count()) { entry = candidate.locator('button'); break; }
    await candidate.dispatchEvent('pointerleave');
  }
  expect(entry).toBeTruthy();
  await entry.evaluate(button => button.click());
  await expect(page.getByRole('textbox', { name: 'New todo title' })).toBeVisible();
  await page.waitForTimeout(700);
  const start = (Date.now() - videoStart) / 1000;
  await page.waitForTimeout(1200);
  const title = 'Inspect the save request and SQL timings';
  await page.getByRole('textbox', { name: 'New todo title' }).pressSequentially(title, { delay: 35 });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('li').filter({ hasText: title })).toHaveCount(1);
  expect(await (await fetch(base)).text()).toContain(title);
  let root, insert;
  await expect.poll(async () => {
    const all = await events();
    root = all.find(e => e.data?.method === 'POST' && e.data?.url === '/?/create' && e.data?._handler === 'sveltekit');
    insert = all.find(e => e.type === 'server:sql' && e.data.statement?.startsWith('INSERT') && e.data.traceId === root?.data.traceId);
    return !!root && !!insert;
  }).toBe(true);
  const all = await events();
  expect(insert.data.parentSpanId).toBe(root.data.spanId);
  expect(all.some(e => e.type === 'server:sql' && e.data.statement?.startsWith('SELECT'))).toBe(true);
  for (const span of [root, insert]) expect(span.duration).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(insert)).not.toContain(title);
  await page.waitForTimeout(1500);
  await entry.evaluate(button => button.click());
  const panel = page.frames().find(f => f.url().includes('__svelte-devtools'));
  await panel.locator('.sidebar button[title="Network"]').click();
  await panel.getByRole('button', { name: 'SSR', exact: true }).click();
  await panel.locator('.entry-row').filter({ hasText: '?/create' }).first().click();
  await expect(panel.getByText('Trace waterfall', { exact: true })).toBeVisible();
  await expect(panel.locator('.span-row')).toHaveCount(2);
  await page.waitForTimeout(2200);
  await panel.getByRole('button', { name: 'Inspect get span', exact: true }).click();
  await expect(panel.locator('.sql')).toContainText('INSERT INTO todos');
  await panel.getByRole('separator', { name: 'Resize network request panels' }).press('ArrowLeft');
  await panel.getByRole('separator', { name: 'Resize network request panels' }).press('ArrowLeft');
  await expect(panel.locator('.span-row .timing')).toHaveCount(2);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(2500);
  await panel.locator('html').screenshot({ path: join(output, 'todo-save-trace.png') });
  const duration = (Date.now() - videoStart) / 1000 - start;
  const video = page.video();
  await context.close();
  const raw = await video.path();
  execFileSync('ffmpeg', ['-y', '-ss', String(start), '-i', raw, '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(output, 'todo-save-trace.mp4')], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-i', join(output, 'todo-save-trace.mp4'), '-vf', 'fps=6,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer', '-loop', '0', join(output, 'todo-save-trace.gif')], { stdio: 'ignore' });
  await writeFile(join(output, 'todo-save-capture.json'), JSON.stringify({ fixture: 'tests/apps/todo-sqlite', isolatedDatabase: true, authenticationExcluded: true, start, duration, assertions: ['Actual form creates persisted todo', 'POST create root owns INSERT SQL span', 'SELECT load query observed', 'Per-span measured durations visible', 'SQL template contains no bound title'], spans: [root, insert].map(e => ({ type: e.type, duration: e.duration, traceId: e.data.traceId, spanId: e.data.spanId, parentSpanId: e.data.parentSpanId, statement: e.data.statement })) }, null, 2) + '\n');
  console.log('Verified and recorded actual Todo save, SSR parent, and executed SQLite span.');
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
}
