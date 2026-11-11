import { expect, type Locator, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

/** Open the Compare page and wait until offers are listed. */
export async function openCompare(page: Page, query = 'from=jupiter&to=saturn') {
  await page.goto(`/?${query}`);
  // Either a count, or the empty state when the filters match nothing.
  await expect(page.getByRole('status').filter({ hasText: /plans? from|No plans match/ })).toBeVisible();
}

export const offerRows = (page: Page) => page.locator('table tbody tr:has(input[type=checkbox])');

/** The monthly price of every listed offer, in table order, as numbers. */
export async function prices(page: Page): Promise<number[]> {
  const cells = await page.locator('table tbody tr:has(input[type=checkbox]) td:nth-child(4)').allTextContents();
  return cells.map((text) => Number(text.replace(/[^0-9]/g, '')));
}

/**
 * The share of pixels in an element that differ from its top-left corner. A blank canvas is 0.
 * Reading the screenshot, not the canvas, means this sees exactly what a visitor sees.
 */
export async function inkShare(locator: Locator): Promise<number> {
  const png = PNG.sync.read(await locator.screenshot());
  const [r, g, b] = [png.data[0], png.data[1], png.data[2]];
  let ink = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (Math.abs(png.data[i] - r) + Math.abs(png.data[i + 1] - g) + Math.abs(png.data[i + 2] - b) > 30) ink += 1;
  }
  return ink / (png.width * png.height);
}

/** Wait for a map canvas to start, then for it to have drawn something. */
export async function expectMapDrawn(canvas: Locator) {
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => inkShare(canvas), { timeout: 15_000, message: 'the map canvas stayed blank' }).toBeGreaterThan(0.002);
}

export async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

/** WebKit headless may have no WebGL; the app must say so and carry on. */
export async function mapUnavailable(page: Page): Promise<boolean> {
  return page.getByText('The map could not start in this browser').first().isVisible();
}
