import { chromium, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openDevToolsPanel } from '../tests/e2e/panel-helpers.mjs';

// Build the workspaces and install both fixtures first. Never opens the user's database.
const temporary = await mkdtemp(join(tmpdir(), 'svelte-ssr-sql-'));
const token = randomUUID();
const servers = [];
let browser;
let mcp;
const evidence = { database: 'isolated temporary SQLite database', checks: [] };
async function start(app, port, extra = {}) {
  const cwd = resolve(`tests/apps/${app}`);
  const process = spawn(resolve(cwd, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--clearScreen', 'false'], {
    cwd, env: { ...globalThis.process.env, SVELTE_DEVTOOLS_TOKEN: token, ...extra }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  servers.push(process);
  let log = '';
  process.stdout.on('data', value => log += value); process.stderr.on('data', value => log += value);
  const base = `http://localhost:${port}`;
  await expect.poll(async () => {
    if (process.exitCode !== null) throw new Error(`Fixture ${app} exited: ${log}`);
    try { return (await fetch(base)).status; } catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
  return { base, code: () => [...log.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/devframe auth code\s*(\d{6})/g)].at(-1)?.[1] ?? '', log: () => log };
}
const api = async (base, path, init = {}) => {
  const response = await fetch(`${base}/__svelte-devtools/api/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  expect(response.ok).toBe(true);
  return response.json();
};
const events = async base => (await api(base, 'server-events?last=1000')).events;
try {
  console.log('Starting isolated SSR and SQLite fixtures');
  const kit = await start('svelte-kit', 5183);
  const todo = await start('todo-sqlite', 5184, { TODO_SQLITE_DB_PATH: join(temporary, 'todos.db') });
  browser = await chromium.launch({ headless: true });

  // Real initial HTML and streamed completion before any browser executes JavaScript.
  const response = await fetch(`${kit.base}/devtools-check?label=initial-html`);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('initial-html');
  expect(html).toContain('Stream complete');
  for (const source of ['/__svelte-devtools/svelte-runtime.js', '/@svelte-devtools-navigation-bridge']) {
    expect(html.split(`src="${source}"`).length - 1).toBe(1);
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJs.newPage();
  await staticPage.goto(`${kit.base}/devtools-check?label=no-javascript`);
  await expect(staticPage.getByTestId('ssr-label')).toHaveText('no-javascript');
  await expect(staticPage.getByTestId('ssr-echo')).toHaveText('no-javascript');
  await noJs.close();
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('Initial SSR HTML contains loaded data without JavaScript; streamed HTML injects each DevTools script once');

  const kitPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  kitPage.on('pageerror', error => errors.push(error.message));
  const kitFrame = await openDevToolsPanel(kitPage, `${kit.base}/devtools-check?label=hydrated`, kit.code);
  await expect(kitPage.getByTestId('stream-result')).toHaveText('Stream complete');
  await kitPage.getByRole('button', { name: 'Hydration count: 0' }).evaluate(button => button.click());
  await expect(kitPage.getByRole('button', { name: 'Hydration count: 1' })).toBeVisible();
  await kitPage.getByRole('link', { name: 'About this app' }).evaluate(link => link.click());
  await expect(kitPage).toHaveURL(`${kit.base}/about`);
  expect(errors).toEqual([]);
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('Hydration state update and client navigation complete without page errors');

  expect((await fetch(`${kit.base}/devtools-check/response?redirect=1`, { redirect: 'manual' })).status).toBe(307);
  expect((await fetch(`${kit.base}/devtools-check/response?error=1`)).status).toBe(418);
  const upload = 'upload-'.repeat(1000);
  const uploaded = await fetch(`${kit.base}/devtools-check/response`, { method: 'POST', body: upload });
  expect(uploaded.status).toBe(201); expect(await uploaded.text()).toBe(upload);
  const dataResponse = await fetch(`${kit.base}/devtools-check/__data.json?label=data-navigation`);
  expect(dataResponse.status).toBe(200); expect(await dataResponse.text()).toContain('data-navigation');
  const stream = await fetch(`${kit.base}/devtools-check/response?stream=1`);
  const reader = stream.body.getReader();
  const firstChunk = new TextDecoder().decode((await reader.read()).value);
  expect(firstChunk).toContain('data: first');
  let remaining = firstChunk;
  while (true) { const item = await reader.read(); if (item.done) break; remaining += new TextDecoder().decode(item.value); }
  expect(remaining).toContain('data: second');
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('Redirect, error, data response, upload body, and SSE response remain intact');

  await api(kit.base, 'server-events', { method: 'DELETE' });
  await Promise.all(['concurrent-a', 'concurrent-b'].map(label => fetch(`${kit.base}/devtools-check?label=${label}`).then(r => r.text())));
  let roots;
  await expect.poll(async () => {
    const all = await events(kit.base);
    roots = all.filter(e => e.data?._handler === 'sveltekit' && /^\/devtools-check\?label=concurrent-/.test(e.data.url));
    return roots.length;
  }).toBe(2);
  expect(new Set(roots.map(e => e.data.traceId)).size).toBe(2);
  const correlated = await events(kit.base);
  for (const root of roots) {
    expect(root.data.spanId).toBeTruthy();
    expect(correlated.some(e => e.id !== root.id && e.data?.traceId === root.data.traceId && e.data?.parentSpanId)).toBe(true);
  }
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('Concurrent same-route SSR requests have distinct traces and correlated server fetch children');
  await kitPage.close();

  const todoPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  todoPage.on('pageerror', error => errors.push(error.message));
  const frame = await openDevToolsPanel(todoPage, todo.base, todo.code);
  await frame.locator('.sidebar button[title="Settings"]').click();
  await frame.getByLabel('Theme', { exact: true }).selectOption('dark');
  await frame.getByRole('button', { name: 'Large', exact: true }).click();
  await api(todo.base, 'server-events', { method: 'DELETE' });
  const nativeContext = await browser.newContext({ javaScriptEnabled: false });
  const nativePage = await nativeContext.newPage();
  await nativePage.goto(todo.base);
  await nativePage.getByRole('textbox', { name: 'New todo title' }).fill('Native form verification');
  await nativePage.getByRole('button', { name: 'Add', exact: true }).click();
  const nativeRow = nativePage.locator('li').filter({ hasText: 'Native form verification' });
  await expect(nativeRow).toHaveCount(1);
  await nativeRow.getByRole('button', { name: 'Mark as complete', exact: true }).click();
  await expect(nativeRow.getByRole('button', { name: 'Mark as incomplete', exact: true })).toBeVisible();
  await nativeRow.getByRole('button', { name: 'Delete Native form verification', exact: true }).click();
  await expect(nativeRow).toHaveCount(0);
  await nativeContext.close();
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('Todo create, toggle, and delete also work through native forms with JavaScript disabled');
  const title = `SQL verification ${randomUUID()}`;
  await todoPage.getByRole('textbox', { name: 'New todo title' }).fill(title);
  await todoPage.getByRole('button', { name: 'Add', exact: true }).evaluate(button => button.click());
  let row = todoPage.locator('li').filter({ hasText: title });
  await expect(row).toHaveCount(1);
  const todoId = await row.locator('input[name="id"]').first().inputValue();
  row = todoPage.locator('li').filter({ has: todoPage.locator(`input[name="id"][value="${todoId}"]`) });
  await row.getByRole('button', { name: 'Mark as complete', exact: true }).evaluate(button => button.click());
  await expect(row.getByRole('button', { name: 'Mark as incomplete', exact: true })).toBeVisible();
  await row.getByRole('button', { name: title, exact: true }).evaluate(button => button.click());
  await row.getByRole('textbox', { name: 'Edit title' }).fill(`${title} edited`);
  await row.getByRole('button', { name: 'Save', exact: true }).evaluate(button => button.click());
  await expect(row).toContainText(`${title} edited`);
  expect(await (await fetch(todo.base)).text()).toContain(`${title} edited`);
  await row.getByRole('button', { name: `Delete ${title} edited`, exact: true }).evaluate(button => button.click());
  await expect(row).toHaveCount(0);
  await expect.poll(async () => (await events(todo.base)).filter(e => e.type === 'server:sql').length).toBeGreaterThanOrEqual(6);
  const sqlEvents = (await events(todo.base)).filter(e => e.type === 'server:sql');
  for (const command of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) expect(sqlEvents.some(e => e.data.statement?.startsWith(command))).toBe(true);
  await expect.poll(async () => {
    const all = await events(todo.base);
    return sqlEvents.every(sql => all.some(e => e.data?.spanId === sql.data.parentSpanId && e.data.traceId === sql.data.traceId));
  }).toBe(true);
  const allTodoEvents = await events(todo.base);
  for (const sql of sqlEvents) {
    expect(sql.duration).toBeGreaterThanOrEqual(0);
    expect(sql.data.traceId).toBeTruthy(); expect(sql.data.spanId).toBeTruthy();
    expect(allTodoEvents.some(e => e.data?.spanId === sql.data.parentSpanId && e.data.traceId === sql.data.traceId)).toBe(true);
    expect(JSON.stringify(sql)).not.toContain(title);
  }
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('Real SQLite CRUD persists and emits measured SELECT/INSERT/UPDATE/DELETE spans with correct parents and no bound values');

  for (const [action, fields, status] of [
    ['create', { title: ' ' }, 400], ['toggle', { id: '1junk' }, 400], ['update', { id: '0', title: 'invalid' }, 400], ['delete', { id: '999999' }, 404],
  ]) {
    const result = await fetch(`${todo.base}/?/${action}`, { method: 'POST', headers: { Origin: todo.base, Accept: 'application/json', 'x-sveltekit-action': 'true' }, body: new URLSearchParams(fields) });
    expect((await result.json()).status).toBe(status);
    const native = await fetch(`${todo.base}/?/${action}`, { method: 'POST', headers: { Origin: todo.base, Accept: 'text/html' }, body: new URLSearchParams(fields) });
    expect(native.status).toBe(status);
    await native.text();
  }
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('Invalid and missing-row actions report real SvelteKit failures');

  mcp = new Client({ name: 'ssr-sql-verification', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('packages/mcp/dist/cli.js')], env: { ...process.env, SVELTE_DEVTOOLS_URL: todo.base, SVELTE_DEVTOOLS_TOKEN: token } }));
  const result = await mcp.callTool({ name: 'svelte_server_events', arguments: { last: 500 } });
  expect(result.isError).not.toBe(true);
  const payload = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
  expect(payload.events.some(e => e.id === sqlEvents[0].id)).toBe(true);
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('Actual MCP stdio server returns the same SQL span IDs as the authenticated HTTP API');

  await frame.locator('.sidebar button[title="Network"]').click();
  // The production UI contract is checked here after its trace implementation is integrated.
  await frame.getByRole('button', { name: 'SQL', exact: true }).click();
  const sqlRow = frame.locator('.entry-row').filter({ hasText: 'SELECT' }).first();
  await expect(sqlRow).toBeVisible();
  await sqlRow.click();
  await expect(frame.getByRole('region', { name: 'Server trace details' })).toBeVisible();
  await expect(frame.locator('.sql')).toContainText('SELECT');
  await expect(frame.getByText('Trace waterfall', { exact: true })).toBeVisible();
  const displayedTrace = await frame.locator('.identifiers dd code').first().textContent();
  const expectedSpans = (await events(todo.base)).filter(e => e.data?.traceId === displayedTrace);
  await expect(frame.locator('.span-row')).toHaveCount(expectedSpans.length);
  expect(expectedSpans.length).toBeGreaterThan(1);
  await expect(frame.getByRole('button', { name: 'Mock this request', exact: true })).toHaveCount(0);
  const splitter = frame.getByRole('separator', { name: 'Resize network request panels' });
  const beforeResize = await frame.getByRole('region', { name: 'Server trace details' }).boundingBox();
  await splitter.press('ArrowLeft');
  const afterResize = await frame.getByRole('region', { name: 'Server trace details' }).boundingBox();
  expect(afterResize.width).toBeGreaterThan(beforeResize.width);
  for (const entry of await todoPage.locator('vite-devtools-dock-embedded .vite-devtools-dock-entry').all()) await entry.dispatchEvent('pointerleave');
  await frame.getByText('Trace waterfall', { exact: true }).click();
  await todoPage.mouse.move(10, 10);
  await frame.locator('.network-panel').screenshot({ path: join(temporary, 'sql-network.png') });
  await todoPage.setViewportSize({ width: 780, height: 900 });
  await expect.poll(() => frame.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(frame.getByRole('separator', { name: 'Resize network request panels' })).toHaveAttribute('aria-orientation', 'horizontal');
  await frame.locator('.network-panel').screenshot({ path: join(temporary, 'sql-network-narrow.png') });
  console.log('Verified check', evidence.checks.length + 1); evidence.checks.push('SQL detail and waterfall match API trace IDs and span count; detail pane resizes and never offers fetch mocks');
  expect(errors).toEqual([]);
  await writeFile(join(temporary, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ...evidence, artifacts: temporary }, null, 2));
} finally {
  await mcp?.close(); await browser?.close();
  for (const server of servers) if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve));
  }
}
