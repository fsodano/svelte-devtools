import { openDevToolsPanel } from '../tests/e2e/panel-helpers.mjs';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Requires a built client and the SvelteKit app in tmux session `svelte-kit`, port 5174.
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  const frame = await openDevToolsPanel(page, 'http://localhost:5174/', () => {
    const log = execFileSync('tmux', ['capture-pane', '-t', 'svelte-kit', '-p', '-S', '-200'], { encoding: 'utf8' });
    return [...log.matchAll(/devframe auth code\s*(\d{6})/g)].at(-1)?.[1] ?? '';
  });
  await frame.locator('button', { hasText: 'Time Travel' }).click();
  await page.waitForTimeout(1000);
  await frame.locator('.record-btn').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label')?.includes('Increase'))?.click());
  await page.waitForTimeout(5000);
  assert.equal((await frame.locator('.count').textContent())?.trim(), '2 / 2');
  await frame.locator('.tb-btn').first().click();
  await page.waitForTimeout(4000);
  assert.equal((await frame.locator('.count').textContent())?.trim(), '1 / 2');
  assert.equal((await page.locator('.counter-digits strong:not(.hidden)').textContent())?.trim(), '0');
  await frame.locator('.tb-btn').nth(1).click();
  await page.waitForTimeout(5000);
  assert.equal((await frame.locator('.count').textContent())?.trim(), '2 / 2');
  assert.equal((await page.locator('.counter-digits strong:not(.hidden)').textContent())?.trim(), '1');
  console.log('Time travel passed: record 2/2; undo 1/2 at 0; redo 2/2 at 1, no phantom snapshot.');
} finally { await browser.close(); }
