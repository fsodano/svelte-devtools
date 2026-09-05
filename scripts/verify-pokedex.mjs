import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { openDevToolsPanel } from '../tests/e2e/panel-helpers.mjs';

// Start the built Pokédex fixture on 5176 with SVELTE_DEVTOOLS_TOKEN below.
const base = 'http://localhost:5176';
const token = 'svelte-devtools-local-audit-token';
const output = '/tmp/svelte-devtools-pokedex-qa';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
try {
  // Keep the real app and runtime. Stabilize only its external browser data and images.
  await page.route('https://pokeapi.co/api/v2/**', async route => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.match(/pokemon\/(\d+)/)?.[1]);
    const body = id ? {
      id, name: `pokemon-${id}`, height: 7, weight: 69,
      types: [{ slot: 1, type: { name: 'grass', url: '' } }], stats: [], abilities: [],
      sprites: { front_default: '', front_shiny: '', other: { 'official-artwork': { front_default: '' } } }, cries: {},
    } : { count: 20, results: Array.from({ length: 20 }, (_, i) => ({ name: `pokemon-${i + 1}`, url: `https://pokeapi.co/api/v2/pokemon/${i + 1}/` })) };
    await route.fulfill({ json: body });
  });
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><circle cx="48" cy="48" r="40" fill="#79b88b"/></svg>' }));
  const frame = await openDevToolsPanel(page, base, () => {
    const log = readFileSync('/tmp/svelte-audit-pokedex-server.log', 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
    return [...log.matchAll(/devframe auth code\s*(\d{6})/g)].at(-1)?.[1] ?? '';
  });
  const api = async () => (await fetch(`${base}/__svelte-devtools/api/components`, { headers: { Authorization: `Bearer ${token}` } })).json();
  await expect.poll(async () => (await api()).components.filter(c => c.name === 'PokemonCard').length, { timeout: 20000 }).toBe(20);
  const components = (await api()).components;
  const cards = components.filter(c => c.name === 'PokemonCard');
  expect(new Set(cards.map(c => c.id)).size).toBe(20);
  const routePage = components.find(c => c.filename?.endsWith('/routes/+page.svelte'));
  const layout = components.find(c => c.filename?.endsWith('/routes/+layout.svelte'));
  expect(routePage.parentId).toBe(layout.id);
  expect(cards.every(c => c.parentId === routePage.id)).toBe(true);
  await frame.locator('.sidebar button[title="Info"]').click();
  await frame.locator('html').screenshot({ path: `${output}/dashboard-wide.png` });
  for (const card of cards) {
    const element = page.locator(`article[data-svelte-devtools-id="${card.id}"]`);
    await expect(element).toHaveCount(1);
    await frame.getByRole('button', { name: 'Inspect components', exact: true }).click();
    await element.dispatchEvent('pointerover');
    await element.dispatchEvent('click');
    await expect(frame.locator('.component-row.selected')).toHaveAttribute('aria-label', 'Select PokemonCard component');
    await frame.getByRole('button', { name: 'Props', exact: true }).click();
    await expect(frame.locator('.props-list')).toContainText(card.props.name);
  }
  await frame.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(frame.getByRole('button', { name: /Open PokemonCard.svelte.*in editor/ })).toBeVisible();
  await frame.locator('html').screenshot({ path: `${output}/components-wide.png` });
  await frame.locator('.sidebar button[title="Graph"]').click();
  await frame.locator('html').screenshot({ path: `${output}/graph-wide.png` });
  await page.setViewportSize({ width: 760, height: 900 });
  await frame.locator('.sidebar button[title="Network"]').click();
  await page.evaluate(() => fetch('/?network-inspection=1'));
  const request = frame.locator('.entry-row').first();
  await request.click();
  await frame.locator('html').screenshot({ path: `${output}/network-narrow.png` });
  console.log(`Pokédex passed: 20 distinct cards selected, card→page→layout ancestry, source navigation. Screenshots: ${output}`);
} finally { await browser.close(); }
