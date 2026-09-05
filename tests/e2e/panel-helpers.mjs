import { expect } from '@playwright/test';

// Supported @vitejs/devtools 0.4.8: six-digit terminal code, then named dock tooltip.
export async function openDevToolsPanel(page, url, capturedToken) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const dock = page.locator('vite-devtools-dock-embedded');
  await dock.waitFor({ state: 'attached' });
  await expect(dock.getByRole('button', { name: /Unauthorized/, includeHidden: true })).toBeAttached();
  await expect.poll(capturedToken).not.toBe('');
  await dock.getByRole('button', { name: /Unauthorized/, includeHidden: true }).evaluate((button) => button.click());
  await expect.poll(async () => {
    for (const candidate of page.frames()) {
      if (await candidate.getByRole('textbox', { name: 'Digit 1 of 6', exact: true }).count()) return true;
    }
    return false;
  }).toBe(true);
  let auth = page.mainFrame();
  for (const candidate of page.frames()) {
    if (await candidate.getByRole('textbox', { name: 'Digit 1 of 6', exact: true }).count()) { auth = candidate; break; }
  }
  for (let index = 0; index < 6; index++) {
    await auth.getByRole('textbox', { name: `Digit ${index + 1} of 6`, exact: true }).fill(capturedToken()[index]);
  }
  await expect(dock.getByRole('button', { name: /Unauthorized/, includeHidden: true })).toHaveCount(0);
  const entries = dock.locator('.vite-devtools-dock-entry');
  await expect.poll(async () => {
    for (const entry of await entries.all()) {
      await entry.dispatchEvent('pointerenter');
      if (await dock.locator('.z-floating-tooltip').filter({ hasText: /^Svelte$/ }).count()) {
        await entry.locator('button').evaluate((button) => button.click());
        return true;
      }
      await entry.dispatchEvent('pointerleave');
    }
    return false;
  }, { message: 'Svelte dock entry must be registered', timeout: 15000 }).toBe(true);
  await expect.poll(() => page.frames().some((frame) => frame.url().includes('__svelte-devtools'))).toBe(true);
  const frame = page.frames().find((candidate) => candidate.url().includes('__svelte-devtools'));
  await frame.locator('.sidebar').waitFor();
  return frame;
}

