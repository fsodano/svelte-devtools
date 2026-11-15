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

/**
 * Find a node in the component graph and return its centre in page coordinates.
 *
 * vis-network draws the nodes on a canvas, so there is no DOM element to
 * select. The nodes use the Svelte brand color, so the test finds them by
 * pixel and returns the centre of the largest cluster. Returns null when the
 * graph has no node yet.
 */
export async function findGraphNodePoint(frame, page) {
  const canvas = frame.locator('.graph-container canvas');
  if (!(await canvas.count())) return null;
  const box = await canvas.boundingBox();
  if (!box) return null;

  const point = await canvas.evaluate((element) => {
    const context = element.getContext('2d');
    const { width, height } = element;
    const data = context.getImageData(0, 0, width, height).data;
    const pixels = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const red = data[offset], green = data[offset + 1], blue = data[offset + 2], alpha = data[offset + 3];
        if (alpha > 200 && red > 230 && green > 40 && green < 90 && blue < 40) pixels.push([x, y]);
      }
    }
    if (!pixels.length) return null;

    // Group the node pixels into clusters, then use the biggest one.
    const radius = 26;
    const groups = [];
    for (const pixel of pixels) {
      let group = groups.find((candidate) =>
        candidate.some((other) => Math.hypot(other[0] - pixel[0], other[1] - pixel[1]) <= radius));
      if (!group) { group = []; groups.push(group); }
      group.push(pixel);
    }
    groups.sort((a, b) => b.length - a.length);
    const largest = groups[0];
    return {
      x: largest.reduce((sum, pixel) => sum + pixel[0], 0) / largest.length,
      y: largest.reduce((sum, pixel) => sum + pixel[1], 0) / largest.length,
      width,
      height,
    };
  });

  if (!point) return null;
  return {
    x: box.x + point.x * (box.width / point.width),
    y: box.y + point.y * (box.height / point.height),
  };
}

