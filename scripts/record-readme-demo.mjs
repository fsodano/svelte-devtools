import { chromium, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDevToolsPanel } from '../tests/e2e/panel-helpers.mjs';

// Build packages and install the plain fixture first. Requires Chromium and ffmpeg.
const output = resolve('docs/media');
const raw = '/tmp/svelte-readme-recording';
await mkdir(output, { recursive: true }); await mkdir(raw, { recursive: true });
const base = 'http://localhost:5182';
const token = randomUUID();
const root = resolve('tests/apps/svelte');
const server = spawn(resolve(root, 'node_modules/.bin/vite'), ['--port', '5182', '--strictPort', '--clearScreen', 'false'], {
  cwd: root, env: { ...process.env, SVELTE_DEVTOOLS_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', chunk => log += chunk); server.stderr.on('data', chunk => log += chunk);
const code = () => [...log.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/devframe auth code\s*(\d{6})/g)].at(-1)?.[1] ?? '';
let browser; let client;
const clips = [];
try {
  await expect.poll(async () => {
    if (server.exitCode !== null) throw new Error('Demo server exited');
    try { return (await fetch(base)).status; } catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', recordVideo: { dir: raw, size: { width: 1440, height: 1000 } } });
  const page = await context.newPage();
  const videoStarted = Date.now();
  const frame = await openDevToolsPanel(page, `${base}/state-edit.html`, code);
  await frame.locator('.sidebar button[title="Settings"]').click();
  await frame.getByLabel('Theme', { exact: true }).selectOption('dark');
  await frame.getByRole('button', { name: 'Large', exact: true }).click();
  await frame.locator('.sidebar button[title="Components"]').click();
  await frame.getByRole('button', { name: 'Select StateEditInstance component', exact: true }).first().click();
  await frame.getByRole('button', { name: 'State', exact: true }).click();
  await frame.getByRole('separator', { name: 'Resize component tree and details' }).press('ArrowRight');
  await frame.getByRole('separator', { name: 'Resize component tree and details' }).press('ArrowRight');
  await frame.getByRole('button', { name: 'State', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Edit count', exact: true })).toBeVisible();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(1200);
  await frame.locator('html').screenshot({ path: resolve(output, 'components.png') });
  const bounds = await (await frame.frameElement()).boundingBox();
  if (!bounds) throw new Error('Panel geometry unavailable');
  const crop = { x: Math.ceil(bounds.x / 2) * 2, y: Math.ceil(bounds.y / 2) * 2, width: Math.floor(bounds.width / 2) * 2, height: Math.floor(bounds.height / 2) * 2 };
  client = new Client({ name: 'readme-demo', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('packages/mcp/dist/cli.js')], env: { ...process.env, SVELTE_DEVTOOLS_URL: base, SVELTE_DEVTOOLS_TOKEN: token } }));
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    return result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
  };
  let session;
  await expect.poll(async () => {
    const status = await call('svelte_status');
    session = status.capabilities.sessions.find(item => item.url.includes('state-edit.html'));
    return Boolean(session);
  }).toBe(true);
  let component;
  await expect.poll(async () => {
    const data = await call('svelte_components', { sessionId: session.id, name: 'StateEditInstance' });
    component = data.components.find(item => item.props.label === 'first');
    return Boolean(component);
  }).toBe(true);
  const start = (Date.now() - videoStarted) / 1000;
  await page.waitForTimeout(1800);
  const acknowledgement = await call('svelte_set_state', { sessionId: session.id, componentId: component.id, key: 'count', value: 7 });
  expect(acknowledgement.ok).toBe(true);
  await expect(page.getByTestId('first-count')).toHaveText('7');
  await expect(page.getByTestId('second-count')).toHaveText('1');
  await page.waitForTimeout(2300);
  await frame.locator('.sidebar button[title="Time Travel"]').click();
  await expect(frame.locator('.count')).toHaveText('2 / 2');
  await page.waitForTimeout(1500);
  await frame.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('first-count')).toHaveText('1');
  await expect(frame.locator('.count')).toHaveText('1 / 2');
  await page.waitForTimeout(2300);
  await frame.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('first-count')).toHaveText('7');
  await expect(frame.locator('.count')).toHaveText('2 / 2');
  await page.waitForTimeout(2300);
  await frame.locator('.sidebar button[title="Components"]').click();
  await frame.getByRole('button', { name: 'Select StateEditInstance component', exact: true }).first().click();
  await frame.getByRole('button', { name: 'State', exact: true }).click();
  await page.waitForTimeout(1800);
  clips.push({ name: 'agent-state-edit', start, duration: (Date.now() - videoStarted) / 1000 - start });

  await frame.locator('.sidebar button[title="Network"]').click();
  const fetchResource = () => page.evaluate(async () => {
    const response = await fetch('/test-mock-resource.json?readme-demo');
    return { status: response.status, body: await response.text() };
  });
  expect(await fetchResource()).toEqual({ status: 200, body: '{"mocked":false}' });
  const row = frame.locator('.entry-row').filter({ hasText: 'test-mock-resource.json' }).first();
  await row.click();
  const networkStart = (Date.now() - videoStarted) / 1000;
  await page.waitForTimeout(1800);
  await frame.getByRole('button', { name: 'Mock this request', exact: true }).click();
  await expect(frame.getByLabel('Request method')).toHaveValue('GET');
  await page.waitForTimeout(1300);
  await frame.getByLabel('Response status').fill('201');
  await frame.getByLabel('Response body', { exact: true }).fill('{"mocked":true}');
  await page.waitForTimeout(2000);
  await frame.getByRole('button', { name: 'Enable mock rule', exact: true }).click();
  await expect.poll(fetchResource).toEqual({ status: 201, body: '{"mocked":true}' });
  await page.waitForTimeout(1500);
  await frame.getByRole('button', { name: 'Requests', exact: true }).click();
  const mocked = frame.locator('.entry-row').filter({ hasText: 'test-mock-resource.json' }).filter({ has: frame.locator('.mock-badge') }).first();
  await mocked.click();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(2200);
  await frame.locator('html').screenshot({ path: resolve(output, 'network-mocking.png') });
  await frame.getByRole('button', { name: /Mock Rules/ }).click();
  await frame.locator('.rule-card button[title="Disable"]').click();
  await expect.poll(fetchResource).toEqual({ status: 200, body: '{"mocked":false}' });
  await frame.getByRole('button', { name: 'Requests', exact: true }).click();
  await frame.locator('.entry-row').filter({ hasText: 'test-mock-resource.json' }).first().click();
  await page.waitForTimeout(2000);
  clips.push({ name: 'network-mocking', start: networkStart, duration: (Date.now() - videoStarted) / 1000 - networkStart });
  await client.close(); client = null;
  const video = page.video();
  await context.close();
  const videoPath = await video.path();
  for (const clip of clips) {
    execFileSync('ffmpeg', ['-y', '-ss', String(clip.start), '-i', videoPath, '-t', String(clip.duration), '-an', '-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=1152:-2`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', resolve(output, `${clip.name}.mp4`)], { stdio: 'ignore' });
  }
  execFileSync('ffmpeg', ['-y', '-i', resolve(output, 'agent-state-edit.mp4'), '-vf', 'fps=7,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer', '-loop', '0', resolve(output, 'agent-state-edit.gif')], { stdio: 'ignore' });
  await writeFile(resolve(output, 'capture.json'), JSON.stringify({ fixture: 'tests/apps/svelte/state-edit.html', clips, toolFlow: ['svelte_status', 'svelte_components', 'svelte_set_state'], assertions: ['first instance 1→7; sibling stays 1', 'undo 1/2 at count 1; redo 2/2 at count 7', 'real response 200; enabled mock 201; disabled mock 200'], crop, authenticationExcluded: true }, null, 2) + '\n');
  console.log('Recorded and verified actual MCP edit/undo/redo and request-to-mock workflows.');
} finally {
  await client?.close(); await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}
