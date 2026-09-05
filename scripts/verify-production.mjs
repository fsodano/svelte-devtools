import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

// Build both fixtures before running. This script never rebuilds shared outputs.
const temporary = await mkdtemp(join(tmpdir(), 'svelte-production-'));
const servers = [];
let browser;
const checks = [];
async function start(app, port) {
  const cwd = resolve('tests/apps', app);
  const child = spawn(resolve(cwd, 'node_modules/.bin/vite'), ['preview', '--port', String(port), '--strictPort'], {
    cwd, env: { ...process.env, TODO_SQLITE_DB_PATH: join(temporary, 'todos.db') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  servers.push(child);
  let log = '';
  child.stdout.on('data', data => log += data); child.stderr.on('data', data => log += data);
  const base = `http://localhost:${port}`;
  await expect.poll(async () => {
    if (child.exitCode !== null) throw new Error(log);
    try { return (await fetch(base)).status; } catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
  return base;
}
try {
  const originalFetch = globalThis.fetch;
  const { noopHandle } = await import('../packages/vite-plugin/dist/sveltekit.js');
  const handle = noopHandle();
  const expected = new Response('untouched');
  expect(await handle({ event: {}, resolve: async () => expected })).toBe(expected);
  expect(globalThis.fetch).toBe(originalFetch);
  checks.push('Importing the built no-op handle preserves native fetch and response identity');

  const kit = await start('svelte-kit', 5185);
  const todo = await start('todo-sqlite', 5186);
  browser = await chromium.launch({ headless: true });
  for (const base of [kit, todo]) {
    const html = await (await fetch(base)).text();
    expect(html).not.toContain('/__svelte-devtools/');
    expect(html).not.toContain('/@svelte-devtools-navigation-bridge');
    for (const path of ['/__svelte-devtools/api/', '/__svelte-devtools/svelte-runtime.js', '/__svelte-devtools/']) {
      expect((await fetch(base + path)).status).toBe(404);
    }
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    if (base === kit) {
      await page.getByRole('button', { name: /Increase/ }).click();
      await expect(page.locator('.counter-digits strong:not(.hidden)')).toHaveText('1');
    } else {
      const title = 'Production preview isolation';
      await page.getByRole('textbox', { name: 'New todo title' }).fill(title);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.locator('li').filter({ hasText: title })).toHaveCount(1);
      expect(await (await fetch(base)).text()).toContain(title);
    }
    expect(await page.evaluate(() => ({
      runtime: typeof window.__SVELTE_DEVTOOLS_RUNTIME__,
      bridge: typeof window.__SVELTE_DEVTOOLS__,
      dock: !!document.querySelector('vite-devtools-dock-embedded'),
      injected: [...document.scripts].some(script => script.src.includes('__svelte-devtools') || script.src.includes('@svelte-devtools')),
    }))).toEqual({ runtime: 'undefined', bridge: 'undefined', dock: false, injected: false });
    expect(errors).toEqual([]);
    await page.close();
  }
  checks.push('Kit and Todo production previews render and hydrate, with working counter and persistent Todo creation');
  checks.push('Both previews omit DevTools scripts, globals, and dock; panel, runtime, and API paths return 404');
  console.log(JSON.stringify({ checks, database: join(temporary, 'todos.db') }, null, 2));
} finally {
  await browser?.close();
  for (const child of servers) if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
}
