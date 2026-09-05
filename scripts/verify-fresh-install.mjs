#!/usr/bin/env node
/** Verify a separately installed app with the counter from the fresh-install validation. */
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDevToolsPanel } from '../tests/e2e/panel-helpers.mjs';

const [base, serverLog, version, output = '/tmp/svelte-fresh-install'] = process.argv.slice(2);
if (!base || !serverLog || !version || !process.env.SVELTE_DEVTOOLS_TOKEN) {
  throw new Error('Set SVELTE_DEVTOOLS_TOKEN; pass app URL, server log path, expected version, and optional output directory.');
}
mkdirSync(output, {recursive: true});
const headers = {Authorization: `Bearer ${process.env.SVELTE_DEVTOOLS_TOKEN}`};
async function api(path) {
  const response = await fetch(`${base}/__svelte-devtools/api/${path}`, {headers});
  assert.equal(response.status, 200, path);
  const data = await response.json(); assert.equal(data.ok, true, path); return data;
}
const readCode = () => [...readFileSync(serverLog, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').matchAll(/devframe auth code\s*(\d{6})/g)].at(-1)?.[1] ?? '';
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const frame = await openDevToolsPanel(page, base, readCode);
  await expect(frame.getByText('9 agent tools', {exact: true})).toBeVisible();
  await expect(page.getByTestId('count')).toHaveText('0');
  await page.getByRole('button', {name: 'Increment', exact: true}).evaluate(button => button.click());
  await expect(page.getByTestId('count')).toHaveText('1');
  let component;
  await expect.poll(async () => {
    component = (await api('components')).components.find(item => item.name === '+page');
    return component?.state.count;
  }, {timeout: 15000}).toBe(1);
  assert.equal(component.state.doubled, 2);
  const status = await api(''); assert.equal(status.version, version);
  const components = await api('components');
  const events = await api('timeline'); assert.ok(events.count > 0);
  const routes = await api('routes'); assert.ok(routes.count > 0);
  const server = await api('server-events'); assert.ok(server.events.length > 0);
  await page.screenshot({path: resolve(output, 'app-and-panel.png')});
  await frame.locator('.panel').screenshot({path: resolve(output, 'panel.png')});
  await frame.getByRole('button', {name: 'Components', exact: true}).click();
  await expect(frame.getByText('+page', {exact: true}).first()).toBeVisible();
  await frame.locator('.panel').screenshot({path: resolve(output, 'components.png')});
  assert.deepEqual(errors, []);
  const results = {version: status.version, componentCount: components.count, state: component.state,
    timelineCount: events.count, routes: routes.count, serverEvents: server.events.length, pageErrors: errors,
    checks: ['dock authorization', 'updated dashboard', 'hydration and counter interaction', 'live state and derived value in authenticated API', 'rendered component tree']};
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {await browser.close();}
